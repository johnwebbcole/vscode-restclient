/**
 * Configuration model for the Set-Cookie domain rewrite layer.
 *
 * The rewrite layer lets local development flows accept cookies that upstream services
 * scope to a production domain (for example `Domain=.example.com` returned to a request
 * against `localhost`).  It is disabled by default and only ever acts on cookies whose
 * domain is explicitly listed in a rule.
 */

export enum CookieDomainRewriteStrategy {
    /** Replace the cookie `Domain` attribute with the host of the current request. */
    RequestHost = 'requestHost',
    /** Drop the `Domain` attribute entirely, storing the cookie as a host-only cookie. */
    HostOnly = 'hostOnly',
    /** Discard the cookie instead of storing it. */
    Drop = 'drop',
}

export interface CookieDomainRewriteRule {
    /**
     * Domain pattern the cookie `Domain` attribute must match for this rule to apply.
     * Supports an exact domain (`example.com`), a wildcard suffix (`*.example.com`, which
     * also matches the apex domain) or `*` for any domain.
     */
    readonly domain: string;
    readonly strategy: CookieDomainRewriteStrategy;
    /**
     * Also strip the `Secure` attribute from the rewritten cookie.  A `Secure` cookie
     * rewritten onto a plain `http://` development origin is stored but never sent back;
     * this opt-in removes that attribute so the cookie is usable over plain HTTP.
     * Ignored by the `drop` strategy.  Defaults to false.
     */
    readonly removeSecure?: boolean;
}

export interface CookieDomainRewriteSettings {
    readonly enabled: boolean;
    readonly rules: CookieDomainRewriteRule[];
    /**
     * Request hosts on which rewriting is permitted.  An empty list means no host
     * restriction is applied; the `enabled` flag is then the only gate.
     */
    readonly allowedRequestHosts: string[];
}

export const defaultAllowedRequestHosts: string[] = ['localhost', '127.0.0.1', '::1'];

export const disabledCookieDomainRewriteSettings: CookieDomainRewriteSettings = {
    enabled: false,
    rules: [],
    allowedRequestHosts: [],
};

export function strategyFromString(value: string | undefined): CookieDomainRewriteStrategy | undefined {
    switch (value?.trim().toLowerCase()) {
        case 'requesthost':
            return CookieDomainRewriteStrategy.RequestHost;
        case 'hostonly':
            return CookieDomainRewriteStrategy.HostOnly;
        case 'drop':
            return CookieDomainRewriteStrategy.Drop;
        default:
            return undefined;
    }
}

/**
 * Converts raw user configuration into rules.  Entries that are malformed or name an
 * unknown strategy are discarded rather than guessed at, so an unrecognized value can
 * never widen what gets rewritten.
 */
export function normalizeCookieDomainRewriteRules(value: unknown): CookieDomainRewriteRule[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const rules: CookieDomainRewriteRule[] = [];
    for (const entry of value) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }

        const { domain, strategy, removeSecure } = entry as { domain?: unknown; strategy?: unknown; removeSecure?: unknown };
        if (typeof domain !== 'string' || domain.trim() === '') {
            continue;
        }

        const parsedStrategy = strategyFromString(typeof strategy === 'string' ? strategy : undefined);
        if (parsedStrategy === undefined) {
            continue;
        }

        // Anything other than an explicit `true` leaves Secure in place.
        rules.push({ domain: domain.trim(), strategy: parsedStrategy, removeSecure: removeSecure === true });
    }

    return rules;
}

export function normalizeAllowedRequestHosts(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((host): host is string => typeof host === 'string' && host.trim() !== '')
        .map(host => host.trim());
}
