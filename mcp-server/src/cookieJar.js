// Monotonic tie-breaker for cookie creation order, used to keep header output
// deterministic when two cookies are parsed within the same millisecond.
let sequenceCounter = 0;

function parseCookiePair(pair) {
  const eqIndex = pair.indexOf('=');
  if (eqIndex <= 0) return null;
  const name = pair.slice(0, eqIndex).trim();
  const value = pair.slice(eqIndex + 1).trim();
  if (!name) return null;
  return { name, value };
}

// RFC 6265 5.1.4 default-path algorithm.
function defaultPath(pathname) {
  if (!pathname || pathname[0] !== '/') return '/';
  const lastSlash = pathname.lastIndexOf('/');
  if (lastSlash === 0) return '/';
  return pathname.slice(0, lastSlash);
}

// True if `hostname` is exactly `cookieDomain` or a subdomain of it.
function domainMatches(cookieDomain, hostname) {
  const host = hostname.toLowerCase();
  return host === cookieDomain || host.endsWith(`.${cookieDomain}`);
}

// RFC 6265 5.1.4 path-match algorithm.
function pathMatches(cookiePath, requestPath) {
  if (requestPath === cookiePath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/';
}

/**
 * Parses one Set-Cookie header value into a cookie record, relative to the
 * URL of the response it came from. Returns null if the header has no usable
 * name=value pair. `requestUrl` must be a URL instance.
 *
 * A Domain attribute that doesn't domain-match the response's own host is
 * ignored (falls back to a host-only cookie) rather than rejecting the whole
 * cookie - this mirrors real cookie jars refusing to let a server set cookies
 * for domains it doesn't control.
 */
export function parseSetCookieHeader(headerValue, requestUrl) {
  if (typeof headerValue !== 'string' || headerValue.length === 0) return null;
  const parts = headerValue.split(';').map(p => p.trim()).filter(p => p.length > 0);
  if (parts.length === 0) return null;

  const pair = parseCookiePair(parts[0]);
  if (!pair) return null;

  const requestHost = requestUrl.hostname.toLowerCase();

  let domain = requestHost;
  let hostOnly = true;
  let path;
  let expires = null; // null = session cookie, kept for the life of the process
  let maxAgeExpires;
  let secure = false;
  let httpOnly = false;
  let sameSite;

  for (let i = 1; i < parts.length; i++) {
    const attr = parts[i];
    const eqIndex = attr.indexOf('=');
    const attrName = (eqIndex === -1 ? attr : attr.slice(0, eqIndex)).trim().toLowerCase();
    const attrValue = eqIndex === -1 ? '' : attr.slice(eqIndex + 1).trim();

    switch (attrName) {
      case 'domain': {
        if (attrValue) {
          const normalized = attrValue.toLowerCase().replace(/^\./, '');
          if (normalized && domainMatches(normalized, requestHost)) {
            domain = normalized;
            hostOnly = false;
          }
        }
        break;
      }
      case 'path':
        if (attrValue.startsWith('/')) path = attrValue;
        break;
      case 'expires': {
        const parsed = Date.parse(attrValue);
        if (!Number.isNaN(parsed)) expires = parsed;
        break;
      }
      case 'max-age': {
        if (/^-?\d+$/.test(attrValue)) {
          const seconds = Number.parseInt(attrValue, 10);
          maxAgeExpires = seconds <= 0 ? 0 : Date.now() + seconds * 1000;
        }
        break;
      }
      case 'secure':
        secure = true;
        break;
      case 'httponly':
        httpOnly = true;
        break;
      case 'samesite':
        sameSite = attrValue || undefined;
        break;
      default:
        break;
    }
  }

  // Max-Age takes precedence over Expires per RFC 6265 5.3.
  if (maxAgeExpires !== undefined) expires = maxAgeExpires;
  if (!path) path = defaultPath(requestUrl.pathname);

  return { name: pair.name, value: pair.value, domain, path, expires, secure, httpOnly, sameSite, hostOnly };
}

/**
 * An in-memory, process-lifetime cookie jar. Not persisted to disk - cookies
 * live only as long as the MCP server process does.
 */
export class CookieJar {
  constructor() {
    this.store = new Map(); // "domain|path|name" -> cookie record
  }

  clear() {
    this.store.clear();
  }

  pruneExpired(now = Date.now()) {
    for (const [key, cookie] of this.store) {
      if (cookie.expires !== null && cookie.expires <= now) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Parses Set-Cookie header values from a response to `url` and stores/updates
   * matching cookies. A cookie that is already expired (e.g. Max-Age=0, used by
   * servers to clear a cookie) removes any existing match instead of being
   * stored. Returns the number of Set-Cookie headers that parsed successfully.
   */
  addFromResponse(url, setCookieHeaders) {
    if (!setCookieHeaders || setCookieHeaders.length === 0) return 0;
    const requestUrl = url instanceof URL ? url : new URL(url);
    this.pruneExpired();

    let received = 0;
    for (const headerValue of setCookieHeaders) {
      const parsed = parseSetCookieHeader(headerValue, requestUrl);
      if (!parsed) continue;
      received += 1;

      const key = `${parsed.domain}|${parsed.path}|${parsed.name}`;
      if (parsed.expires !== null && parsed.expires <= Date.now()) {
        this.store.delete(key);
        continue;
      }

      // Preserve the original creation order on update (RFC 6265 5.3 step 11),
      // so re-issuing a cookie doesn't reshuffle send order.
      const existing = this.store.get(key);
      const created = existing ? existing.created : sequenceCounter++;
      this.store.set(key, { ...parsed, created });
    }
    return received;
  }

  /**
   * Builds the Cookie header value for a request to `url` from jar contents,
   * matching on domain, path, and the secure flag. Returns { header, count };
   * header is null when no cookies match.
   */
  getCookieHeader(url) {
    const requestUrl = url instanceof URL ? url : new URL(url);
    this.pruneExpired();

    const requestHost = requestUrl.hostname.toLowerCase();
    const requestPath = requestUrl.pathname || '/';
    const isHttps = requestUrl.protocol === 'https:';

    const matches = [];
    for (const cookie of this.store.values()) {
      if (cookie.secure && !isHttps) continue;
      const hostMatches = cookie.hostOnly ? requestHost === cookie.domain : domainMatches(cookie.domain, requestHost);
      if (!hostMatches) continue;
      if (!pathMatches(cookie.path, requestPath)) continue;
      matches.push(cookie);
    }

    // Longer paths first, then original creation order, then name - all purely
    // to make header output deterministic (RFC 6265 5.4 recommends the first two).
    matches.sort((a, b) => {
      if (b.path.length !== a.path.length) return b.path.length - a.path.length;
      if (a.created !== b.created) return a.created - b.created;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });

    if (matches.length === 0) return { header: null, count: 0 };
    return { header: matches.map(c => `${c.name}=${c.value}`).join('; '), count: matches.length };
  }
}

export function createCookieJar() {
  return new CookieJar();
}
