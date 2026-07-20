import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { User, USER_ROLES, type UserRole } from '@/database/schemas/user.schema';
import { Agent } from '@/database/schemas/agent.schema';
import { BrowserSession } from '@/database/schemas/browser-session.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { isUserSuspended } from './auth-security';
import { FEATURE_FLAG_KEYS } from '@/database/schemas/feature-flag.schema';
import { FeatureFlagService } from '@/system/feature-flag.service';
import {
  PlatformInitialization,
  PLATFORM_INITIALIZATION_KEYS,
} from '@/database/schemas/platform-initialization.schema';
import { DatabaseService } from '@/database/database.service';
import { InitializeAdministratorDto } from './dto/initialize-administrator.dto';
import { EmailVerificationService } from './email-verification.service';
import { InvitationCodeService } from './invitation-code.service';
import { AuthPolicyService } from '@/system/auth-policy.service';
import { EMAIL_VERIFICATION_PURPOSES } from '@/database/schemas/email-verification.schema';
import type { ResetPasswordDto } from './dto/email-verification.dto';
import { authErrors, commonErrors } from '@/common/errors/business-errors';

const BROWSER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BROWSER_SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_REPLAY_GRACE_MS = 10_000;

interface DuplicateKeyError {
  code: 11000;
  keyPattern?: Record<string, number>;
}

function isDuplicateKeyError(error: unknown): error is DuplicateKeyError {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function duplicateKeyField(error: DuplicateKeyError): string | null {
  return error.keyPattern ? (Object.keys(error.keyPattern)[0] ?? null) : null;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Agent.name) private readonly agentModel: Model<Agent>,
    @InjectModel(BrowserSession.name)
    private readonly browserSessionModel: Model<BrowserSession>,
    @InjectModel(PlatformInitialization.name)
    private readonly platformInitializationModel: Model<PlatformInitialization>,
    private readonly jwtService: JwtService,
    private readonly featureFlagService: FeatureFlagService,
    private readonly databaseService: DatabaseService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly invitationCodeService: InvitationCodeService,
    private readonly authPolicyService: AuthPolicyService,
  ) {}

  async register(dto: RegisterDto) {
    await this.featureFlagService.assertEnabled(FEATURE_FLAG_KEYS.REGISTRATION);
    const email = this.emailVerificationService.normalizeEmail(dto.email);
    const verification = await this.emailVerificationService.assertValid(
      dto.verificationChallengeId,
      email,
      dto.verificationCode,
      EMAIL_VERIFICATION_PURPOSES.REGISTER,
    );
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      return await this.databaseService.$transaction(async (session) => {
        const policy = await this.authPolicyService.acquireCurrentPolicy(session);
        if (verification.policyVersion !== policy.version) {
          throw authErrors.registrationPolicyChanged();
        }
        if (policy.inviteRequired && !dto.invitationCode) {
          throw authErrors.invitationRequired();
        }
        const result = await this.createBrowserAccount(
          dto,
          email,
          USER_ROLES.USER,
          passwordHash,
          session,
        );
        if (policy.inviteRequired && dto.invitationCode) {
          await this.invitationCodeService.consume(dto.invitationCode, result.user.id, session);
        }
        await this.emailVerificationService.consume(
          dto.verificationChallengeId,
          verification.digest,
          session,
        );
        return result;
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw authErrors.identityAlreadyTaken();
      }
      throw error;
    }
  }

  async getInitializationStatus() {
    const initialization = await this.platformInitializationModel.exists({
      key: PLATFORM_INITIALIZATION_KEYS.ADMINISTRATOR,
    });
    return { initialized: Boolean(initialization) };
  }

  async initializeAdministrator(dto: InitializeAdministratorDto) {
    if ((await this.getInitializationStatus()).initialized) {
      throw authErrors.platformAlreadyInitialized();
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      return await this.databaseService.$transaction(async (session) => {
        const [initialization, administrator] = await Promise.all([
          this.platformInitializationModel
            .exists({ key: PLATFORM_INITIALIZATION_KEYS.ADMINISTRATOR })
            .session(session),
          this.userModel.exists({ role: USER_ROLES.ADMIN, deletedAt: null }).session(session),
        ]);
        if (initialization) {
          throw authErrors.platformAlreadyInitialized();
        }
        if (administrator) throw authErrors.platformInitializationStateInvalid();

        const result = await this.createBrowserAccount(
          dto,
          this.emailVerificationService.normalizeEmail(dto.email),
          USER_ROLES.ADMIN,
          passwordHash,
          session,
        );
        await new this.platformInitializationModel({
          key: PLATFORM_INITIALIZATION_KEYS.ADMINISTRATOR,
          administratorUserId: result.user.id,
          completedAt: new Date(),
        }).save({ session });
        return result;
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (isDuplicateKeyError(error)) {
        const field = duplicateKeyField(error);
        if (field === 'key' || (await this.getInitializationStatus()).initialized) {
          throw authErrors.platformAlreadyInitialized();
        }
        if (field === 'username') throw authErrors.usernameTaken();
        if (field === 'email') throw authErrors.emailAlreadyRegistered();
        if (field === 'name') throw authErrors.agentNameTaken();
        throw authErrors.identityAlreadyTaken();
      }
      throw error;
    }
  }

  async logout(userId: string, browserSessionId?: string) {
    if (browserSessionId) {
      const revokedAt = new Date();
      await this.browserSessionModel.findOneAndUpdate(
        { _id: browserSessionId, userId },
        { revokedAt },
      );
      return;
    }

    await this.userModel.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });
  }

  async login(dto: LoginDto) {
    const identity = dto.identity.trim();
    const user = await this.userModel.findOne({
      $or: [{ username: identity }, { email: identity.toLowerCase() }],
      deletedAt: null,
    });

    if (!user) {
      // Constant-time comparison to prevent username enumeration via timing
      await bcrypt.compare(
        dto.password,
        '$2b$12$000000000000000000000uGdrFhdg0cMNpMTknGjRZ3PluYUnPOra',
      );
      throw authErrors.invalidCredentials();
    }

    if (isUserSuspended(user)) {
      throw authErrors.accountSuspended();
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw authErrors.invalidCredentials();
    }

    const agent = await this.agentModel.findOne({ userId: user.id });
    const browserSession = await this.createBrowserSession(user.id);
    const token = this.generateToken(user, browserSession.id);

    return {
      user: this.serializeUser(user),
      agent: agent ? this.serializeAgent(agent) : null,
      token,
      refreshToken: browserSession.refreshToken,
      refreshExpiresAt: browserSession.expiresAt,
    };
  }

  async findUserById(id: string) {
    return this.userModel.findById(id);
  }

  async findUserWithAgentById(id: string) {
    const user = await this.userModel.findById(id);
    if (!user) return null;
    const agent = await this.agentModel.findOne({ userId: user.id });
    return { ...user, agent };
  }

  async refreshBrowserSession(refreshToken: string | null) {
    if (!refreshToken) {
      throw authErrors.sessionExpired();
    }

    const now = new Date();
    const tokenHash = this.hashRefreshToken(refreshToken);
    const browserSession = await this.browserSessionModel.findOne({
      revokedAt: null,
      $or: [{ currentTokenHash: tokenHash }, { previousTokenHash: tokenHash }],
    });

    if (
      !browserSession ||
      browserSession.expiresAt.getTime() <= now.getTime() ||
      browserSession.absoluteExpiresAt.getTime() <= now.getTime()
    ) {
      throw authErrors.sessionExpired();
    }

    const usedPreviousToken = browserSession.previousTokenHash === tokenHash;
    if (usedPreviousToken) {
      if (
        !browserSession.previousTokenValidUntil ||
        browserSession.previousTokenValidUntil.getTime() <= now.getTime()
      ) {
        await this.revokeBrowserSession(browserSession.id);
        throw authErrors.refreshTokenReused();
      }
    }

    const user = await this.userModel.findById(browserSession.userId);
    if (!user || user.deletedAt) {
      await this.revokeBrowserSession(browserSession.id);
      throw commonErrors.userNotFound();
    }

    if (isUserSuspended(user)) {
      await this.revokeBrowserSession(browserSession.id);
      throw authErrors.accountSuspended();
    }

    let nextRefreshToken: string | null = null;
    if (!usedPreviousToken) {
      nextRefreshToken = randomBytes(32).toString('base64url');
      browserSession.previousTokenHash = browserSession.currentTokenHash;
      browserSession.previousTokenValidUntil = new Date(now.getTime() + REFRESH_REPLAY_GRACE_MS);
      browserSession.currentTokenHash = this.hashRefreshToken(nextRefreshToken);
      browserSession.expiresAt = new Date(
        Math.min(
          now.getTime() + BROWSER_SESSION_TTL_MS,
          browserSession.absoluteExpiresAt.getTime(),
        ),
      );
      await browserSession.save();
    }

    const agent = await this.agentModel.findOne({ userId: user.id });
    const token = this.generateToken(user, browserSession.id);

    return {
      user: this.serializeUser(user),
      agent: agent ? this.serializeAgent(agent) : null,
      token,
      refreshToken: nextRefreshToken,
      refreshExpiresAt: browserSession.expiresAt,
    };
  }

  async isBrowserSessionActive(userId: string, browserSessionId?: string) {
    if (!browserSessionId) return false;

    const browserSession = await this.browserSessionModel.findOne({
      _id: browserSessionId,
      userId,
      revokedAt: null,
    });

    const now = Date.now();
    return Boolean(
      browserSession &&
      browserSession.expiresAt.getTime() > now &&
      browserSession.absoluteExpiresAt.getTime() > now,
    );
  }

  async validateUser(payload: { sub: string; username: string }) {
    const user = await this.findUserById(payload.sub);

    if (!user) {
      throw commonErrors.userNotFound();
    }

    if (isUserSuspended(user)) {
      throw authErrors.accountSuspended();
    }

    return user;
  }

  private async revokeBrowserSession(browserSessionId: string) {
    await this.browserSessionModel.findByIdAndUpdate(browserSessionId, {
      revokedAt: new Date(),
    });
  }

  private async createBrowserAccount(
    dto: Pick<RegisterDto, 'username' | 'agentName' | 'agentDescription'>,
    email: string,
    role: UserRole,
    passwordHash: string,
    session: ClientSession,
  ) {
    const [existingUser, existingAgent] = await Promise.all([
      this.userModel
        .findOne({
          $or: [{ username: dto.username, deletedAt: null }, { email }],
        })
        .session(session),
      this.agentModel.findOne({ name: dto.agentName, deletedAt: null }).session(session),
    ]);
    if (existingUser) throw authErrors.usernameTaken();
    if (existingAgent) throw authErrors.agentNameTaken();

    const user = await new this.userModel({
      username: dto.username,
      email,
      emailVerifiedAt: new Date(),
      passwordHash,
      role,
    }).save({ session });
    const agent = await new this.agentModel({
      name: dto.agentName,
      description: dto.agentDescription || '',
      userId: user.id,
    }).save({ session });
    const browserSession = await this.createBrowserSession(user.id, session);
    const token = this.generateToken(user, browserSession.id);

    return {
      user: this.serializeUser(user),
      agent: this.serializeAgent(agent),
      token,
      refreshToken: browserSession.refreshToken,
      refreshExpiresAt: browserSession.expiresAt,
    };
  }

  private async createBrowserSession(userId: string, session?: ClientSession) {
    const refreshToken = randomBytes(32).toString('base64url');
    const now = Date.now();
    const expiresAt = new Date(now + BROWSER_SESSION_TTL_MS);
    const absoluteExpiresAt = new Date(now + BROWSER_SESSION_ABSOLUTE_TTL_MS);
    const browserSession = await new this.browserSessionModel({
      userId,
      currentTokenHash: this.hashRefreshToken(refreshToken),
      previousTokenHash: null,
      previousTokenValidUntil: null,
      expiresAt,
      absoluteExpiresAt,
    }).save(session ? { session } : undefined);

    return {
      id: browserSession.id,
      refreshToken,
      expiresAt,
    };
  }

  private hashRefreshToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private serializeUser(user: User) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private serializeAgent(agent: Agent) {
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      favoritesPublic: agent.favoritesPublic !== false,
      ownerOperationEnabled: agent.ownerOperationEnabled === true,
      avatarSeed: agent.avatarSeed,
      createdAt: agent.createdAt.toISOString(),
    };
  }

  private generateToken(
    user: { id: string; username: string; tokenVersion: number; role: string },
    browserSessionId: string,
  ) {
    return this.jwtService.sign({
      sub: user.id,
      username: user.username,
      tokenVersion: user.tokenVersion,
      role: user.role,
      browserSessionId,
    });
  }

  async verifyCurrentPassword(userId: string, password: string): Promise<void> {
    const user = await this.userModel.findById(userId).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw authErrors.currentPasswordInvalid();
    }
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const email = this.emailVerificationService.normalizeEmail(dto.email);
    const verification = await this.emailVerificationService.assertValid(
      dto.verificationChallengeId,
      email,
      dto.verificationCode,
      EMAIL_VERIFICATION_PURPOSES.RESET_PASSWORD,
    );
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.databaseService.$transaction(async (session) => {
      const policy = await this.authPolicyService.acquireCurrentPolicy(session);
      if (verification.policyVersion !== policy.version) {
        throw authErrors.authPolicyChanged();
      }
      const user = await this.userModel.findOne({ email, deletedAt: null }).session(session);
      if (!user) throw authErrors.verificationInvalid();
      user.passwordHash = passwordHash;
      user.tokenVersion += 1;
      await user.save({ session });
      await this.browserSessionModel.updateMany(
        { userId: user.id, revokedAt: null },
        { $set: { revokedAt: new Date() } },
        { session },
      );
      await this.emailVerificationService.consume(
        dto.verificationChallengeId,
        verification.digest,
        session,
      );
    });
  }
}
