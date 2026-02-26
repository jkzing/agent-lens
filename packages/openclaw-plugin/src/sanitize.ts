const SENSITIVE_KEY_PATTERN = /(token|cookie|authorization|auth|api[_-]?key|password|secret|path|filePath)/i;

function truncateString(value: string, maxStringLength: number): string {
  if (value.length <= maxStringLength) {
    return value;
  }

  return `${value.slice(0, maxStringLength)}…`;
}

function sanitizeValue(value: unknown, maxStringLength: number): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === 'string') {
    return truncateString(value, maxStringLength);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return `[array:${value.length}]`;
  }

  if (value instanceof Error) {
    return truncateString(value.message, maxStringLength);
  }

  return '[complex]';
}

export function sanitizeAllowlistedFields(
  source: unknown,
  allowlist: string[],
  maxStringLength: number
): Record<string, unknown> | undefined {
  if (!source || typeof source !== 'object' || allowlist.length === 0) {
    return undefined;
  }

  const objectSource = source as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const field of allowlist) {
    if (SENSITIVE_KEY_PATTERN.test(field)) {
      continue;
    }

    if (!(field in objectSource)) {
      continue;
    }

    const sanitized = sanitizeValue(objectSource[field], maxStringLength);
    if (sanitized !== undefined) {
      output[field] = sanitized;
    }
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

export function isSensitiveKey(input: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(input);
}
