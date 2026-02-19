import fs from 'node:fs';
import path from 'node:path';

export const dataDir = path.resolve(process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data'));
fs.mkdirSync(dataDir, { recursive: true });

export const dbPath = path.join(dataDir, 'agent-lens.db');

export const uiDistPath = path.resolve(process.env.UI_DIST ?? path.join(process.cwd(), '../ui/dist'));
export const hasUiDist = fs.existsSync(path.join(uiDistPath, 'index.html'));

export const port = Number(process.env.PORT || 4318);
