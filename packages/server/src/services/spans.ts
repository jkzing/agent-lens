import type { DatabaseSync } from 'node:sqlite';
import { listSpansPage } from '../repositories/spansRepo.js';

export function listSpans(db: DatabaseSync, limit: number, offset: number) {
  return listSpansPage(db, limit, offset);
}
