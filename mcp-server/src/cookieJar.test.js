import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CookieJar, createCookieJar, parseSetCookieHeader } from './cookieJar.js';

const URL_HTTPS = new URL('https://example.com/app/');
const URL_HTTP = new URL('http://example.com/app/');

describe('parseSetCookieHeader', () => {
  test('parses a single simple cookie', () => {
    const cookie = parseSetCookieHeader('session=abc123', URL_HTTPS);
    assert.equal(cookie.name, 'session');
    assert.equal(cookie.value, 'abc123');
    assert.equal(cookie.domain, 'example.com');
    assert.equal(cookie.path, '/app');
    assert.equal(cookie.expires, null);
    assert.equal(cookie.secure, false);
    assert.equal(cookie.httpOnly, false);
    assert.equal(cookie.hostOnly, true);
  });

  test('parses domain, path, secure, httpOnly, sameSite attributes', () => {
    const cookie = parseSetCookieHeader(
      'id=xyz; Domain=example.com; Path=/api; Secure; HttpOnly; SameSite=Strict',
      URL_HTTPS,
    );
    assert.equal(cookie.domain, 'example.com');
    assert.equal(cookie.path, '/api');
    assert.equal(cookie.secure, true);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, 'Strict');
    assert.equal(cookie.hostOnly, false);
  });

  test('normalizes a leading dot on Domain', () => {
    const cookie = parseSetCookieHeader('id=xyz; Domain=.example.com', URL_HTTPS);
    assert.equal(cookie.domain, 'example.com');
    assert.equal(cookie.hostOnly, false);
  });

  test('ignores a Domain attribute unrelated to the response host', () => {
    const cookie = parseSetCookieHeader('id=xyz; Domain=evil.com', URL_HTTPS);
    assert.equal(cookie.domain, 'example.com');
    assert.equal(cookie.hostOnly, true);
  });

  test('computes default path from the response URL when Path is absent', () => {
    const cookie = parseSetCookieHeader('id=xyz', new URL('https://example.com/a/b/c'));
    assert.equal(cookie.path, '/a/b');
  });

  test('defaults to "/" when the response path has no parent segment', () => {
    const cookie = parseSetCookieHeader('id=xyz', new URL('https://example.com/'));
    assert.equal(cookie.path, '/');
  });

  test('ignores a Path attribute that does not start with "/"', () => {
    const cookie = parseSetCookieHeader('id=xyz; Path=relative', URL_HTTPS);
    assert.equal(cookie.path, '/app');
  });

  test('parses Expires into an epoch-ms timestamp', () => {
    const cookie = parseSetCookieHeader('id=xyz; Expires=Wed, 21 Oct 2099 07:28:00 GMT', URL_HTTPS);
    assert.equal(cookie.expires, Date.parse('Wed, 21 Oct 2099 07:28:00 GMT'));
  });

  test('ignores an unparseable Expires value (stays a session cookie)', () => {
    const cookie = parseSetCookieHeader('id=xyz; Expires=not-a-date', URL_HTTPS);
    assert.equal(cookie.expires, null);
  });

  test('Max-Age computes an absolute expiry from now', () => {
    const before = Date.now();
    const cookie = parseSetCookieHeader('id=xyz; Max-Age=60', URL_HTTPS);
    const after = Date.now();
    assert.ok(cookie.expires >= before + 60_000 && cookie.expires <= after + 60_000);
  });

  test('Max-Age takes precedence over Expires', () => {
    const cookie = parseSetCookieHeader(
      'id=xyz; Expires=Wed, 21 Oct 2099 07:28:00 GMT; Max-Age=60',
      URL_HTTPS,
    );
    assert.notEqual(cookie.expires, Date.parse('Wed, 21 Oct 2099 07:28:00 GMT'));
    assert.ok(cookie.expires <= Date.now() + 60_000);
  });

  test('Max-Age=0 produces an already-expired timestamp', () => {
    const cookie = parseSetCookieHeader('id=xyz; Max-Age=0', URL_HTTPS);
    assert.equal(cookie.expires, 0);
  });

  test('returns null for a header with no name=value pair', () => {
    assert.equal(parseSetCookieHeader('', URL_HTTPS), null);
    assert.equal(parseSetCookieHeader('=novalue', URL_HTTPS), null);
    assert.equal(parseSetCookieHeader(';;;', URL_HTTPS), null);
  });

  test('preserves "=" characters inside the cookie value', () => {
    const cookie = parseSetCookieHeader('token=abc==def', URL_HTTPS);
    assert.equal(cookie.value, 'abc==def');
  });
});

describe('CookieJar.addFromResponse / getCookieHeader (matching + precedence)', () => {
  test('round-trips a single cookie from response to a later request', () => {
    const jar = createCookieJar();
    jar.addFromResponse('https://example.com/login', ['session=abc123; Path=/']);
    const { header, count } = jar.getCookieHeader('https://example.com/dashboard');
    assert.equal(header, 'session=abc123');
    assert.equal(count, 1);
  });

  test('handles multiple Set-Cookie headers from one response', () => {
    const jar = createCookieJar();
    const received = jar.addFromResponse('https://example.com/login', [
      'a=1; Path=/',
      'b=2; Path=/',
    ]);
    assert.equal(received, 2);
    const { header } = jar.getCookieHeader('https://example.com/');
    assert.ok(header.includes('a=1'));
    assert.ok(header.includes('b=2'));
  });

  test('a host-only cookie is not sent to a subdomain', () => {
    const jar = new CookieJar();
    jar.addFromResponse('https://example.com/', ['id=1']); // no Domain attr -> host-only
    assert.equal(jar.getCookieHeader('https://sub.example.com/').header, null);
  });

  test('a cookie with an explicit Domain attribute is sent to subdomains', () => {
    const jar = new CookieJar();
    jar.addFromResponse('https://example.com/', ['id=1; Domain=example.com']);
    assert.equal(jar.getCookieHeader('https://sub.example.com/').header, 'id=1');
  });

  test('a cookie is not sent to an unrelated domain', () => {
    const jar = new CookieJar();
    jar.addFromResponse('https://example.com/', ['id=1; Domain=example.com']);
    assert.equal(jar.getCookieHeader('https://other.com/').header, null);
  });

  test('path prefix matching sends cookies at or below their path', () => {
    const jar = new CookieJar();
    jar.addFromResponse('https://example.com/api/login', ['id=1; Path=/api']);
    assert.equal(jar.getCookieHeader('https://example.com/api').header, 'id=1');
    assert.equal(jar.getCookieHeader('https://example.com/api/users').header, 'id=1');
    assert.equal(jar.getCookieHeader('https://example.com/other').header, null);
  });

  test('path prefix does not match a sibling directory sharing a string prefix', () => {
    const jar = new CookieJar();
    jar.addFromResponse('https://example.com/api', ['id=1; Path=/api']);
    assert.equal(jar.getCookieHeader('https://example.com/apiextra').header, null);
  });

  test('secure cookies are withheld from plain http requests', () => {
    const jar = new CookieJar();
    jar.addFromResponse('https://example.com/', ['id=1; Secure']);
    assert.equal(jar.getCookieHeader('http://example.com/').header, null);
    assert.equal(jar.getCookieHeader('https://example.com/').header, 'id=1');
  });

  test('non-secure cookies are sent on both http and https', () => {
    const jar = new CookieJar();
    jar.addFromResponse('http://example.com/', ['id=1']);
    assert.equal(jar.getCookieHeader('http://example.com/').header, 'id=1');
    assert.equal(jar.getCookieHeader('https://example.com/').header, 'id=1');
  });

  test('expired cookies (Expires in the past) are not sent', () => {
    const jar = new CookieJar();
    jar.addFromResponse('https://example.com/', ['id=1; Expires=Wed, 21 Oct 2015 07:28:00 GMT']);
    assert.equal(jar.getCookieHeader('https://example.com/').header, null);
  });

  test('Max-Age=0 clears a previously stored cookie', () => {
    const jar = new CookieJar();
    jar.addFromResponse('https://example.com/', ['id=1']);
    assert.equal(jar.getCookieHeader('https://example.com/').header, 'id=1');
    jar.addFromResponse('https://example.com/', ['id=1; Max-Age=0']);
    assert.equal(jar.getCookieHeader('https://example.com/').header, null);
  });

  test('supports same-named cookies distinguished by domain or path', () => {
    const jar = new CookieJar();
    jar.addFromResponse('https://a.example.com/', ['id=fromA; Domain=a.example.com']);
    jar.addFromResponse('https://b.example.com/', ['id=fromB; Domain=b.example.com']);
    assert.equal(jar.getCookieHeader('https://a.example.com/').header, 'id=fromA');
    assert.equal(jar.getCookieHeader('https://b.example.com/').header, 'id=fromB');

    jar.addFromResponse('https://example.com/foo', ['x=foo; Path=/foo']);
    jar.addFromResponse('https://example.com/bar', ['x=bar; Path=/bar']);
    assert.equal(jar.getCookieHeader('https://example.com/foo').header, 'x=foo');
    assert.equal(jar.getCookieHeader('https://example.com/bar').header, 'x=bar');
  });

  test('updating a cookie with the same name/domain/path replaces its value', () => {
    const jar = new CookieJar();
    jar.addFromResponse('https://example.com/', ['id=1']);
    jar.addFromResponse('https://example.com/', ['id=2']);
    assert.equal(jar.getCookieHeader('https://example.com/').header, 'id=2');
  });

  test('sends deterministic, longer-path-first ordering across multiple cookies', () => {
    const jar = new CookieJar();
    jar.addFromResponse('https://example.com/', ['short=1; Path=/']);
    jar.addFromResponse('https://example.com/api', ['long=1; Path=/api']);
    const { header } = jar.getCookieHeader('https://example.com/api/sub');
    assert.equal(header, 'long=1; short=1');
  });

  test('pruneExpired removes stale cookies proactively', () => {
    const jar = new CookieJar();
    jar.addFromResponse('https://example.com/', ['id=1; Max-Age=100']);
    assert.equal(jar.store.size, 1);
    jar.pruneExpired(Date.now() + 200_000);
    assert.equal(jar.store.size, 0);
  });

  test('clear() empties the jar', () => {
    const jar = new CookieJar();
    jar.addFromResponse('https://example.com/', ['id=1']);
    jar.clear();
    assert.equal(jar.getCookieHeader('https://example.com/').header, null);
  });

  test('addFromResponse with no headers is a no-op that reports 0', () => {
    const jar = new CookieJar();
    assert.equal(jar.addFromResponse('https://example.com/', []), 0);
    assert.equal(jar.addFromResponse('https://example.com/', undefined), 0);
  });

  test('an unparseable Set-Cookie header is skipped without throwing', () => {
    const jar = new CookieJar();
    const received = jar.addFromResponse('https://example.com/', ['', 'good=1']);
    assert.equal(received, 1);
    assert.equal(jar.getCookieHeader('https://example.com/').header, 'good=1');
  });
});
