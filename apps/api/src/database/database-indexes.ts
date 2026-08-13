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

export interface DatabaseIndexSyncOptions {
  allowDrop?: boolean;
}

function describeIndex(index: unknown): string {
  if (typeof index === 'string') return index;
  if (index && typeof index === 'object') {
    const value = index as { name?: unknown; key?: unknown };
    if (typeof value.name === 'string') return value.name;
    if (value.key && typeof value.key === 'object') {
      return JSON.stringify(value.key);
    }
  }
  return String(index);
}

export async function syncDatabaseIndexes(
  connection: Connection,
  definitions: readonly DatabaseModelDefinition[],
  options: DatabaseIndexSyncOptions = {},
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
  if (pendingDrops.length > 0 && options.allowDrop !== true) {
    throw new Error(
      `Database index drops are blocked by default. Re-run with --allow-drop after review: ${pendingDrops.join(', ')}`,
    );
  }

  const results: DatabaseIndexSyncResult[] = [];
  for (const { definition, model, difference } of differences) {
    if (options.allowDrop === true && difference.toDrop.length > 0) {
      for (const indexName of difference.toDrop) {
        await model.collection.dropIndex(indexName);
      }
    }
    if (difference.toCreate.length > 0) {
      await model.createIndexes();
    }
    results.push({
      model: definition.name,
      created: difference.toCreate.map(describeIndex),
      dropped: difference.toDrop,
    });
  }
  return results;
}
