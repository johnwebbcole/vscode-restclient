import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isExplicitCurlRequest, selectTransport, TRANSPORT, SELECTION_REASON } from './transportPolicy.js';

describe('isExplicitCurlRequest', () => {
  test('matches "use curl"', () => {
    assert.equal(isExplicitCurlRequest('use curl to fetch the forecast'), true);
  });

  test('matches "run curl"', () => {
    assert.equal(isExplicitCurlRequest('please run curl against that endpoint'), true);
  });

  test('matches "via curl"', () => {
    assert.equal(isExplicitCurlRequest('get the forecast via curl'), true);
  });

  test('matches a literal curl command', () => {
    assert.equal(isExplicitCurlRequest('curl -X GET https://api.weather.gov/points/34.7,-86.6'), true);
  });

  test('matches a literal curl command on a later line', () => {
    assert.equal(isExplicitCurlRequest('run this:\ncurl https://example.com'), true);
  });

  test('does not match a plain natural-language ask', () => {
    assert.equal(isExplicitCurlRequest('get the forecast for Huntsville'), false);
  });

  test('does not match an incidental mention of curl with no imperative verb', () => {
    assert.equal(isExplicitCurlRequest('does this API support curl requests?'), false);
  });

  test('does not match empty/undefined input', () => {
    assert.equal(isExplicitCurlRequest(''), false);
    assert.equal(isExplicitCurlRequest(undefined), false);
  });
});

describe('selectTransport', () => {
  test('defaults to mcp for a plain natural-language ask (negative curl test)', () => {
    const decision = selectTransport({ instruction: 'get forecast for Huntsville' });
    assert.equal(decision.transport, TRANSPORT.MCP);
    assert.equal(decision.selectionReason, SELECTION_REASON.DEFAULT_MCP);
  });

  test('never selects curl for a default instruction', () => {
    const decision = selectTransport({ instruction: 'get forecast for Huntsville' });
    assert.notEqual(decision.transport, TRANSPORT.CURL);
  });

  test('defaults to mcp when no instruction is given at all', () => {
    const decision = selectTransport({});
    assert.equal(decision.transport, TRANSPORT.MCP);
    assert.equal(decision.selectionReason, SELECTION_REASON.DEFAULT_MCP);
  });

  test('selects curl when explicitly requested by phrase', () => {
    const decision = selectTransport({ instruction: 'use curl to fetch the forecast' });
    assert.equal(decision.transport, TRANSPORT.CURL);
    assert.equal(decision.selectionReason, SELECTION_REASON.EXPLICIT_CURL);
    assert.equal(decision.explicitCurl, true);
  });

  test('selects curl when given a literal curl command', () => {
    const decision = selectTransport({ instruction: 'curl https://api.weather.gov/points/34.7,-86.6' });
    assert.equal(decision.transport, TRANSPORT.CURL);
    assert.equal(decision.selectionReason, SELECTION_REASON.EXPLICIT_CURL);
  });

  test('reports mcp_unavailable with an error, and does not fall back to curl', () => {
    const decision = selectTransport({ instruction: 'get forecast for Huntsville', mcpAvailable: false });
    assert.equal(decision.transport, null);
    assert.equal(decision.selectionReason, SELECTION_REASON.MCP_UNAVAILABLE);
    assert.ok(decision.error instanceof Error);
    assert.equal(decision.error.code, 'MCP_UNAVAILABLE');
    assert.match(decision.error.message, /not falling back to curl/i);
  });

  test('explicit curl still wins even when mcp is unavailable', () => {
    const decision = selectTransport({ instruction: 'use curl to fetch the forecast', mcpAvailable: false });
    assert.equal(decision.transport, TRANSPORT.CURL);
    assert.equal(decision.selectionReason, SELECTION_REASON.EXPLICIT_CURL);
  });
});
