import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { logTransportSelection } from './telemetry.js';

describe('logTransportSelection', () => {
  test('writes a structured JSON line to stderr, never stdout', () => {
    const stderrWrites = [];
    const stdoutWrites = [];
    const originalStderrWrite = process.stderr.write;
    const originalStdoutWrite = process.stdout.write;
    process.stderr.write = (chunk) => { stderrWrites.push(chunk); return true; };
    process.stdout.write = (chunk) => { stdoutWrites.push(chunk); return true; };

    try {
      logTransportSelection({ tool: 'run_request', selectedTransport: 'mcp', selectionReason: 'default_mcp' });
    } finally {
      process.stderr.write = originalStderrWrite;
      process.stdout.write = originalStdoutWrite;
    }

    assert.equal(stdoutWrites.length, 0, 'must never write telemetry to stdout (the MCP protocol channel)');
    assert.equal(stderrWrites.length, 1);

    const parsed = JSON.parse(stderrWrites[0]);
    assert.equal(parsed.event, 'transport_selection');
    assert.equal(parsed.tool, 'run_request');
    assert.equal(parsed.selected_transport, 'mcp');
    assert.equal(parsed.selection_reason, 'default_mcp');
    assert.ok(parsed.timestamp);
  });

  test('includes optional detail field when provided', () => {
    const stderrWrites = [];
    const originalStderrWrite = process.stderr.write;
    process.stderr.write = (chunk) => { stderrWrites.push(chunk); return true; };

    try {
      logTransportSelection({
        tool: 'run_request',
        selectedTransport: null,
        selectionReason: 'mcp_unavailable',
        detail: 'server not reachable',
      });
    } finally {
      process.stderr.write = originalStderrWrite;
    }

    const parsed = JSON.parse(stderrWrites[0]);
    assert.equal(parsed.selection_reason, 'mcp_unavailable');
    assert.equal(parsed.detail, 'server not reachable');
  });
});
