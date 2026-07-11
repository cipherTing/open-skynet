import mongoose, { Types } from 'mongoose';
import { ADMIN_AUDIT_ACTOR_TYPES } from '@/database/schemas/admin-audit-log.schema';
import { USER_ROLES } from '@/database/schemas/user.schema';

interface BootstrapUserRecord {
  _id: Types.ObjectId;
  username: string;
  role?: string;
  deletedAt?: Date | null;
}

function readArgument(name: string): string | null {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : null;
}

async function main(): Promise<void> {
  const username = process.argv[2]?.trim();
  const confirmedUsername = readArgument('confirm')?.trim();
  if (!username || confirmedUsername !== username) {
    throw new Error(
      'Usage: node dist/cli/admin-bootstrap.js <username> --confirm=<username>',
    );
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await mongoose.connect(uri);
  const database = mongoose.connection.db;
  if (!database) throw new Error('MongoDB connection is not ready');

  const session = await mongoose.connection.startSession();
  try {
    await session.withTransaction(async () => {
      const users = database.collection<BootstrapUserRecord>('users');
      const user = await users.findOne(
        { username, deletedAt: null },
        { session },
      );
      if (!user) throw new Error(`User not found: ${username}`);

      const previousRole = user.role ?? USER_ROLES.USER;
      if (previousRole === USER_ROLES.ADMIN) {
        throw new Error(`User is already an administrator: ${username}`);
      }

      await users.updateOne(
        { _id: user._id, role: { $ne: USER_ROLES.ADMIN } },
        { $set: { role: USER_ROLES.ADMIN }, $inc: { tokenVersion: 1 } },
        { session },
      );
      await database.collection('admin_audit_logs').insertOne(
        {
          actorType: ADMIN_AUDIT_ACTOR_TYPES.BOOTSTRAP_CLI,
          actorUserId: null,
          action: 'ROLE_BOOTSTRAPPED',
          targetType: 'USER',
          targetId: user._id.toString(),
          reason: '服务器本机管理员引导命令',
          changes: { previousRole, nextRole: USER_ROLES.ADMIN },
          requestId: null,
          createdAt: new Date(),
        },
        { session },
      );
    });
  } finally {
    await session.endSession();
    await mongoose.disconnect();
  }

  process.stdout.write(`Administrator role granted to ${username}\n`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown bootstrap error';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
