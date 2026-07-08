import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { RequestCache, createRequestCache } from './requestCache.js';

describe('RequestCache', () => {
  test('get() returns undefined for a name that was never set', () => {
    const cache = createRequestCache();
    assert.equal(cache.get('login'), undefined);
  });

  test('round-trips an entry by name', () => {
    const cache = createRequestCache();
    const entry = {
      request: { method: 'POST', url: 'https://example.com/login', headers: [], body: undefined },
      response: { status: 200, headers: [['content-type', 'application/json']], body: '{"token":"abc123"}' },
    };
    cache.set('login', entry);
    assert.deepEqual(cache.get('login'), entry);
  });

  test('setting the same name twice overwrites the previous entry', () => {
    const cache = createRequestCache();
    cache.set('login', { request: {}, response: { status: 200, headers: [], body: 'first' } });
    cache.set('login', { request: {}, response: { status: 200, headers: [], body: 'second' } });
    assert.equal(cache.get('login').response.body, 'second');
  });

  test('toObject() returns a plain object snapshot keyed by name', () => {
    const cache = createRequestCache();
    const loginEntry = { request: {}, response: { status: 200, headers: [], body: 'a' } };
    const otherEntry = { request: {}, response: { status: 201, headers: [], body: 'b' } };
    cache.set('login', loginEntry);
    cache.set('other', otherEntry);

    const snapshot = cache.toObject();
    assert.deepEqual(snapshot, { login: loginEntry, other: otherEntry });
  });

  test('toObject() is a snapshot - mutating it does not affect the cache', () => {
    const cache = createRequestCache();
    cache.set('login', { request: {}, response: { status: 200, headers: [], body: 'a' } });
    const snapshot = cache.toObject();
    snapshot.login = 'mutated';
    snapshot.newKey = 'injected';
    assert.equal(cache.get('login').response.body, 'a');
    assert.equal(cache.get('newKey'), undefined);
  });

  test('an entry with response: undefined (failed request) round-trips as-is', () => {
    const cache = createRequestCache();
    const entry = { request: { method: 'GET', url: 'https://example.com/x', headers: [], body: undefined }, response: undefined };
    cache.set('flaky', entry);
    assert.deepEqual(cache.get('flaky'), entry);
    assert.equal(cache.toObject().flaky.response, undefined);
  });

  test('clear() empties the cache', () => {
    const cache = createRequestCache();
    cache.set('login', { request: {}, response: { status: 200, headers: [], body: 'a' } });
    cache.clear();
    assert.equal(cache.get('login'), undefined);
    assert.deepEqual(cache.toObject(), {});
  });

  test('RequestCache can be constructed directly, same as createRequestCache()', () => {
    const cache = new RequestCache();
    assert.deepEqual(cache.toObject(), {});
  });
});
