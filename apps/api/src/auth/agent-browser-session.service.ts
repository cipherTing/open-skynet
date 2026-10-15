import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { Agent, type AgentDocument } from '@/database/schemas/agent.schema';
import {
  AgentBrowserSession,
  type AgentBrowserSessionDocument,
} from '@/database/schemas/agent-browser-session.schema';
import { User, USER_ROLES, type UserRole } from '@/database/schemas/user.schema';
import { authErrors } from '@/common/errors/business-errors';
import { AgentKeyAuthService } from './agent-key-auth.service';
import { isUserSuspended } from './auth-security';

const AGENT_BROWSER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AGENT_BROWSER_SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const AGENT_REFRESH_REPLAY_GRACE_MS = 10_000;
const AGENT_REFRESH_TOKEN_PREFIX = 'sk_agt_rt_v1';
const AGENT_REFRESH_TOKEN_VERSION = 1;
const AGENT_REFRESH_SELECTOR_BYTES = 24;
const AGENT_REFRESH_SECRET_BYTES = 32;
const AGENT_REFRESH_SELECTOR_LENGTH = 32;
const AGENT_REFRESH_SECRET_LENGTH = 43;
const AGENT_REFRESH_ROTATION_ATTEMPTS = 4;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;

interface ParsedAgentRefreshToken {
  selector: string;
  selectorHash: string;
  secretHash: string;
}

export interface ActiveAgentBrowserUser {
  id: string;
  username: string;
  role: UserRole;
  tokenVersion: number;
  agentId: string;
  suspendedAt: Date | null;
  suspendedUntil: Date | null;
}

export interface AgentBrowserAuthResult {
  sessionType: 'AGENT';
  user: null;
  agent: {
    id: string;
    name: string;
    description: string;
    favoritesPublic: boolean;
    ownerOperationEnabled: boolean;
    avatarSeed: string;
    createdAt: string;
  };
  token: string;
  refreshToken: string | null;
  refreshExpiresAt: Date;
}

@Injectable()
export class AgentBrowserSessionService {
  constructor(
    @InjectModel(AgentBrowserSession.name)
    private readonly agentBrowserSessionModel: Model<AgentBrowserSession>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly jwtService: JwtService,
    private readonly agentKeyAuthService: AgentKeyAuthService,
  ) {}

  async loginWithAgentKey(agentKey: string): Promise<AgentBrowserAuthResult> {
    const identity = await this.agentKeyAuthService.authenticate(agentKey);
    if (!identity) throw authErrors.invalidCredentials();

    const agent = await this.agentModel.findOne({
      _id: identity.agentId,
      userId: identity.userId,
      deletedAt: null,
    });
    if (!agent || typeof agent.secretKeyVersion !== 'number') {
      throw authErrors.invalidCredentials();
    }

    const session = await this.createSession(
      identity.agentId,
      identity.userId,
      agent.secretKeyVersion,
    );
    return this.buildAuthResult(
      {
        id: identity.userId,
        username: identity.username,
        role: USER_ROLES.USER,
        agentId: identity.agentId,
      },
      agent,
      session.id,
      session.refreshToken,
      session.expiresAt,
    );
  }

  async findActiveAgentBrowserUser(
    agentId: string,
    agentBrowserSessionId?: string,
  ): Promise<ActiveAgentBrowserUser | null> {
    if (
      !agentBrowserSessionId ||
      !isValidObjectId(agentBrowserSessionId) ||
      !isValidObjectId(agentId)
    ) {
      return null;
    }

    const now = new Date();
    const users = await this.agentBrowserSessionModel
      .aggregate<ActiveAgentBrowserUser>([
        {
          $match: {
            _id: new Types.ObjectId(agentBrowserSessionId),
            agentId,
            refreshTokenVersion: AGENT_REFRESH_TOKEN_VERSION,
            revokedAt: null,
            expiresAt: { $gt: now },
            absoluteExpiresAt: { $gt: now },
          },
        },
        {
          $lookup: {
            from: this.agentModel.collection.name,
            let: {
              sessionAgentId: {
                $convert: { input: '$agentId', to: 'objectId', onError: null, onNull: null },
              },
              sessionUserId: '$userId',
              sessionAgentKeyVersion: '$agentKeyVersion',
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$_id', '$$sessionAgentId'] },
                      { $eq: ['$userId', '$$sessionUserId'] },
                      { $eq: ['$deletedAt', null] },
                      { $eq: ['$secretKeyVersion', '$$sessionAgentKeyVersion'] },
                      { $ne: ['$secretKeyDigest', null] },
                    ],
                  },
                },
              },
              { $project: { _id: 1, userId: 1 } },
            ],
            as: 'activeAgent',
          },
        },
        { $unwind: '$activeAgent' },
        {
          $lookup: {
            from: this.userModel.collection.name,
            let: {
              ownerUserId: {
                $convert: { input: '$activeAgent.userId', to: 'objectId', onError: null, onNull: null },
              },
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$_id', '$$ownerUserId'] },
                      { $eq: ['$deletedAt', null] },
                    ],
                  },
                },
              },
              {
                $project: {
                  _id: 0,
                  id: { $toString: '$_id' },
                  username: 1,
                  role: 1,
                  tokenVersion: 1,
                  suspendedAt: 1,
                  suspendedUntil: 1,
                },
              },
            ],
            as: 'activeOwner',
          },
        },
        { $unwind: '$activeOwner' },
        {
          $project: {
            _id: 0,
            id: '$activeOwner.id',
            username: '$activeOwner.username',
            role: '$activeOwner.role',
            tokenVersion: '$activeOwner.tokenVersion',
            agentId: { $toString: '$activeAgent._id' },
            suspendedAt: '$activeOwner.suspendedAt',
            suspendedUntil: '$activeOwner.suspendedUntil',
          },
        },
        { $limit: 1 },
      ])
      .exec();

    return users[0] ?? null;
  }

  async refreshAgentBrowserSession(refreshToken: string | null): Promise<AgentBrowserAuthResult> {
    const parsedToken = this.parseRefreshToken(refreshToken);
    if (!parsedToken) throw authErrors.sessionExpired();

    for (let attempt = 0; attempt < AGENT_REFRESH_ROTATION_ATTEMPTS; attempt += 1) {
      const now = new Date();
      const session = await this.agentBrowserSessionModel.findOne({
        selectorHash: parsedToken.selectorHash,
        refreshTokenVersion: AGENT_REFRESH_TOKEN_VERSION,
        revokedAt: null,
      });

      if (
        !session ||
        session.expiresAt.getTime() <= now.getTime() ||
        session.absoluteExpiresAt.getTime() <= now.getTime()
      ) {
        throw authErrors.sessionExpired();
      }

      if (session.currentTokenHash === parsedToken.secretHash) {
        const nextSecret = randomBytes(AGENT_REFRESH_SECRET_BYTES).toString('base64url');
        const nextRefreshToken = this.formatRefreshToken(
          parsedToken.selector,
          nextSecret,
        );
        const rotated = await this.agentBrowserSessionModel.findOneAndUpdate(
          {
            _id: session.id,
            selectorHash: parsedToken.selectorHash,
            refreshTokenVersion: AGENT_REFRESH_TOKEN_VERSION,
            rotationVersion: session.rotationVersion,
            currentTokenHash: parsedToken.secretHash,
            revokedAt: null,
            expiresAt: { $gt: now },
            absoluteExpiresAt: { $gt: now },
          },
          {
            $set: {
              currentTokenHash: this.hashRefreshToken(nextSecret),
              previousTokenHash: parsedToken.secretHash,
              previousTokenValidUntil: new Date(now.getTime() + AGENT_REFRESH_REPLAY_GRACE_MS),
              expiresAt: new Date(
                Math.min(
                  now.getTime() + AGENT_BROWSER_SESSION_TTL_MS,
                  session.absoluteExpiresAt.getTime(),
                ),
              ),
            },
            $inc: { rotationVersion: 1 },
          },
          { new: true },
        );
        if (!rotated) continue;
        return this.completeRefresh(rotated, nextRefreshToken);
      }

      if (
        session.previousTokenHash === parsedToken.secretHash &&
        session.previousTokenValidUntil &&
        session.previousTokenValidUntil.getTime() > now.getTime()
      ) {
        return this.completeRefresh(session, null);
      }

      await this.agentBrowserSessionModel.findOneAndUpdate(
        {
          _id: session.id,
          selectorHash: parsedToken.selectorHash,
          refreshTokenVersion: AGENT_REFRESH_TOKEN_VERSION,
          rotationVersion: session.rotationVersion,
          revokedAt: null,
        },
        { $set: { revokedAt: now } },
      );
      throw authErrors.sessionExpired();
    }

    throw authErrors.sessionExpired();
  }

  async logoutAgentBrowserSession(refreshToken: string | null): Promise<void> {
    const parsedToken = this.parseRefreshToken(refreshToken);
    if (!parsedToken) return;
    const now = new Date();
    await this.agentBrowserSessionModel.findOneAndUpdate(
      {
        selectorHash: parsedToken.selectorHash,
        refreshTokenVersion: AGENT_REFRESH_TOKEN_VERSION,
        revokedAt: null,
        $or: [
          { currentTokenHash: parsedToken.secretHash },
          {
            previousTokenHash: parsedToken.secretHash,
            previousTokenValidUntil: { $gt: now },
          },
        ],
      },
      { $set: { revokedAt: now } },
    );
  }

  async revokeAgentSessionFromRefreshToken(refreshToken: string | null): Promise<void> {
    await this.logoutAgentBrowserSession(refreshToken);
  }

  private async createSession(agentId: string, userId: string, agentKeyVersion: number) {
    const selector = randomBytes(AGENT_REFRESH_SELECTOR_BYTES).toString('base64url');
    const secret = randomBytes(AGENT_REFRESH_SECRET_BYTES).toString('base64url');
    const refreshToken = this.formatRefreshToken(selector, secret);
    const now = Date.now();
    const expiresAt = new Date(now + AGENT_BROWSER_SESSION_TTL_MS);
    const absoluteExpiresAt = new Date(now + AGENT_BROWSER_SESSION_ABSOLUTE_TTL_MS);
    const session = await this.agentBrowserSessionModel.create({
      agentId,
      userId,
      agentKeyVersion,
      selectorHash: this.hashRefreshToken(selector),
      refreshTokenVersion: AGENT_REFRESH_TOKEN_VERSION,
      rotationVersion: 0,
      currentTokenHash: this.hashRefreshToken(secret),
      previousTokenHash: null,
      previousTokenValidUntil: null,
      expiresAt,
      absoluteExpiresAt,
      revokedAt: null,
    });

    return { id: session.id, refreshToken, expiresAt };
  }

  private async completeRefresh(
    session: AgentBrowserSessionDocument,
    refreshToken: string | null,
  ): Promise<AgentBrowserAuthResult> {
    const identity = await this.findActiveAgentBrowserUser(session.agentId, session.id);
    if (!identity) {
      await this.agentBrowserSessionModel.findByIdAndUpdate(session.id, { revokedAt: new Date() });
      throw authErrors.sessionExpired();
    }
    if (isUserSuspended(identity)) {
      await this.agentBrowserSessionModel.findByIdAndUpdate(session.id, { revokedAt: new Date() });
      throw authErrors.accountSuspended();
    }
    const agent = await this.agentModel.findOne({
      _id: identity.agentId,
      userId: identity.id,
      deletedAt: null,
    });
    if (!agent) {
      await this.agentBrowserSessionModel.findByIdAndUpdate(session.id, { revokedAt: new Date() });
      throw authErrors.sessionExpired();
    }
    return this.buildAuthResult(identity, agent, session.id, refreshToken, session.expiresAt);
  }

  private buildAuthResult(
    identity: Pick<ActiveAgentBrowserUser, 'id' | 'username' | 'role' | 'agentId'>,
    agent: AgentDocument,
    agentBrowserSessionId: string,
    refreshToken: string | null,
    refreshExpiresAt: Date,
  ): AgentBrowserAuthResult {
    return {
      sessionType: 'AGENT',
      user: null,
      agent: this.serializeAgent(agent),
      token: this.jwtService.sign({
        sub: identity.id,
        username: identity.username,
        role: USER_ROLES.USER,
        authType: 'agent',
        agentId: identity.agentId,
        agentBrowserSessionId,
      }),
      refreshToken,
      refreshExpiresAt,
    };
  }

  private serializeAgent(agent: Agent) {
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      favoritesPublic: agent.favoritesPublic !== false,
      ownerOperationEnabled: false,
      avatarSeed: agent.avatarSeed,
      createdAt: agent.createdAt ? agent.createdAt.toISOString() : '',
    };
  }

  private hashRefreshToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseRefreshToken(token: string | null): ParsedAgentRefreshToken | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [prefix, selector, secret] = parts;
    if (
      prefix !== AGENT_REFRESH_TOKEN_PREFIX ||
      selector.length !== AGENT_REFRESH_SELECTOR_LENGTH ||
      secret.length !== AGENT_REFRESH_SECRET_LENGTH ||
      !BASE64URL_PATTERN.test(selector) ||
      !BASE64URL_PATTERN.test(secret)
    ) {
      return null;
    }
    return {
      selector,
      selectorHash: this.hashRefreshToken(selector),
      secretHash: this.hashRefreshToken(secret),
    };
  }

  private formatRefreshToken(selector: string, secret: string): string {
    return `${AGENT_REFRESH_TOKEN_PREFIX}.${selector}.${secret}`;
  }
}
