const BODY_LESS_METHODS = new Set(['GET', 'HEAD']);

function extractSetCookieHeaders(response, responseHeaders) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }
  return responseHeaders.filter(([name]) => name.toLowerCase() === 'set-cookie').map(([, value]) => value);
}

/**
 * Sends a parsed request { method, url, headers: [[k,v],...], body } using
 * the platform fetch implementation. Returns a plain-object response
 * compatible with the {{name.response...}} chaining variables.
 *
 * When `cookieJar` is supplied and `useCookieJar` isn't false, matching jar
 * cookies are attached as a Cookie header (unless the request already sets
 * one explicitly, which always wins) and Set-Cookie headers from the
 * response are stored back into the jar. The returned `cookies` field never
 * includes cookie values - only counts - so summaries/logs stay safe to share.
 */
export async function sendRequest({ method, url, headers, body }, { timeoutMs = 30000, cookieJar, useCookieJar = true } = {}) {
  const headerEntries = headers || [];
  const fetchHeaders = new Headers();
  for (const [name, value] of headerEntries) {
    fetchHeaders.append(name, value);
  }

  const jarActive = Boolean(useCookieJar && cookieJar);
  const explicitHeaderOverride = jarActive && headerEntries.some(([name]) => name.toLowerCase() === 'cookie');
  let cookiesSent = 0;
  if (jarActive && !explicitHeaderOverride) {
    const { header, count } = cookieJar.getCookieHeader(url);
    if (header) {
      fetchHeaders.append('Cookie', header);
      cookiesSent = count;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const start = Date.now();
  try {
    const response = await fetch(url, {
      method,
      headers: fetchHeaders,
      body: BODY_LESS_METHODS.has(method.toUpperCase()) ? undefined : body,
      redirect: 'follow',
      signal: controller.signal,
    });

    const responseHeaders = [...response.headers.entries()];
    const bodyText = await response.text();

    let cookiesReceived = 0;
    if (jarActive) {
      const setCookieHeaders = extractSetCookieHeaders(response, responseHeaders);
      if (setCookieHeaders.length > 0) {
        cookiesReceived = cookieJar.addFromResponse(url, setCookieHeaders);
      }
    }

    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body: bodyText,
      durationMs: Date.now() - start,
      request: { method, url, headers: headerEntries, body },
      cookies: { received: cookiesReceived, sent: cookiesSent, explicitHeaderOverride },
    };
  } catch (err) {
    let errorMessage;
    if (controller.signal.aborted) {
      errorMessage = `Request timed out after ${timeoutMs}ms`;
    } else {
      const cause = err && err.cause && err.cause.message;
      const message = err && err.message || String(err);
      errorMessage = cause ? `${message}: ${cause}` : message;
    }
    return {
      ok: false,
      error: errorMessage,
      durationMs: Date.now() - start,
      request: { method, url, headers: headerEntries, body },
      cookies: { received: 0, sent: cookiesSent, explicitHeaderOverride },
    };
  } finally {
    clearTimeout(timeout);
  }
}
