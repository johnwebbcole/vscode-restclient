import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseHttpFile, extractFileVariables } from './httpFileParser.js';

describe('parseHttpFile body handling', () => {
  test('joins a multi-line application/x-www-form-urlencoded body without embedding newlines', () => {
    const text = [
      '# @name login',
      'POST https://example.com/login HTTP/1.1',
      'Content-Type: application/x-www-form-urlencoded',
      '',
      'user_id={{username}}',
      '&password={{password}}',
      '&RememberUserId=false',
      '',
    ].join('\n');

    const [request] = parseHttpFile(text);
    assert.equal(request.body, 'user_id={{username}}&password={{password}}&RememberUserId=false');
  });

  test('matches form-urlencoded content type regardless of a charset parameter or case', () => {
    const text = [
      'POST https://example.com/login',
      'content-type: Application/X-WWW-Form-Urlencoded; charset=utf-8',
      '',
      'a=1',
      '&b=2',
      '',
    ].join('\n');

    const [request] = parseHttpFile(text);
    assert.equal(request.body, 'a=1&b=2');
  });

  test('still joins non-form bodies (e.g. JSON) with newlines, ignoring a leading "&"', () => {
    const text = [
      'POST https://example.com/data',
      'Content-Type: application/json',
      '',
      '{',
      '  "a": 1',
      '}',
      '',
    ].join('\n');

    const [request] = parseHttpFile(text);
    assert.equal(request.body, '{\n  "a": 1\n}');
  });

  test('joins a form-urlencoded body with no continuation lines unchanged', () => {
    const text = [
      'POST https://example.com/login',
      'Content-Type: application/x-www-form-urlencoded',
      '',
      'user_id=alice&password=secret',
      '',
    ].join('\n');

    const [request] = parseHttpFile(text);
    assert.equal(request.body, 'user_id=alice&password=secret');
  });
});

describe('extractFileVariables', () => {
  test('parses @name = value file-level variable declarations', () => {
    const text = [
      '@bff-gateway = https://example.com',
      '@username = alice',
      '',
      'GET {{bff-gateway}}/ping',
    ].join('\n');

    assert.deepEqual(extractFileVariables(text), { 'bff-gateway': 'https://example.com', username: 'alice' });
  });
});
