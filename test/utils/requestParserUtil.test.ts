import { parseRequestHeaders } from '../../src/utils/requestParserUtil';

describe('parseRequestHeaders', () => {
    it('parses basic header lines into a headers map', () => {
        const result = parseRequestHeaders(
            ['Content-Type: application/json', 'Accept: text/html'],
            {},
            'https://example.com'
        );

        expect(result).toStrictEqual({
            'Content-Type': 'application/json',
            'Accept': 'text/html'
        });
    });

    it('trims whitespace from field names and values', () => {
        const result = parseRequestHeaders(
            ['  X-Custom-Header  :  trimmed  '],
            {},
            'https://example.com'
        );

        expect(result).toStrictEqual({ 'X-Custom-Header': 'trimmed' });
    });

    it('treats a header line without a colon as a name with an empty value', () => {
        const result = parseRequestHeaders(
            ['X-No-Value'],
            {},
            'https://example.com'
        );

        expect(result).toStrictEqual({ 'X-No-Value': '' });
    });

    it('joins duplicate cookie headers with a semicolon', () => {
        const result = parseRequestHeaders(
            ['Cookie: a=1', 'Cookie: b=2'],
            {},
            'https://example.com'
        );

        expect(result).toStrictEqual({ 'Cookie': 'a=1;b=2' });
    });

    it('joins duplicate non-cookie headers with a comma', () => {
        const result = parseRequestHeaders(
            ['Accept: text/html', 'Accept: application/json'],
            {},
            'https://example.com'
        );

        expect(result).toStrictEqual({ 'Accept': 'text/html,application/json' });
    });

    it('merges default headers, with explicit headers taking precedence', () => {
        const defaultHeaders = { 'Accept': '*/*', 'X-Default': 'yes' };

        const result = parseRequestHeaders(
            ['Accept: application/json'],
            defaultHeaders,
            'https://example.com'
        );

        expect(result).toStrictEqual({
            'Accept': 'application/json',
            'X-Default': 'yes'
        });
    });

    it('removes the Host default header when the URL is absolute', () => {
        const defaultHeaders = { 'Host': 'default.example.com', 'Accept': '*/*' };

        const result = parseRequestHeaders([], defaultHeaders, 'https://other.com/path');

        expect(result).toStrictEqual({ 'Accept': '*/*' });
        expect(defaultHeaders).toStrictEqual({ 'Accept': '*/*' });
    });

    it('keeps the Host default header when the URL is a relative path', () => {
        const defaultHeaders = { 'Host': 'default.example.com', 'Accept': '*/*' };

        const result = parseRequestHeaders([], defaultHeaders, '/relative/path');

        expect(result).toStrictEqual({ 'Host': 'default.example.com', 'Accept': '*/*' });
    });

    it('preserves the colon within a header value', () => {
        const result = parseRequestHeaders(
            ['Authorization: Bearer tok:en'],
            {},
            'https://example.com'
        );

        expect(result).toStrictEqual({ 'Authorization': 'Bearer tok:en' });
    });
});
