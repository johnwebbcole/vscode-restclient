import { vi } from 'vitest';

/**
 * jsonc-parser exports SyntaxKind as a TypeScript const enum, so the compiled JS does
 * not include it as a runtime value.  We augment the real module with the numeric values
 * so that ResponseFormatUtility's static initialiser can build its token-mapping table.
 */
vi.mock('jsonc-parser', async () => {
    const actual = await vi.importActual<typeof import('jsonc-parser')>('jsonc-parser');
    return {
        ...actual,
        SyntaxKind: {
            OpenBraceToken: 1,
            CloseBraceToken: 2,
            OpenBracketToken: 3,
            CloseBracketToken: 4,
            CommaToken: 5,
            ColonToken: 6,
            NullKeyword: 7,
            TrueKeyword: 8,
            FalseKeyword: 9,
            StringLiteral: 10,
            NumericLiteral: 11,
            Unknown: 16,
            EOF: 17,
        }
    };
});

import { window } from 'vscode';
import { ResponseFormatUtility } from '../../src/utils/responseFormatUtility';

const showWarningMock = vi.mocked(window.showWarningMessage);

beforeEach(() => {
    showWarningMock.mockClear();
});

describe('ResponseFormatUtility.formatBody', () => {
    describe('JSON content type', () => {
        it('pretty-prints a valid JSON body', () => {
            const result = ResponseFormatUtility.formatBody('{"a":1}', 'application/json', false);

            expect(result).toBe('{\n  "a": 1\n}');
            expect(showWarningMock).not.toHaveBeenCalled();
        });

        it('pretty-prints a valid JSON body with charset parameter', () => {
            const result = ResponseFormatUtility.formatBody('{"x":"y"}', 'application/json; charset=utf-8', false);

            expect(result).toBe('{\n  "x": "y"\n}');
        });

        it('shows a warning and returns body unchanged for invalid JSON when suppressValidation is false', () => {
            const result = ResponseFormatUtility.formatBody('not json', 'application/json', false);

            expect(result).toBe('not json');
            expect(showWarningMock).toHaveBeenCalledWith(
                'The content type of response is application/json, while response body is not a valid json string'
            );
        });

        it('returns body unchanged for invalid JSON without a warning when suppressValidation is true', () => {
            const result = ResponseFormatUtility.formatBody('not json', 'application/json', true);

            expect(result).toBe('not json');
            expect(showWarningMock).not.toHaveBeenCalled();
        });
    });

    describe('XML content type', () => {
        it('formats an XML body', () => {
            const xml = '<root><item>hello</item></root>';
            const result = ResponseFormatUtility.formatBody(xml, 'application/xml', false);

            expect(result).toContain('<root>');
            expect(result).toContain('<item>hello</item>');
        });
    });

    describe('CSS content type', () => {
        it('formats a CSS body', () => {
            const css = 'body{color:red}';
            const result = ResponseFormatUtility.formatBody(css, 'text/css', false);

            expect(result).toContain('body');
            expect(result).toContain('color');
        });
    });

    describe('no content type', () => {
        it('returns body unchanged when no content type is set', () => {
            const result = ResponseFormatUtility.formatBody('{"key":"val"}', undefined, false);

            expect(result).toBe('{"key":"val"}');
        });
    });

    describe('other content types', () => {
        it('returns body unchanged for text/plain', () => {
            const result = ResponseFormatUtility.formatBody('hello', 'text/plain', false);

            expect(result).toBe('hello');
        });

        it('auto-prettifies a JSON body when content type is provided but does not match JSON/XML/CSS', () => {
            const result = ResponseFormatUtility.formatBody('{"a":1}', 'text/plain', false);

            expect(result).toBe('{\n  "a": 1\n}');
        });
    });
});
