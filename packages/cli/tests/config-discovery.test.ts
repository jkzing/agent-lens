import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultJsonPath, defaultTomlPath, discoverConfigPath } from '../src/config/load.js';

test('discoverConfigPath prefers toml when both exist', () => {
  const found = discoverConfigPath((filePath) => filePath === defaultTomlPath || filePath === defaultJsonPath);
  assert.equal(found, defaultTomlPath);
});

test('discoverConfigPath falls back to json', () => {
  const found = discoverConfigPath((filePath) => filePath === defaultJsonPath);
  assert.equal(found, defaultJsonPath);
});

test('discoverConfigPath returns null when none exist', () => {
  const found = discoverConfigPath(() => false);
  assert.equal(found, null);
});
