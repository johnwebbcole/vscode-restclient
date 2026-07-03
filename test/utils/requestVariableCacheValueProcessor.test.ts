import { HttpRequest } from '../../src/models/httpRequest';
import { HttpResponse } from '../../src/models/httpResponse';
import { ResolveErrorMessage, ResolveState, ResolveWarningMessage } from '../../src/models/httpVariableResolveResult';
import { RequestVariableCacheValueProcessor } from '../../src/utils/requestVariableCacheValueProcessor';

function makeResponse(body: string, headers: { [key: string]: string }): HttpResponse {
    const request = new HttpRequest('GET', 'https://example.com', {
        Accept: 'application/json'
    });

    return new HttpResponse(
        200,
        'OK',
        '1.1',
        headers,
        body,
        Buffer.byteLength(body),
        0,
        Buffer.from(body),
        {} as any,
        request
    );
}

function makeRequest(method: string, url: string, headers: { [key: string]: string }, body?: string): HttpRequest {
    return new HttpRequest(method, url, headers, body, body);
}

describe('RequestVariableCacheValueProcessor.resolveRequestVariable', () => {
    describe('error cases', () => {
        it('returns error when value is undefined', () => {
            const result = RequestVariableCacheValueProcessor.resolveRequestVariable(undefined, 'myVar.response.body.*');

            expect(result.state).toBe(ResolveState.Error);
            expect(result.state === ResolveState.Error && result.message).toBe(ResolveErrorMessage.NoRequestVariablePath);
        });

        it('returns error when path is empty', () => {
            const response = makeResponse('{}', { 'content-type': 'application/json' });

            const result = RequestVariableCacheValueProcessor.resolveRequestVariable(response, '');

            expect(result.state).toBe(ResolveState.Error);
            expect(result.state === ResolveState.Error && result.message).toBe(ResolveErrorMessage.NoRequestVariablePath);
        });

        it('returns error for invalid variable reference syntax', () => {
            const response = makeResponse('{}', { 'content-type': 'application/json' });

            const result = RequestVariableCacheValueProcessor.resolveRequestVariable(response, 'invalid reference!');

            expect(result.state).toBe(ResolveState.Error);
            expect(result.state === ResolveState.Error && result.message).toBe(ResolveErrorMessage.InvalidRequestVariableReference);
        });
    });

    describe('warning cases', () => {
        it('returns warning for missing entity name (variable name only)', () => {
            const response = makeResponse('{"id":1}', { 'content-type': 'application/json' });

            const result = RequestVariableCacheValueProcessor.resolveRequestVariable(response, 'myVar');

            expect(result.state).toBe(ResolveState.Warning);
            expect(result.state === ResolveState.Warning && result.message).toBe(ResolveWarningMessage.MissingRequestEntityName);
            expect(result.state === ResolveState.Warning && result.value).toBe(response);
        });

        it('returns warning for missing entity part (no headers/body)', () => {
            const response = makeResponse('{"id":1}', { 'content-type': 'application/json' });

            const result = RequestVariableCacheValueProcessor.resolveRequestVariable(response, 'myVar.response');

            expect(result.state).toBe(ResolveState.Warning);
            expect(result.state === ResolveState.Warning && result.message).toBe(ResolveWarningMessage.MissingRequestEntityPart);
            expect(result.state === ResolveState.Warning && result.value).toBe(response);
        });

        it('returns warning when response header name is missing', () => {
            const response = makeResponse('{}', { 'content-type': 'application/json' });

            const result = RequestVariableCacheValueProcessor.resolveRequestVariable(response, 'myVar.response.headers');

            expect(result.state).toBe(ResolveState.Warning);
            expect(result.state === ResolveState.Warning && result.message).toBe(ResolveWarningMessage.MissingHeaderName);
            expect(result.state === ResolveState.Warning && result.value).toStrictEqual(response.headers);
        });

        it('returns warning for missing response header', () => {
            const response = makeResponse('{"id":1}', { 'content-type': 'application/json' });

            const result = RequestVariableCacheValueProcessor.resolveRequestVariable(response, 'myVar.response.headers.x-missing');

            expect(result.state).toBe(ResolveState.Warning);
            expect(result.state === ResolveState.Warning && result.message).toBe(ResolveWarningMessage.IncorrectHeaderName);
        });

        it('returns warning when response body is empty', () => {
            const response = makeResponse('', { 'content-type': 'application/json' });

            const result = RequestVariableCacheValueProcessor.resolveRequestVariable(response, 'myVar.response.body.*');

            expect(result.state).toBe(ResolveState.Warning);
            expect(result.state === ResolveState.Warning && result.message).toBe(ResolveWarningMessage.ResponseBodyNotExist);
        });

        it('returns warning when body path is missing', () => {
            const response = makeResponse('{"id":1}', { 'content-type': 'application/json' });

            const result = RequestVariableCacheValueProcessor.resolveRequestVariable(response, 'myVar.response.body');

            expect(result.state).toBe(ResolveState.Warning);
            expect(result.state === ResolveState.Warning && result.message).toBe(ResolveWarningMessage.MissingBodyPath);
            expect(result.state === ResolveState.Warning && result.value).toBe('{"id":1}');
        });

        it('returns warning for incorrect JSONPath', () => {
            const response = makeResponse('{"id":1}', { 'content-type': 'application/json' });

            const result = RequestVariableCacheValueProcessor.resolveRequestVariable(response, 'myVar.response.body.$.no.such.path');

            expect(result.state).toBe(ResolveState.Warning);
            expect(result.state === ResolveState.Warning && result.message).toBe(ResolveWarningMessage.IncorrectJSONPath);
        });

        it('returns warning for unsupported body content type', () => {
            const response = makeResponse('plain text', { 'content-type': 'text/plain' });

            const result = RequestVariableCacheValueProcessor.resolveRequestVariable(response, 'myVar.response.body.someField');

            expect(result.state).toBe(ResolveState.Warning);
            expect(result.state === ResolveState.Warning && result.message).toBe(ResolveWarningMessage.UnsupportedBodyContentType);
        });
    });

    describe('success cases', () => {
        it('resolves response header value', () => {
            const response = makeResponse('{"id":1}', {
                'content-type': 'application/json',
                'x-trace-id': 'trace-123'
            });

            const result = RequestVariableCacheValueProcessor.resolveRequestVariable(response, 'myVar.response.headers.x-trace-id');

            expect(result.state).toBe(ResolveState.Success);
            expect(result.state === ResolveState.Success && result.value).toBe('trace-123');
        });

        it('resolves response body using JSONPath', () => {
            const response = makeResponse('{"items":[{"name":"rest"}]}', {
                'content-type': 'application/json'
            });

            const result = RequestVariableCacheValueProcessor.resolveRequestVariable(response, 'myVar.response.body.$.items[0].name');

            expect(result.state).toBe(ResolveState.Success);
            expect(result.state === ResolveState.Success && result.value).toBe('rest');
        });

        it('resolves response body with wildcard path', () => {
            const body = '{"id":42}';
            const response = makeResponse(body, { 'content-type': 'application/json' });

            const result = RequestVariableCacheValueProcessor.resolveRequestVariable(response, 'myVar.response.body.*');

            expect(result.state).toBe(ResolveState.Success);
            expect(result.state === ResolveState.Success && result.value).toBe(body);
        });

        it('resolves response body using XPath', () => {
            const body = '<root><item>hello</item></root>';
            const response = makeResponse(body, { 'content-type': 'application/xml' });

            const result = RequestVariableCacheValueProcessor.resolveRequestVariable(response, 'myVar.response.body.//item');

            expect(result.state).toBe(ResolveState.Success);
            expect(result.state === ResolveState.Success && result.value).toBe('hello');
        });

        it('resolves request entity header', () => {
            const response = makeResponse('{}', {
                'content-type': 'application/json'
            });

            const result = RequestVariableCacheValueProcessor.resolveRequestVariable(response, 'myVar.request.headers.accept');

            expect(result.state).toBe(ResolveState.Success);
            expect(result.state === ResolveState.Success && result.value).toBe('application/json');
        });
    });
});
