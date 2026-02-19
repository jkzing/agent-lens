import fs from 'node:fs';
import path from 'node:path';
import { DEFAULTS, defaultTomlPath } from './load.js';

export const CONFIG_TEMPLATE = `# agent-lens configuration (v1)\n# Default location: ~/.agent-lens/config.toml\n\n[server]\n# Local server port\nport = 4318\n\n# Data directory for SQLite storage\ndataDir = "${DEFAULTS.dataDir.replaceAll('\\', '\\\\')}"\n\n[ui]\n# Auto-open browser on startup\nopen = true\n`;

export function initDefaultConfig(filePath = defaultTomlPath): { createdPath: string } {
  if (fs.existsSync(filePath)) {
    throw new Error(`[agent-lens] config already exists: ${filePath}`);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, CONFIG_TEMPLATE, 'utf8');
  return { createdPath: filePath };
}
