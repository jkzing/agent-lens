import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBigInts } from '../src/lib/bigint.js';
import { csvEscape } from '../src/lib/csv.js';
import { parseJson, toNumber } from '../src/lib/json.js';
import { getPagination } from '../src/lib/pagination.js';

test('getPagination applies defaults when params are missing', () => {
  assert.deepEqual(getPagination({}), { limit: 100, offset: 0 });
});

test('getPagination clamps limit and offset ranges', () => {
  assert.deepEqual(getPagination({ limit: '0', offset: '-10' }), { limit: 1, offset: 0 });
  assert.deepEqual(getPagination({ limit: '999', offset: '5' }), { limit: 500, offset: 5 });
});

test('getPagination falls back on invalid numeric values', () => {
  assert.deepEqual(getPagination({ limit: 'abc', offset: 'NaN' }), { limit: 100, offset: 0 });
  assert.deepEqual(getPagination({ limit: 'Infinity', offset: '-Infinity' }), { limit: 100, offset: 0 });
});

test('normalizeBigInts converts nested bigint values in objects and arrays', () => {
  const input = {
    id: 123n,
    nested: {
      values: [1n, { deep: 2n }, 'ok']
    },
    plain: 7
  };

  const normalized = normalizeBigInts(input);
  assert.deepEqual(normalized, {
    id: 123,
    nested: {
      values: [1, { deep: 2 }, 'ok']
    },
    plain: 7
  });
});

test('parseJson returns object for valid object JSON and empty object for invalid/non-object', () => {
  assert.deepEqual(parseJson('{"a":1,"nested":{"b":2}}'), { a: 1, nested: { b: 2 } });
  assert.deepEqual(parseJson('{invalid'), {});
  assert.deepEqual(parseJson('123'), {});
  assert.deepEqual(parseJson('null'), {});
  assert.deepEqual(parseJson(''), {});
  assert.deepEqual(parseJson(null), {});
});

test('toNumber handles valid and invalid number-like inputs', () => {
  assert.equal(toNumber('42.5'), 42.5);
  assert.equal(toNumber(0), 0);
  assert.equal(toNumber('not-a-number'), 0);
  assert.equal(toNumber(Infinity), 0);
  assert.equal(toNumber(undefined), 0);
});

test('csvEscape handles commas, quotes, newlines and nulls', () => {
  assert.equal(csvEscape('simple'), 'simple');
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('he said "hi"'), '"he said ""hi"""');
  assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
  assert.equal(csvEscape(null), '');
  assert.equal(csvEscape(undefined), '');
});
