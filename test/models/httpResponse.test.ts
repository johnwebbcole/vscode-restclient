import { HttpRequest } from '../../src/models/httpRequest';
import { HttpResponse } from '../../src/models/httpResponse';

function makeRequest(): HttpRequest {
    return new HttpRequest('GET', 'https://example.com', { Accept: 'application/json' });
}

describe('HttpResponse', () => {
    it('stores all constructor fields correctly', () => {
        const request = makeRequest();
        const headers = { 'content-type': 'application/json', 'x-trace': 'abc' };
        const body = '{"id":1}';
        const bodyBuffer = Buffer.from(body);
        const timings = { wait: 5, dns: 1, tcp: 2, tls: undefined, request: 3, firstByte: 10, download: 20, total: 40 };

        const response = new HttpResponse(200, 'OK', '1.1', headers, body, bodyBuffer.byteLength, 50, bodyBuffer, timings, request);

        expect(response.statusCode).toBe(200);
        expect(response.statusMessage).toBe('OK');
        expect(response.httpVersion).toBe('1.1');
        expect(response.headers).toBe(headers);
        expect(response.body).toBe(body);
        expect(response.bodySizeInBytes).toBe(bodyBuffer.byteLength);
        expect(response.headersSizeInBytes).toBe(50);
        expect(response.bodyBuffer).toBe(bodyBuffer);
        expect(response.timingPhases).toBe(timings);
        expect(response.request).toBe(request);
    });

    describe('contentType getter', () => {
        it('returns the content-type header value', () => {
            const response = new HttpResponse(200, 'OK', '1.1', { 'content-type': 'application/json' }, '{}', 2, 0, Buffer.from('{}'), {} as any, makeRequest());

            expect(response.contentType).toBe('application/json');
        });

        it('returns undefined when no content-type header is present', () => {
            const response = new HttpResponse(200, 'OK', '1.1', { 'x-custom': 'value' }, '', 0, 0, Buffer.alloc(0), {} as any, makeRequest());

            expect(response.contentType).toBeUndefined();
        });
    });
});
