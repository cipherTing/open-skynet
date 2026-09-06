import { isDeepStrictEqual } from 'node:util';
import type { Connection, Schema } from 'mongoose';

export interface DatabaseModelDefinition {
  name: string;
  schema: Schema;
}

export interface DatabaseIndexSyncResult {
  model: string;
  created: string[];
  dropped: string[];
}

type IndexDirection =
  | 1
  | -1
  | '2d'
  | '2dsphere'
  | 'geoHaystack'
  | 'hashed'
  | 'text'
  | 'ascending'
  | 'asc'
  | 'descending'
  | 'desc';

type IndexKey = Record<string, IndexDirection>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIndexDirection(value: unknown): value is IndexDirection {
  return (
    value === 1 ||
    value === -1 ||
    value === '2d' ||
    value === '2dsphere' ||
    value === 'geoHaystack' ||
    value === 'hashed' ||
    value === 'text' ||
    value === 'ascending' ||
    value === 'asc' ||
    value === 'descending' ||
    value === 'desc'
  );
}

function requireIndexKey(value: unknown): IndexKey {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    throw new Error('Mongoose returned an invalid index definition');
  }
  const key: IndexKey = {};
  for (const [field, direction] of Object.entries(value)) {
    if (!isIndexDirection(direction)) {
      throw new Error('Mongoose returned an invalid index direction');
    }
    key[field] = direction;
  }
  return key;
}

type MongoIndexDirection = 1 | -1 | '2d' | '2dsphere' | 'geoHaystack' | 'hashed' | 'text';
type MongoIndexKey = Record<string, MongoIndexDirection>;

function toIndexSpecification(key: IndexKey): MongoIndexKey {
  const specification: MongoIndexKey = {};
  for (const [field, direction] of Object.entries(key)) {
    if (direction === 'ascending' || direction === 'asc') {
      specification[field] = 1;
    } else if (direction === 'descending' || direction === 'desc') {
      specification[field] = -1;
    } else {
      specification[field] = direction;
    }
  }
  return specification;
}

function describeIndex(index: unknown): string {
  if (typeof index === 'string') return index;
  if (isRecord(index)) {
    if (typeof index.name === 'string') return index.name;
    if (isRecord(index.key)) return JSON.stringify(index.key);
    if (Object.values(index).every(isIndexDirection)) return JSON.stringify(index);
  }
  return String(index);
}

export async function syncDatabaseIndexes(
  connection: Connection,
  definitions: readonly DatabaseModelDefinition[],
): Promise<DatabaseIndexSyncResult[]> {
  if (connection.readyState !== 1) throw new Error('MongoDB connection is not ready');

  const models = definitions.map((definition) => ({
    definition,
    model:
      connection.models[definition.name] ?? connection.model(definition.name, definition.schema),
  }));
  const differences = await Promise.all(
    models.map(async ({ definition, model }) => ({
      definition,
      model,
      difference: await model.diffIndexes(),
    })),
  );
  const pendingDrops = differences.flatMap(({ definition, difference }) =>
    difference.toDrop.map((index) => `${definition.name}:${index}`),
  );
  if (pendingDrops.length > 0) {
    throw new Error(
      `Database index drift is not covered by a versioned migration: ${pendingDrops.join(', ')}`,
    );
  }

  const results: DatabaseIndexSyncResult[] = [];
  for (const { definition, model, difference } of differences) {
    const declaredIndexes = model.schema.indexes();
    for (const indexToCreate of difference.toCreate) {
      const key = requireIndexKey(indexToCreate);
      const matchingDefinitions = declaredIndexes.filter(([declaredKey]) =>
        isDeepStrictEqual(declaredKey, key),
      );
      if (matchingDefinitions.length !== 1) {
        throw new Error(
          `Schema index ${definition.name}:${describeIndex(indexToCreate)} cannot be created unambiguously`,
        );
      }
      const matchingDefinition = matchingDefinitions[0];
      if (!matchingDefinition) throw new Error('Matched schema index definition is missing');
      const [declaredKey, declaredOptions] = matchingDefinition;
      const { unique, ...createIndexOptions } = declaredOptions;
      await model.collection.createIndex(toIndexSpecification(declaredKey), {
        ...createIndexOptions,
        ...(unique === true || Array.isArray(unique) ? { unique: true } : {}),
      });
    }
    results.push({
      model: definition.name,
      created: difference.toCreate.map(describeIndex),
      dropped: [],
    });
  }
  return results;
}
