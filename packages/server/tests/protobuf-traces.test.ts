import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { decodeOtlpProtobufTraceRequest, extractSpans } from '../src/otlp.js';

const require = createRequire(import.meta.url);
const otlpRoot = require('@opentelemetry/otlp-transformer/build/src/generated/root.js');
const exportTraceServiceRequestType =
  otlpRoot.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest;

test('protobuf traces can be decoded and produce non-empty trace_id', () => {
  const traceId = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  const spanId = Buffer.from('0011223344556677', 'hex');

  const payload = exportTraceServiceRequestType.encode({
    resourceSpans: [
      {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: 'openclaw-agent' } }]
        },
        scopeSpans: [
          {
            spans: [
              {
                traceId,
                spanId,
                name: 'agent.request',
                kind: 2,
                startTimeUnixNano: '1739850000000000000',
                endTimeUnixNano: '1739850000000100000'
              }
            ]
          }
        ]
      }
    ]
  }).finish();

  const decoded = decodeOtlpProtobufTraceRequest(Buffer.from(payload));
  const spans = extractSpans(decoded);

  assert.equal(spans.length, 1);
  assert.equal(spans[0].traceId, '00112233445566778899aabbccddeeff');
  assert.notEqual(spans[0].traceId, '');
});
