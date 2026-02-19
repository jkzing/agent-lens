import { DatabaseSync } from 'node:sqlite';

export function createDbClient(dbPath: string) {
  return new DatabaseSync(dbPath, { readBigInts: true });
}
