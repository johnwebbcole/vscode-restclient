import * as http from 'http';
import { CookieJar, MemoryCookieStore } from 'tough-cookie';
import {
    CookieDomainRewriteSettings,
    CookieDomainRewriteStrategy,
    normalizeAllowedRequestHosts,
    normalizeCookieDomainRewriteRules
} from '../../src/models/cookieDomainRewrite';
import { DomainRewritingCookieJar, rewriteSetCookieHeader } from '../../src/utils/cookieDomainRewriter';

const localhostUrl = 'http://localhost:3000/api/session';

function makeSettings(overrides: Partial<CookieDomainRewriteSettings> = {}): CookieDomainRewriteSettings {
    return {
        enabled: true,
        rules: [{ domain: 'jwc.dev', strategy: CookieDomainRewriteStrategy.RequestHost }],
        allowedRequestHosts: [],
        ...overrides
    };
}

function makeJar(settings: CookieDomainRewriteSettings, log?: (message: string) => void) {
    const inner = new CookieJar(new MemoryCookieStore());
    return { inner, jar: new DomainRewritingCookieJar(inner, settings, log) };
}

describe('rewriteSetCookieHeader', () => {
    it('rewrites a production Domain to the request host for a localhost request', () => {
        const result = rewriteSetCookieHeader('sid=fake-session; Domain=.jwc.dev; Path=/', localhostUrl, makeSettings());

        expect(result.action).toBe('rewrite');
        expect(result.originalDomain).toBe('jwc.dev');
        expect(result.rewrittenDomain).toBe('localhost');
        expect(result.rawCookie).toBe('sid=fake-session; Path=/; Domain=localhost');
    });

    it('preserves every other cookie attribute when rewriting', () => {
        const rawCookie = 'sid=fake-session; Domain=.jwc.dev; Path=/api; Expires=Wed, 21 Oct 2099 07:28:00 GMT; Max-Age=3600; Secure; HttpOnly; SameSite=Lax';

        const result = rewriteSetCookieHeader(rawCookie, localhostUrl, makeSettings());

        expect(result.rawCookie).toBe(
            'sid=fake-session; Path=/api; Expires=Wed, 21 Oct 2099 07:28:00 GMT; Max-Age=3600; Secure; HttpOnly; SameSite=Lax; Domain=localhost');
    });

    it('drops the Domain attribute for the hostOnly strategy', () => {
        const settings = makeSettings({
            rules: [{ domain: 'jwc.dev', strategy: CookieDomainRewriteStrategy.HostOnly }]
        });

        const result = rewriteSetCookieHeader('sid=fake-session; Domain=.jwc.dev; Path=/; HttpOnly', localhostUrl, settings);

        expect(result.action).toBe('rewrite');
        expect(result.rawCookie).toBe('sid=fake-session; Path=/; HttpOnly');
        expect(result.rewrittenDomain).toBeUndefined();
    });

    it('leaves Secure in place unless the rule opts in', () => {
        const result = rewriteSetCookieHeader('sid=fake-session; Domain=.jwc.dev; Path=/; Secure', localhostUrl, makeSettings());

        expect(result.rawCookie).toBe('sid=fake-session; Path=/; Secure; Domain=localhost');
        expect(result.secureRemoved).toBe(false);
    });

    it('strips Secure when the rule sets removeSecure', () => {
        const settings = makeSettings({
            rules: [{ domain: 'jwc.dev', strategy: CookieDomainRewriteStrategy.RequestHost, removeSecure: true }]
        });

        const result = rewriteSetCookieHeader(
            'sid=fake-session; Domain=.jwc.dev; Path=/; Secure; HttpOnly; SameSite=Lax', localhostUrl, settings);

        expect(result.rawCookie).toBe('sid=fake-session; Path=/; HttpOnly; SameSite=Lax; Domain=localhost');
        expect(result.secureRemoved).toBe(true);
    });

    it('strips Secure for the hostOnly strategy too', () => {
        const settings = makeSettings({
            rules: [{ domain: 'jwc.dev', strategy: CookieDomainRewriteStrategy.HostOnly, removeSecure: true }]
        });

        const result = rewriteSetCookieHeader('sid=fake-session; Domain=.jwc.dev; Path=/; secure', localhostUrl, settings);

        expect(result.rawCookie).toBe('sid=fake-session; Path=/');
        expect(result.secureRemoved).toBe(true);
    });

    it('reports no Secure removal when the cookie was not Secure to begin with', () => {
        const settings = makeSettings({
            rules: [{ domain: 'jwc.dev', strategy: CookieDomainRewriteStrategy.RequestHost, removeSecure: true }]
        });

        const result = rewriteSetCookieHeader('sid=fake-session; Domain=.jwc.dev; Path=/', localhostUrl, settings);

        expect(result.rawCookie).toBe('sid=fake-session; Path=/; Domain=localhost');
        expect(result.secureRemoved).toBe(false);
    });

    it('discards the cookie for the drop strategy', () => {
        const settings = makeSettings({
            rules: [{ domain: 'jwc.dev', strategy: CookieDomainRewriteStrategy.Drop }]
        });

        const result = rewriteSetCookieHeader('sid=fake-session; Domain=.jwc.dev', localhostUrl, settings);

        expect(result.action).toBe('drop');
        expect(result.rawCookie).toBeUndefined();
    });

    it('leaves the header untouched when the cookie domain already matches the request host', () => {
        const rawCookie = 'sid=fake-session; Domain=.example.com; Path=/';
        const settings = makeSettings({
            rules: [{ domain: 'example.com', strategy: CookieDomainRewriteStrategy.RequestHost }]
        });

        const result = rewriteSetCookieHeader(rawCookie, 'https://api.example.com/session', settings);

        expect(result.action).toBe('keep');
        expect(result.rawCookie).toBe(rawCookie);
    });

    it('leaves host-only cookies untouched', () => {
        const rawCookie = 'sid=fake-session; Path=/';

        const result = rewriteSetCookieHeader(rawCookie, localhostUrl, makeSettings());

        expect(result.action).toBe('keep');
        expect(result.rawCookie).toBe(rawCookie);
    });

    it('leaves the header untouched when rewriting is disabled', () => {
        const rawCookie = 'sid=fake-session; Domain=.jwc.dev; Path=/';

        const result = rewriteSetCookieHeader(rawCookie, localhostUrl, makeSettings({ enabled: false }));

        expect(result.action).toBe('keep');
        expect(result.rawCookie).toBe(rawCookie);
    });

    it('leaves the header untouched when no rule matches the cookie domain', () => {
        const rawCookie = 'sid=fake-session; Domain=.example.com; Path=/';

        const result = rewriteSetCookieHeader(rawCookie, localhostUrl, makeSettings());

        expect(result.action).toBe('keep');
        expect(result.rawCookie).toBe(rawCookie);
    });

    it('does not rewrite when the request host is outside the allow list', () => {
        const rawCookie = 'sid=fake-session; Domain=.jwc.dev; Path=/';
        const settings = makeSettings({ allowedRequestHosts: ['localhost', '127.0.0.1'] });

        expect(rewriteSetCookieHeader(rawCookie, 'https://staging.internal.test/session', settings).action).toBe('keep');
        expect(rewriteSetCookieHeader(rawCookie, localhostUrl, settings).action).toBe('rewrite');
    });

    it('matches wildcard rule and allow-list patterns', () => {
        const settings = makeSettings({
            rules: [{ domain: '*.jwc.dev', strategy: CookieDomainRewriteStrategy.RequestHost }],
            allowedRequestHosts: ['*.localhost']
        });

        expect(rewriteSetCookieHeader('sid=fake-session; Domain=api.jwc.dev', 'http://app.localhost:3000/', settings).action).toBe('rewrite');
        expect(rewriteSetCookieHeader('sid=fake-session; Domain=jwc.dev', 'http://localhost:3000/', settings).action).toBe('rewrite');
        expect(rewriteSetCookieHeader('sid=fake-session; Domain=jwc.dev.example.com', 'http://localhost:3000/', settings).action).toBe('keep');
    });

    it('falls back to a host-only cookie for IP-address request hosts', () => {
        // Cookies for an IP host cannot carry a Domain attribute; tough-cookie rejects one.
        const settings = makeSettings({ allowedRequestHosts: ['127.0.0.1', '::1'] });

        for (const requestUrl of ['http://127.0.0.1:3000/', 'http://[::1]:3000/']) {
            const result = rewriteSetCookieHeader('sid=fake-session; Domain=.jwc.dev; Path=/', requestUrl, settings);

            expect(result.action).toBe('rewrite');
            expect(result.rawCookie).toBe('sid=fake-session; Path=/');
            expect(result.rewrittenDomain).toBeUndefined();
        }
    });

    it('leaves unparsable headers untouched', () => {
        const result = rewriteSetCookieHeader('not-a-cookie', localhostUrl, makeSettings());

        expect(result.action).toBe('keep');
        expect(result.rawCookie).toBe('not-a-cookie');
    });
});

describe('DomainRewritingCookieJar', () => {
    it('stores a jwc.dev cookie for a localhost request without a domain-mismatch error', async () => {
        const { inner, jar } = makeJar(makeSettings());

        await expect(jar.setCookie('sid=fake-session; Domain=.jwc.dev; Path=/', localhostUrl)).resolves.toBeDefined();
        await expect(inner.getCookieString(localhostUrl)).resolves.toBe('sid=fake-session');
    });

    it('stores a host-only cookie for localhost with the hostOnly strategy', async () => {
        const settings = makeSettings({
            rules: [{ domain: 'jwc.dev', strategy: CookieDomainRewriteStrategy.HostOnly }]
        });
        const { inner, jar } = makeJar(settings);

        const stored = await jar.setCookie('sid=fake-session; Domain=.jwc.dev; Path=/', localhostUrl);

        expect(stored!.hostOnly).toBe(true);
        expect(stored!.domain).toBe('localhost');
        await expect(inner.getCookieString(localhostUrl)).resolves.toBe('sid=fake-session');
    });

    it('stores a rewritten cookie for a loopback IP request host', async () => {
        const settings = makeSettings({ allowedRequestHosts: ['127.0.0.1'] });
        const { inner, jar } = makeJar(settings);
        const requestUrl = 'http://127.0.0.1:3000/api/session';

        const stored = await jar.setCookie('sid=fake-session; Domain=.jwc.dev; Path=/', requestUrl);

        expect(stored!.hostOnly).toBe(true);
        expect(stored!.domain).toBe('127.0.0.1');
        await expect(inner.getCookieString(requestUrl)).resolves.toBe('sid=fake-session');
    });

    // tough-cookie treats loopback origins as potentially trustworthy and hands Secure
    // cookies back over plain http://localhost regardless.  A non-loopback development host
    // is where removeSecure actually changes the outcome.
    const devHostUrl = 'http://dev.example.com:3000/api/session';

    function devHostSettings(removeSecure: boolean): CookieDomainRewriteSettings {
        return makeSettings({
            rules: [{ domain: 'jwc.dev', strategy: CookieDomainRewriteStrategy.RequestHost, removeSecure }],
            allowedRequestHosts: ['dev.example.com']
        });
    }

    it('sends a de-Secured cookie back over plain http on a non-loopback dev host', async () => {
        const { inner, jar } = makeJar(devHostSettings(true));

        const stored = await jar.setCookie('sid=fake-session; Domain=.jwc.dev; Path=/; Secure', devHostUrl);

        expect(stored!.secure).toBe(false);
        await expect(inner.getCookieString(devHostUrl)).resolves.toBe('sid=fake-session');
    });

    it('withholds a Secure cookie over plain http when removeSecure is not set', async () => {
        const { inner, jar } = makeJar(devHostSettings(false));

        // Stored fine - the domain mismatch is gone - but withheld over http, which is
        // exactly the gap removeSecure closes.
        const stored = await jar.setCookie('sid=fake-session; Domain=.jwc.dev; Path=/; Secure', devHostUrl);

        expect(stored!.secure).toBe(true);
        await expect(inner.getCookieString(devHostUrl)).resolves.toBe('');
        await expect(inner.getCookieString('https://dev.example.com:3000/api/session')).resolves.toBe('sid=fake-session');
    });

    it('still returns Secure cookies over http on loopback origins without removeSecure', async () => {
        const { inner, jar } = makeJar(makeSettings());

        await jar.setCookie('sid=fake-session; Domain=.jwc.dev; Path=/; Secure', localhostUrl);

        await expect(inner.getCookieString(localhostUrl)).resolves.toBe('sid=fake-session');
    });

    it('does not store a cookie matched by the drop strategy', async () => {
        const settings = makeSettings({
            rules: [{ domain: 'jwc.dev', strategy: CookieDomainRewriteStrategy.Drop }]
        });
        const { inner, jar } = makeJar(settings);

        await expect(jar.setCookie('sid=fake-session; Domain=.jwc.dev; Path=/', localhostUrl)).resolves.toBeUndefined();
        await expect(inner.getCookieString(localhostUrl)).resolves.toBe('');
    });

    it('stores matching-domain cookies unchanged, exactly as before', async () => {
        const settings = makeSettings({
            rules: [{ domain: 'example.com', strategy: CookieDomainRewriteStrategy.RequestHost }]
        });
        const { inner, jar } = makeJar(settings);
        const requestUrl = 'https://api.example.com/session';

        const stored = await jar.setCookie('sid=fake-session; Domain=.example.com; Path=/', requestUrl);

        expect(stored!.domain).toBe('example.com');
        expect(stored!.hostOnly).toBe(false);
        await expect(inner.getCookieString('https://other.example.com/x')).resolves.toBe('sid=fake-session');
    });

    it('still throws the domain-mismatch error when rewriting is disabled', async () => {
        const { jar } = makeJar(makeSettings({ enabled: false }));

        await expect(jar.setCookie('sid=fake-session; Domain=.jwc.dev; Path=/', localhostUrl))
            .rejects.toThrow(/Cookie not in this host's domain/);
    });

    it('still throws the domain-mismatch error for a request host outside the allow list', async () => {
        const { jar } = makeJar(makeSettings({ allowedRequestHosts: ['localhost'] }));

        await expect(jar.setCookie('sid=fake-session; Domain=.jwc.dev; Path=/', 'http://dev.internal.test/api'))
            .rejects.toThrow(/Cookie not in this host's domain/);
    });

    it('handles multiple Set-Cookie headers independently', async () => {
        const settings = makeSettings({
            rules: [
                { domain: 'jwc.dev', strategy: CookieDomainRewriteStrategy.RequestHost },
                { domain: 'tracking.example.com', strategy: CookieDomainRewriteStrategy.Drop }
            ]
        });
        const { inner, jar } = makeJar(settings);

        const rawCookies = [
            'sid=fake-session; Domain=.jwc.dev; Path=/',
            'theme=dark; Path=/',
            'track=fake-id; Domain=.tracking.example.com; Path=/',
            'csrf=fake-token; Domain=jwc.dev; Path=/; HttpOnly'
        ];

        await Promise.all(rawCookies.map(rawCookie => jar.setCookie(rawCookie, localhostUrl)));

        const cookieString = await inner.getCookieString(localhostUrl);
        expect(cookieString.split('; ').sort()).toEqual(['csrf=fake-token', 'sid=fake-session', 'theme=dark']);
    });

    it('logs the original domain, the outcome and the request host when a rewrite happens', async () => {
        const messages: string[] = [];
        const { jar } = makeJar(makeSettings(), message => messages.push(message));

        await jar.setCookie('sid=fake-session; Domain=.jwc.dev; Path=/', localhostUrl);
        await jar.setCookie('theme=dark; Path=/', localhostUrl);

        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain("'jwc.dev'");
        expect(messages[0]).toContain("domain 'localhost'");
        expect(messages[0]).toContain("request host 'localhost'");
    });

    it('mentions the removed Secure attribute in the log line', async () => {
        const messages: string[] = [];
        const settings = makeSettings({
            rules: [{ domain: 'jwc.dev', strategy: CookieDomainRewriteStrategy.RequestHost, removeSecure: true }]
        });
        const { jar } = makeJar(settings, message => messages.push(message));

        await jar.setCookie('sid=fake-session; Domain=.jwc.dev; Path=/; Secure', localhostUrl);

        expect(messages[0]).toContain('The Secure attribute was removed.');
    });

    it('delegates cookie retrieval to the underlying jar', async () => {
        const { inner, jar } = makeJar(makeSettings());
        await inner.setCookie('sid=fake-session; Path=/', localhostUrl);

        await expect(jar.getCookieString(localhostUrl)).resolves.toBe('sid=fake-session');
    });
});

describe('cookie rewrite configuration normalization', () => {
    it('keeps well-formed rules and discards malformed ones', () => {
        const rules = normalizeCookieDomainRewriteRules([
            { domain: ' jwc.dev ', strategy: 'requestHost', removeSecure: true },
            { domain: '*.example.com', strategy: 'HOSTONLY' },
            { domain: 'tracking.example.com', strategy: 'drop', removeSecure: 'yes' },
            { domain: 'bad.example.com', strategy: 'somethingElse' },
            { domain: '', strategy: 'drop' },
            { strategy: 'drop' },
            'jwc.dev',
            null
        ]);

        // Only an explicit boolean `true` turns removeSecure on; 'yes' is not it.
        expect(rules).toEqual([
            { domain: 'jwc.dev', strategy: CookieDomainRewriteStrategy.RequestHost, removeSecure: true },
            { domain: '*.example.com', strategy: CookieDomainRewriteStrategy.HostOnly, removeSecure: false },
            { domain: 'tracking.example.com', strategy: CookieDomainRewriteStrategy.Drop, removeSecure: false }
        ]);
    });

    it('returns an empty rule list for non-array configuration', () => {
        expect(normalizeCookieDomainRewriteRules(undefined)).toEqual([]);
        expect(normalizeCookieDomainRewriteRules('jwc.dev')).toEqual([]);
    });

    it('keeps only non-empty string entries in the allow list', () => {
        expect(normalizeAllowedRequestHosts([' localhost ', '', 3, null, '127.0.0.1'])).toEqual(['localhost', '127.0.0.1']);
        expect(normalizeAllowedRequestHosts(undefined)).toEqual([]);
    });
});

describe('DomainRewritingCookieJar with got', () => {
    let server: http.Server;
    let baseUrl: string;

    beforeAll(async () => {
        server = http.createServer((req, res) => {
            res.setHeader('Set-Cookie', ['sid=fake-session; Domain=.jwc.dev; Path=/; HttpOnly', 'theme=dark; Path=/']);
            res.end(JSON.stringify({ cookie: req.headers.cookie ?? null }));
        });
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        baseUrl = `http://127.0.0.1:${(server.address() as any).port}/`;
    });

    afterAll(async () => {
        await new Promise<void>(resolve => server.close(() => resolve()));
    });

    async function request(cookieJar: unknown): Promise<string | null> {
        const { default: got } = await import('got');
        const response = await got(baseUrl, { cookieJar: cookieJar as any, responseType: 'buffer', throwHttpErrors: false });
        return JSON.parse(Buffer.from(response.body).toString('utf8')).cookie;
    }

    it('lets a mismatched cookie survive a real request/response round trip', async () => {
        const { jar } = makeJar(makeSettings({ allowedRequestHosts: ['localhost', '127.0.0.1'] }));

        expect(await request(jar)).toBeNull();
        const sentBack = await request(jar);

        expect(sentBack!.split('; ').sort()).toEqual(['sid=fake-session', 'theme=dark']);
    });

    it('surfaces the domain mismatch as a request error when rewriting is disabled', async () => {
        const { jar } = makeJar(makeSettings({ enabled: false }));

        await expect(request(jar)).rejects.toThrow(/Cookie not in this host's domain/);
    });
});
