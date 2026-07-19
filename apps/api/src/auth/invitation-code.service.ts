import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'node:crypto';
import type { ClientSession, FilterQuery, Model } from 'mongoose';
import { InvitationCode } from '@/database/schemas/invitation-code.schema';
import { hashOpaqueToken } from './auth-security';
import { Agent } from '@/database/schemas/agent.schema';
import {
  ADMIN_AUDIT_ACTOR_TYPES,
  AdminAuditLog,
} from '@/database/schemas/admin-audit-log.schema';
import { ADMIN_AUDIT_ACTIONS } from '@/admin/admin.constants';
import { authErrors } from '@/common/errors/business-errors';

@Injectable()
export class InvitationCodeService {
  constructor(
    @InjectModel(InvitationCode.name)
    private readonly invitationModel: Model<InvitationCode>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(AdminAuditLog.name)
    private readonly auditModel: Model<AdminAuditLog>,
  ) {}

  async create(createdByUserId: string, expiresAt?: string) {
    const expiration = expiresAt ? new Date(expiresAt) : null;
    if (expiration && expiration.getTime() <= Date.now()) {
      throw authErrors.invitationExpiryInvalid();
    }
    const code = `sky_inv_${randomBytes(18).toString('base64url')}`;
    const item = await new this.invitationModel({
      codeDigest: hashOpaqueToken(code),
      prefix: code.slice(0, 12),
      expiresAt: expiration,
      createdByUserId,
    }).save();
    return { ...this.serialize(item), code };
  }

  async list(page = 1, pageSize = 20, status?: string) {
    const now = new Date();
    const where: FilterQuery<InvitationCode> = {};
    if (status === 'AVAILABLE') Object.assign(where, { usedAt: null, revokedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] });
    if (status === 'USED') where.usedAt = { $ne: null };
    if (status === 'REVOKED') where.revokedAt = { $ne: null };
    if (status === 'EXPIRED') Object.assign(where, { usedAt: null, revokedAt: null, expiresAt: { $lte: now } });
    const [items, total] = await Promise.all([
      this.invitationModel.find(where).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
      this.invitationModel.countDocuments(where),
    ]);
    const userIds = items.flatMap((item) => item.usedByUserId ? [item.usedByUserId] : []);
    const agents = await this.agentModel.find({ userId: { $in: userIds } }).select('userId').lean();
    const agentByUserId = new Map(agents.map((agent) => [agent.userId, agent._id.toString()]));
    return {
      items: items.map((item) => ({ ...this.serialize(item), usedByAgentId: item.usedByUserId ? agentByUserId.get(item.usedByUserId) ?? null : null })),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async revoke(id: string) {
    const item = await this.invitationModel.findOneAndUpdate(
      { _id: id, usedAt: null, revokedAt: null },
      { $set: { revokedAt: new Date() } },
      { new: true },
    );
    if (!item) throw authErrors.invitationNotRevocable();
    return this.serialize(item);
  }

  async consume(code: string, userId: string, session: ClientSession): Promise<void> {
    const item = await this.invitationModel.findOneAndUpdate(
      {
        codeDigest: hashOpaqueToken(code.trim()),
        usedAt: null,
        revokedAt: null,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      },
      { $set: { usedAt: new Date(), usedByUserId: userId } },
      { new: true, session },
    );
    if (!item) throw authErrors.invitationInvalid();
    await new this.auditModel({
      actorType: ADMIN_AUDIT_ACTOR_TYPES.USER,
      actorUserId: userId,
      action: ADMIN_AUDIT_ACTIONS.INVITATION_CODE_USED,
      targetType: 'INVITATION_CODE',
      targetId: item.id,
      reason: null,
      changes: { prefix: item.prefix, status: 'USED' },
    }).save({ session });
  }

  private serialize(item: InvitationCode) {
    const status = item.usedAt ? 'USED' : item.revokedAt ? 'REVOKED' : item.expiresAt && item.expiresAt.getTime() <= Date.now() ? 'EXPIRED' : 'AVAILABLE';
    return {
      id: item.id,
      prefix: item.prefix,
      maskedCode: `${item.prefix}••••••••`,
      status,
      expiresAt: item.expiresAt?.toISOString() ?? null,
      usedAt: item.usedAt?.toISOString() ?? null,
      usedByUserId: item.usedByUserId,
      createdAt: item.createdAt.toISOString(),
    };
  }
}
