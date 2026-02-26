import { parseJson } from './json.js';

type JsonMap = Record<string, unknown>;

const SESSION_KEY_PATHS = [
  'openclaw.sessionKey',
  'openclaw.sessionId'
] as const;

export function extractSessionKey(attributesInput: string | null, resourceAttributesInput: string | null): string | null {
  const attributes = parseJson(attributesInput);
  const resourceAttributes = parseJson(resourceAttributesInput);

  return (
    pickNonEmptyString(attributes, SESSION_KEY_PATHS) ??
    pickNonEmptyString(resourceAttributes, SESSION_KEY_PATHS) ??
    null
  );
}

export function extractSessionFields(attributesInput: string | null, resourceAttributesInput: string | null) {
  const attributes = parseJson(attributesInput);
  const resourceAttributes = parseJson(resourceAttributesInput);

  const sessionKey =
    pickNonEmptyString(attributes, SESSION_KEY_PATHS) ??
    pickNonEmptyString(resourceAttributes, SESSION_KEY_PATHS) ??
    null;

  const sessionId =
    pickNonEmptyString(attributes, ['openclaw.sessionId']) ??
    pickNonEmptyString(resourceAttributes, ['openclaw.sessionId']) ??
    null;

  return {
    sessionKey,
    sessionId,
    channel:
      pickNonEmptyString(attributes, ['openclaw.channel', 'channel']) ??
      pickNonEmptyString(resourceAttributes, ['openclaw.channel', 'channel']) ??
      null,
    state:
      pickNonEmptyString(attributes, ['openclaw.state', 'state']) ??
      pickNonEmptyString(resourceAttributes, ['openclaw.state', 'state']) ??
      null,
    outcome:
      pickNonEmptyString(attributes, ['openclaw.outcome', 'outcome']) ??
      pickNonEmptyString(resourceAttributes, ['openclaw.outcome', 'outcome']) ??
      null
  };
}

function pickNonEmptyString(obj: JsonMap, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}
