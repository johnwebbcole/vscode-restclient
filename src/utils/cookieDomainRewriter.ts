import { canonicalDomain, Cookie, CookieJar, domainMatch } from 'tough-cookie';
import { CookieDomainRewriteSettings, CookieDomainRewriteStrategy } from '../models/cookieDomainRewrite';

export type CookieRewriteAction = 'keep' | 'rewrite' | 'drop';

export interface CookieRewriteResult {
    /** `keep` leaves the header untouched, `rewrite` replaces it, `drop` discards the cookie. */
    readonly action: CookieRewriteAction;
    /** The header to hand to the cookie jar.  Undefined only when the cookie is dropped. */
    readonly rawCookie?: string;
    /** Canonicalized host of the request that produced the Set-Cookie header. */
    readonly requestHost?: string;
    readonly originalDomain?: string;
    readonly rewrittenDomain?: string;
    /** True when the rule stripped a `Secure` attribute the original cookie actually carried. */
    readonly secureRemoved?: boolean;
    readonly strategy?: CookieDomainRewriteStrategy;
}

export type CookieRewriteLogger = (message: string) => void;

/**
 * Inspects a single `Set-Cookie` header and, when the configured rules say so, rewrites its
 * `Domain` attribute so the cookie can be stored for the current request host.
 *
 * The header is returned unchanged unless every one of these holds:
 *   - rewriting is enabled and at least one rule is configured;
 *   - the request host is on the allow list (when one is configured);
 *   - the cookie carries a `Domain` attribute that does *not* match the request host;
 *   - a rule matches that domain.
 *
 * All other cookie attributes (Path, Secure, HttpOnly, SameSite, Expires, Max-Age and any
 * extension attributes) are carried across verbatim, the single exception being `Secure` on a
 * rule that opts into `removeSecure`.
 */
export function rewriteSetCookieHeader(
    rawCookie: string,
    requestUrl: string,
    settings: CookieDomainRewriteSettings): CookieRewriteResult {

    const requestHost = getRequestHost(requestUrl);
    const unchanged: CookieRewriteResult = { action: 'keep', rawCookie, requestHost };

    if (!settings?.enabled || !settings.rules || settings.rules.length === 0) {
        return unchanged;
    }

    if (!requestHost || !isRequestHostAllowed(requestHost, settings.allowedRequestHosts)) {
        return unchanged;
    }

    let cookie: Cookie | undefined;
    try {
        cookie = Cookie.parse(rawCookie);
    } catch {
        return unchanged;
    }

    // No Domain attribute means the cookie is already host-only, so there is nothing to mismatch.
    const originalDomain = cookie?.domain ? canonicalDomain(cookie.domain) : undefined;
    if (!originalDomain) {
        return unchanged;
    }

    // Domains the request host already belongs to are left strictly alone.
    if (domainMatch(requestHost, originalDomain, true)) {
        return unchanged;
    }

    const rule = settings.rules.find(r => domainPatternMatches(r.domain, originalDomain));
    if (!rule) {
        return unchanged;
    }

    if (rule.strategy === CookieDomainRewriteStrategy.Drop) {
        return { action: 'drop', requestHost, originalDomain, strategy: rule.strategy };
    }

    const secureRemoved = rule.removeSecure === true && cookie!.secure;
    const strippedAttributes = secureRemoved ? ['domain', 'secure'] : ['domain'];
    const stripped = removeAttributes(rawCookie, strippedAttributes);

    // A cookie for an IP-address host cannot carry a Domain attribute at all, so scoping it to
    // that host means storing it as a host-only cookie.
    const keepsDomain = rule.strategy === CookieDomainRewriteStrategy.RequestHost && !isIpAddress(requestHost);

    return {
        action: 'rewrite',
        rawCookie: keepsDomain ? `${stripped}; Domain=${requestHost}` : stripped,
        requestHost,
        originalDomain,
        rewrittenDomain: keepsDomain ? requestHost : undefined,
        secureRemoved,
        strategy: rule.strategy
    };
}

export function describeCookieRewrite(result: CookieRewriteResult): string {
    const target = result.action === 'drop'
        ? 'dropped'
        : result.rewrittenDomain
            ? `rewritten to domain '${result.rewrittenDomain}'`
            : 'rewritten to a host-only cookie';
    const secure = result.secureRemoved ? ' The Secure attribute was removed.' : '';
    return `Set-Cookie domain '${result.originalDomain}' ${target} for request host '${result.requestHost}' (strategy: ${result.strategy}).${secure}`;
}

/**
 * A `tough-cookie` compatible jar that runs {@link rewriteSetCookieHeader} before delegating
 * to the real jar.  Only the two members `got` uses are exposed.
 */
export class DomainRewritingCookieJar {
    public constructor(
        private readonly jar: CookieJar,
        private readonly settings: CookieDomainRewriteSettings,
        private readonly log?: CookieRewriteLogger) {
    }

    public async setCookie(rawCookie: string, currentUrl: string): Promise<Cookie | undefined> {
        const result = rewriteSetCookieHeader(rawCookie, currentUrl, this.settings);
        if (result.action !== 'keep') {
            this.log?.(describeCookieRewrite(result));
        }

        if (result.action === 'drop') {
            return undefined;
        }

        return this.jar.setCookie(result.rawCookie!, currentUrl);
    }

    public async getCookieString(currentUrl: string): Promise<string> {
        return this.jar.getCookieString(currentUrl);
    }
}

const ipv4Regex = /^\d{1,3}(\.\d{1,3}){3}$/;

function isIpAddress(host: string): boolean {
    // canonicalDomain() strips the brackets from an IPv6 literal, leaving its colons behind.
    return ipv4Regex.test(host) || host.includes(':');
}

function getRequestHost(requestUrl: string): string | undefined {
    try {
        return canonicalDomain(new URL(requestUrl).hostname);
    } catch {
        return undefined;
    }
}

function isRequestHostAllowed(requestHost: string, allowedRequestHosts: string[]): boolean {
    if (!allowedRequestHosts || allowedRequestHosts.length === 0) {
        return true;
    }

    return allowedRequestHosts.some(host => domainPatternMatches(host, requestHost));
}

function domainPatternMatches(pattern: string, domain: string): boolean {
    const normalized = pattern.trim().toLowerCase();
    if (normalized === '' || domain === '') {
        return false;
    }

    if (normalized === '*') {
        return true;
    }

    if (normalized.startsWith('*.')) {
        const suffix = canonicalDomain(normalized.slice(2));
        return !!suffix && (domain === suffix || domain.endsWith(`.${suffix}`));
    }

    // A leading dot is accepted for convenience; cookie domains are canonicalized without one.
    const exact = canonicalDomain(normalized.replace(/^\./, ''));
    return !!exact && domain === exact;
}

/**
 * Removes the named attributes from a Set-Cookie header, leaving the cookie pair and every
 * other attribute untouched.  Cookie values cannot contain `;`, so splitting on it is safe.
 */
function removeAttributes(rawCookie: string, names: string[]): string {
    const [nameValuePair, ...attributes] = rawCookie.split(';');
    const preserved = attributes.filter(attribute => !names.includes(attributeName(attribute)));
    return [nameValuePair, ...preserved].join(';');
}

function attributeName(attribute: string): string {
    return attribute.split('=')[0].trim().toLowerCase();
}
