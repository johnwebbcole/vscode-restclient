import { HistoricalHttpRequest, HttpRequest } from '../../src/models/httpRequest';

describe('HttpRequest', () => {
    describe('constructor', () => {
        it('uppercases the HTTP method', () => {
            const req = new HttpRequest('post', 'https://example.com', {});

            expect(req.method).toBe('POST');
        });

        it('stores all constructor fields correctly', () => {
            const headers = { 'Content-Type': 'application/json' };
            const req = new HttpRequest('GET', 'https://example.com/path', headers, '{"a":1}', '{"a":1}', 'myRequest');

            expect(req.method).toBe('GET');
            expect(req.url).toBe('https://example.com/path');
            expect(req.headers).toBe(headers);
            expect(req.body).toBe('{"a":1}');
            expect(req.rawBody).toBe('{"a":1}');
            expect(req.name).toBe('myRequest');
            expect(req.isCancelled).toBe(false);
        });
    });

    describe('contentType getter', () => {
        it('returns the content-type header value', () => {
            const req = new HttpRequest('POST', 'https://example.com', { 'Content-Type': 'application/json' });

            expect(req.contentType).toBe('application/json');
        });

        it('returns undefined when no content-type header is present', () => {
            const req = new HttpRequest('GET', 'https://example.com', { 'Accept': 'text/html' });

            expect(req.contentType).toBeUndefined();
        });
    });

    describe('cancel', () => {
        it('sets isCancelled to true', () => {
            const req = new HttpRequest('GET', 'https://example.com', {});

            req.cancel();

            expect(req.isCancelled).toBe(true);
        });

        it('does not throw when no underlying request is set', () => {
            const req = new HttpRequest('GET', 'https://example.com', {});

            expect(() => req.cancel()).not.toThrow();
        });

        it('calls cancel on the underlying request exactly once even when cancel is called twice', () => {
            const req = new HttpRequest('GET', 'https://example.com', {});
            const mockCancel = vi.fn();
            req.setUnderlyingRequest({ cancel: mockCancel } as any);

            req.cancel();
            req.cancel();

            expect(mockCancel).toHaveBeenCalledTimes(1);
            expect(req.isCancelled).toBe(true);
        });
    });
});

describe('HistoricalHttpRequest', () => {
    describe('convertFromHttpRequest', () => {
        it('converts an HttpRequest preserving all fields', () => {
            const headers = { 'Accept': 'application/json' };
            const req = new HttpRequest('PUT', 'https://example.com/items/1', headers, '{"value":5}', '{"value":5}', 'updateItem');
            const startTime = 1700000000000;

            const historical = HistoricalHttpRequest.convertFromHttpRequest(req, startTime);

            expect(historical.method).toBe('PUT');
            expect(historical.url).toBe('https://example.com/items/1');
            expect(historical.headers).toBe(headers);
            expect(historical.body).toBe('{"value":5}');
            expect(historical.startTime).toBe(startTime);
        });

        it('uses Date.now() as startTime when not provided', () => {
            const before = Date.now();
            const req = new HttpRequest('GET', 'https://example.com', {});

            const historical = HistoricalHttpRequest.convertFromHttpRequest(req);

            const after = Date.now();
            expect(historical.startTime).toBeGreaterThanOrEqual(before);
            expect(historical.startTime).toBeLessThanOrEqual(after);
        });

        it('uses rawBody as the historical body', () => {
            const req = new HttpRequest('POST', 'https://example.com', {}, 'encoded', 'raw-body');

            const historical = HistoricalHttpRequest.convertFromHttpRequest(req, 0);

            expect(historical.body).toBe('raw-body');
        });
    });
});
