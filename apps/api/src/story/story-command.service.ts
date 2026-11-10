import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'node:crypto';
import { isUUID } from 'class-validator';
import { StoryCommand, type StoryCommandOperation } from '@/database/schemas/story-command.schema';
import { DatabaseService } from '@/database/database.service';
import { apiErrors } from '@/common/i18n/api-message';

type StoryCommandJsonValue =
  | string
  | number
  | boolean
  | null
  | StoryCommandJsonValue[]
  | StoryCommandJsonObject;
export interface StoryCommandJsonObject {
  [key: string]: StoryCommandJsonValue;
}

const MAX_RESPONSE_BYTES = 2_097_152;

function isJsonValue(value: unknown): value is StoryCommandJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject(value);
}

function isJsonObject(value: unknown): value is StoryCommandJsonObject {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every(isJsonValue)
  );
}

function parseResponse(serialized: string): StoryCommandJsonObject {
  const result: unknown = JSON.parse(serialized);
  if (!isJsonObject(result)) throw new Error('Story command response must be a JSON object');
  return result;
}

function canonicalJson(value: StoryCommandJsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => {
        const item = value[key];
        if (item === undefined) throw new Error('Story command JSON value is missing');
        return `${JSON.stringify(key)}:${canonicalJson(item)}`;
      })
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function isDuplicateKeyError(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 11000;
}

@Injectable()
export class StoryCommandService {
  constructor(
    @InjectModel(StoryCommand.name) private readonly commands: Model<StoryCommand>,
    private readonly database: DatabaseService,
  ) {}

  async execute(
    agentId: string,
    key: string | undefined,
    operation: StoryCommandOperation,
    scopeId: string | null,
    body: object,
    action: () => Promise<object>,
  ): Promise<StoryCommandJsonObject> {
    if (!key)
      throw apiErrors.badRequest(
        'STORY_IDEMPOTENCY_KEY_REQUIRED',
        'api.errors.storyIdempotencyKeyRequired',
      );
    if (!isUUID(key))
      throw apiErrors.badRequest(
        'STORY_IDEMPOTENCY_KEY_INVALID',
        'api.errors.storyIdempotencyKeyInvalid',
      );
    const normalizedKey = key.toLowerCase();
    const requestHash = createHash('sha256')
      .update(canonicalJson(parseResponse(JSON.stringify(body))))
      .digest('hex');
    const replay = (receipt: StoryCommand) => {
      if (
        receipt.operation !== operation ||
        receipt.scopeId !== scopeId ||
        receipt.requestHash !== requestHash
      ) {
        throw apiErrors.conflict(
          'STORY_IDEMPOTENCY_CONFLICT',
          'api.errors.storyIdempotencyConflict',
        );
      }
      return parseResponse(receipt.responseJson);
    };
    try {
      return await this.database.$transaction(async (session) => {
        const existing = await this.commands
          .findOne({ agentId, key: normalizedKey })
          .session(session)
          .exec();
        if (existing) return replay(existing);
        const responseJson = JSON.stringify(await action());
        if (Buffer.byteLength(responseJson, 'utf8') > MAX_RESPONSE_BYTES) {
          throw new Error('Story command response exceeds its receipt limit');
        }
        const response = parseResponse(responseJson);
        await this.commands.create(
          [{ agentId, key: normalizedKey, operation, scopeId, requestHash, responseJson }],
          { session },
        );
        return response;
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const existing = await this.commands.findOne({ agentId, key: normalizedKey }).exec();
      if (!existing) throw error;
      return replay(existing);
    }
  }
}
