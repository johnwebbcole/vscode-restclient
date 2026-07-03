import { base64, formatHeaders, getContentType, getHeader, hasHeader, isJSONString, md5, removeHeader } from '../../src/utils/misc';

describe('getHeader', () => {
    it('retrieves a header case-insensitively', () => {
        const headers = { 'Content-Type': 'application/json' };

        expect(getHeader(headers, 'content-type')).toBe('application/json');
        expect(getHeader(headers, 'CONTENT-TYPE')).toBe('application/json');
        expect(getHeader(headers, 'Content-Type')).toBe('application/json');
    });

    it('returns undefined for a missing header', () => {
        const headers = { 'Content-Type': 'application/json' };

        expect(getHeader(headers, 'x-missing')).toBeUndefined();
    });

    it('returns undefined when headers object is falsy', () => {
        expect(getHeader(null as any, 'content-type')).toBeUndefined();
    });

    it('returns undefined when name is falsy', () => {
        const headers = { 'Content-Type': 'application/json' };

        expect(getHeader(headers, '')).toBeUndefined();
    });
});

describe('getContentType', () => {
    it('extracts the content-type value case-insensitively', () => {
        expect(getContentType({ 'Content-Type': 'application/json' })).toBe('application/json');
        expect(getContentType({ 'content-type': 'text/html' })).toBe('text/html');
    });

    it('returns undefined when content-type header is absent', () => {
        expect(getContentType({ 'Accept': 'text/html' })).toBeUndefined();
    });
});

describe('hasHeader', () => {
    it('returns true for an existing header regardless of case', () => {
        const headers = { 'X-Correlation-Id': 'abc' };

        expect(hasHeader(headers, 'x-correlation-id')).toBe(true);
        expect(hasHeader(headers, 'X-CORRELATION-ID')).toBe(true);
    });

    it('returns false for a missing header', () => {
        expect(hasHeader({ 'Content-Type': 'application/json' }, 'x-missing')).toBe(false);
    });

    it('returns false when headers object is falsy', () => {
        expect(hasHeader(null as any, 'content-type')).toBe(false);
    });
});

describe('removeHeader', () => {
    it('removes an existing header case-insensitively', () => {
        const headers = { 'Content-Type': 'application/json', 'X-Correlation-Id': 'abc' };

        removeHeader(headers, 'content-type');

        expect(hasHeader(headers, 'content-type')).toBe(false);
        expect(headers).toStrictEqual({ 'X-Correlation-Id': 'abc' });
    });

    it('is a no-op for a missing header', () => {
        const headers = { 'Content-Type': 'application/json' };

        removeHeader(headers, 'x-missing');

        expect(headers).toStrictEqual({ 'Content-Type': 'application/json' });
    });

    it('is a no-op when headers object is falsy', () => {
        expect(() => removeHeader(null as any, 'content-type')).not.toThrow();
    });
});

describe('formatHeaders', () => {
    it('formats set-cookie headers as individual lines', () => {
        const formatted = formatHeaders({
            'set-cookie': ['a=b', 'c=d'],
            'x-test': 'ok'
        });

        expect(formatted).toContain('set-cookie: a=b\n');
        expect(formatted).toContain('set-cookie: c=d\n');
        expect(formatted).toContain('x-test: ok\n');
    });

    it('formats a single string set-cookie as one line', () => {
        const formatted = formatHeaders({ 'set-cookie': 'single=value' });

        expect(formatted).toBe('set-cookie: single=value\n');
    });

    it('formats regular headers as name: value lines', () => {
        const formatted = formatHeaders({ 'Content-Type': 'application/json' });

        expect(formatted).toBe('Content-Type: application/json\n');
    });
});

describe('base64', () => {
    it('encodes a string to base64', () => {
        expect(base64('abc')).toBe('YWJj');
    });

    it('encodes a Buffer to base64', () => {
        expect(base64(Buffer.from('abc'))).toBe('YWJj');
    });
});

describe('md5', () => {
    it('computes the md5 hex digest of a string', () => {
        expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
    });

    it('computes the md5 hex digest of a Buffer', () => {
        expect(md5(Buffer.from('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72');
    });
});

describe('isJSONString', () => {
    it('returns true for valid JSON objects and arrays', () => {
        expect(isJSONString('{"name":"rest"}')).toBe(true);
        expect(isJSONString('[1,2,3]')).toBe(true);
    });

    it('returns false for invalid JSON strings', () => {
        expect(isJSONString('{name:rest}')).toBe(false);
        expect(isJSONString('not json')).toBe(false);
    });
});
