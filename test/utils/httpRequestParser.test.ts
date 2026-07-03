import { vi } from 'vitest';

/**
 * VariableProcessor transitively imports complex providers.  Mock it so that
 * only the core parsing logic (no file I/O or provider resolution) runs.
 */
vi.mock('../../src/utils/variableProcessor', () => ({
    VariableProcessor: {
        processRawRequest: vi.fn().mockImplementation((content: string) => Promise.resolve(content)),
    },
}));

/**
 * resolveRequestBodyPath is only exercised by the "< filepath" body syntax.
 * Return undefined by default so no real filesystem look-ups happen.
 */
vi.mock('../../src/utils/requestParserUtil', async () => {
    const actual = await vi.importActual<typeof import('../../src/utils/requestParserUtil')>(
        '../../src/utils/requestParserUtil'
    );
    return {
        ...actual,
        resolveRequestBodyPath: vi.fn().mockResolvedValue(undefined),
    };
});

import { EOL } from 'os';
import { FormParamEncodingStrategy } from '../../src/models/formParamEncodingStrategy';
import { IRestClientSettings } from '../../src/models/configurationSettings';
import { HttpRequestParser } from '../../src/utils/httpRequestParser';

function makeSettings(overrides: Partial<IRestClientSettings> = {}): IRestClientSettings {
    return {
        defaultHeaders: {},
        formParamEncodingStrategy: FormParamEncodingStrategy.Automatic,
        followRedirect: true,
        timeoutInMilliseconds: 0,
        showResponseInDifferentTab: false,
        requestNameAsResponseTabTitle: false,
        proxyStrictSSL: false,
        rememberCookiesForSubsequentRequests: false,
        enableTelemetry: false,
        excludeHostsForProxy: [],
        environmentVariables: {},
        mimeAndFileExtensionMapping: {},
        previewResponseInUntitledDocument: false,
        hostCertificates: {},
        oidcCertificates: {},
        oidcScopes: [],
        suppressResponseBodyContentTypeValidationWarning: false,
        previewOption: 0 as any,
        disableHighlightResponseBodyForLargeResponse: false,
        disableAddingHrefLinkForLargeResponse: false,
        largeResponseBodySizeLimitInMB: 50,
        previewColumn: 1 as any,
        previewResponsePanelTakeFocus: true,
        addRequestBodyLineIndentationAroundBrackets: false,
        decodeEscapedUnicodeCharacters: false,
        logLevel: 0 as any,
        enableSendRequestCodeLens: true,
        enableCustomVariableReferencesCodeLens: true,
        useContentDispositionFilename: false,
        ...overrides,
    };
}

function join(...lines: string[]): string {
    return lines.join(EOL);
}

describe('HttpRequestParser.parseHttpRequest', () => {
    describe('request line', () => {
        it('parses a simple GET request', async () => {
            const parser = new HttpRequestParser('GET https://example.com/api', makeSettings());
            const req = await parser.parseHttpRequest();

            expect(req.method).toBe('GET');
            expect(req.url).toBe('https://example.com/api');
            expect(req.body).toBeUndefined();
        });

        it('defaults to GET when no method is specified', async () => {
            const parser = new HttpRequestParser('https://example.com/api', makeSettings());
            const req = await parser.parseHttpRequest();

            expect(req.method).toBe('GET');
            expect(req.url).toBe('https://example.com/api');
        });

        it('strips the HTTP version from the request line', async () => {
            const parser = new HttpRequestParser('GET https://example.com/api HTTP/1.1', makeSettings());
            const req = await parser.parseHttpRequest();

            expect(req.url).toBe('https://example.com/api');
        });

        it('parses a POST request', async () => {
            const parser = new HttpRequestParser('POST https://example.com/items', makeSettings());
            const req = await parser.parseHttpRequest();

            expect(req.method).toBe('POST');
        });

        it('parses a DELETE request', async () => {
            const parser = new HttpRequestParser('DELETE https://example.com/items/1', makeSettings());
            const req = await parser.parseHttpRequest();

            expect(req.method).toBe('DELETE');
        });

        it('passes along an optional name', async () => {
            const parser = new HttpRequestParser('GET https://example.com', makeSettings());
            const req = await parser.parseHttpRequest('myRequest');

            expect(req.name).toBe('myRequest');
        });

        it('parses a PUT request', async () => {
            const parser = new HttpRequestParser('PUT https://example.com/resource', makeSettings());
            const req = await parser.parseHttpRequest();
            expect(req.method).toBe('PUT');
        });

        it('parses a PATCH request', async () => {
            const parser = new HttpRequestParser('PATCH https://example.com/resource', makeSettings());
            const req = await parser.parseHttpRequest();
            expect(req.method).toBe('PATCH');
        });
    });

    describe('query string continuation', () => {
        it('joins query-string continuation lines into the URL', async () => {
            const raw = join(
                'GET https://example.com/search',
                '  ?q=hello',
                '  &lang=en'
            );
            const parser = new HttpRequestParser(raw, makeSettings());
            const req = await parser.parseHttpRequest();

            expect(req.url).toBe('https://example.com/search?q=hello&lang=en');
        });
    });

    describe('headers', () => {
        it('parses request headers', async () => {
            const raw = join(
                'GET https://example.com/api',
                'Accept: application/json',
                'X-Api-Key: secret'
            );
            const parser = new HttpRequestParser(raw, makeSettings());
            const req = await parser.parseHttpRequest();

            expect(req.headers['Accept']).toBe('application/json');
            expect(req.headers['X-Api-Key']).toBe('secret');
        });

        it('merges default headers from settings', async () => {
            const settings = makeSettings({ defaultHeaders: { 'User-Agent': 'rest-client' } });
            const raw = join('GET https://example.com/api', 'Accept: */*');
            const parser = new HttpRequestParser(raw, settings);
            const req = await parser.parseHttpRequest();

            expect(req.headers['User-Agent']).toBe('rest-client');
            expect(req.headers['Accept']).toBe('*/*');
        });

        it('removes the Content-Length header', async () => {
            const raw = join(
                'POST https://example.com/api',
                'Content-Length: 100',
                'Content-Type: application/json',
                '',
                '{"key":"value"}'
            );
            const parser = new HttpRequestParser(raw, makeSettings());
            const req = await parser.parseHttpRequest();

            expect(req.headers['Content-Length']).toBeUndefined();
            expect(req.headers['content-length']).toBeUndefined();
        });
    });

    describe('request body', () => {
        it('parses a JSON body', async () => {
            const raw = join(
                'POST https://example.com/api',
                'Content-Type: application/json',
                '',
                '{"name":"Alice","age":30}'
            );
            const parser = new HttpRequestParser(raw, makeSettings());
            const req = await parser.parseHttpRequest();

            expect(req.body).toBe('{"name":"Alice","age":30}');
        });

        it('parses a multi-line body', async () => {
            const raw = join(
                'POST https://example.com/api',
                'Content-Type: application/json',
                '',
                '{',
                '  "name": "Alice"',
                '}'
            );
            const parser = new HttpRequestParser(raw, makeSettings());
            const req = await parser.parseHttpRequest();

            expect(req.body).toContain('"name"');
            expect(req.body).toContain('"Alice"');
        });

        it('returns undefined body when there is no body', async () => {
            const parser = new HttpRequestParser('GET https://example.com/api', makeSettings());
            const req = await parser.parseHttpRequest();

            expect(req.body).toBeUndefined();
        });
    });

    describe('Host header with relative URL', () => {
        it('builds an absolute URL using the Host header', async () => {
            const raw = join(
                'GET /api/users',
                'Host: example.com'
            );
            const parser = new HttpRequestParser(raw, makeSettings());
            const req = await parser.parseHttpRequest();

            expect(req.url).toBe('http://example.com/api/users');
        });

        it('uses https scheme when port is 443', async () => {
            const raw = join(
                'GET /api/users',
                'Host: example.com:443'
            );
            const parser = new HttpRequestParser(raw, makeSettings());
            const req = await parser.parseHttpRequest();

            expect(req.url).toBe('https://example.com:443/api/users');
        });

        it('uses https scheme when port is 8443', async () => {
            const raw = join(
                'GET /api/users',
                'Host: example.com:8443'
            );
            const parser = new HttpRequestParser(raw, makeSettings());
            const req = await parser.parseHttpRequest();

            expect(req.url).toBe('https://example.com:8443/api/users');
        });
    });

    describe('form URL-encoded body encoding', () => {
        it('does not encode with Never strategy', async () => {
            const raw = join(
                'POST https://example.com/form',
                'Content-Type: application/x-www-form-urlencoded',
                '',
                'name=Alice Smith&age=30'
            );
            const settings = makeSettings({ formParamEncodingStrategy: FormParamEncodingStrategy.Never });
            const parser = new HttpRequestParser(raw, settings);
            const req = await parser.parseHttpRequest();

            expect(req.body).toBe('name=Alice Smith&age=30');
        });

        it('percent-encodes with Always strategy', async () => {
            const raw = join(
                'POST https://example.com/form',
                'Content-Type: application/x-www-form-urlencoded',
                '',
                'name=Alice Smith&age=30'
            );
            const settings = makeSettings({ formParamEncodingStrategy: FormParamEncodingStrategy.Always });
            const parser = new HttpRequestParser(raw, settings);
            const req = await parser.parseHttpRequest();

            expect(req.body).toContain('Alice%20Smith');
        });
    });

    describe('GraphQL request', () => {
        it('wraps the body in a GraphQL payload JSON when X-Request-Type is graphql', async () => {
            const raw = join(
                'POST https://example.com/graphql',
                'Content-Type: application/json',
                'X-Request-Type: graphql',
                '',
                'query GetUser { user { id name } }'
            );
            const parser = new HttpRequestParser(raw, makeSettings());
            const req = await parser.parseHttpRequest();

            const payload = JSON.parse(req.body as string);
            expect(payload).toHaveProperty('query');
            expect(payload.query).toContain('GetUser');
            expect(payload).toHaveProperty('variables');
        });

        it('removes the X-Request-Type header from the final request', async () => {
            const raw = join(
                'POST https://example.com/graphql',
                'Content-Type: application/json',
                'X-Request-Type: graphql',
                '',
                '{ user { id } }'
            );
            const parser = new HttpRequestParser(raw, makeSettings());
            const req = await parser.parseHttpRequest();

            expect(req.headers['X-Request-Type']).toBeUndefined();
            expect(req.headers['x-request-type']).toBeUndefined();
        });

        it('extracts operationName from a named query', async () => {
            const raw = join(
                'POST https://example.com/graphql',
                'Content-Type: application/json',
                'X-Request-Type: graphql',
                '',
                'query GetUser { user { id } }'
            );
            const parser = new HttpRequestParser(raw, makeSettings());
            const req = await parser.parseHttpRequest();

            const payload = JSON.parse(req.body as string);
            expect(payload.operationName).toBe('GetUser');
        });

        it('parses GraphQL variables from the section after the blank line', async () => {
            const raw = join(
                'POST https://example.com/graphql',
                'Content-Type: application/json',
                'X-Request-Type: graphql',
                '',
                'query GetUser($id: ID!) { user(id: $id) { name } }',
                '',
                '{"id": "42"}'
            );
            const parser = new HttpRequestParser(raw, makeSettings());
            const req = await parser.parseHttpRequest();

            const payload = JSON.parse(req.body as string);
            expect(payload.variables).toEqual({ id: '42' });
        });
    });
});
