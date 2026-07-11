import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type ClientSession } from 'mongoose';
import {
  ADMIN_AUDIT_ACTOR_TYPES,
  AdminAuditLog,
  type AdminAuditActorType,
} from '@/database/schemas/admin-audit-log.schema';

export interface RecordAdminAuditParams {
  actorType?: AdminAuditActorType;
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  changes?: Record<string, string | number | boolean | null>;
  requestId?: string | null;
  session?: ClientSession;
}

@Injectable()
export class AdminAuditService {
  constructor(
    @InjectModel(AdminAuditLog.name)
    private readonly auditModel: Model<AdminAuditLog>,
  ) {}

  async record(params: RecordAdminAuditParams): Promise<void> {
    await new this.auditModel({
      actorType: params.actorType ?? ADMIN_AUDIT_ACTOR_TYPES.ADMIN,
      actorUserId: params.actorUserId ?? null,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      reason: params.reason,
      changes: params.changes ?? {},
      requestId: params.requestId ?? null,
    }).save({ session: params.session });
  }

  async list(page: number, pageSize: number) {
    const [items, total] = await Promise.all([
      this.auditModel
        .find()
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      this.auditModel.countDocuments(),
    ]);

    return {
      items,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }
}
