import { vi } from 'vitest';

/**
 * VariableProcessor (imported transitively by Selector) pulls in complex providers
 * that have side-effects at module load time.  Mock it before importing Selector.
 */
vi.mock('../../src/utils/variableProcessor', () => ({
    VariableProcessor: {
        processRawRequest: vi.fn().mockResolvedValue(''),
    },
}));

import { EOL } from 'os';
import { RequestMetadata } from '../../src/models/requestMetadata';
import { Selector } from '../../src/utils/selector';

// ---------------------------------------------------------------------------
// isCommentLine
// ---------------------------------------------------------------------------
describe('Selector.isCommentLine', () => {
    it('returns true for lines starting with #', () => {
        expect(Selector.isCommentLine('# comment')).toBe(true);
    });

    it('returns true for lines starting with //', () => {
        expect(Selector.isCommentLine('// comment')).toBe(true);
    });

    it('returns true for lines with leading whitespace before #', () => {
        expect(Selector.isCommentLine('  # comment')).toBe(true);
    });

    it('returns false for a normal request line', () => {
        expect(Selector.isCommentLine('GET https://example.com')).toBe(false);
    });

    it('returns false for an empty line', () => {
        expect(Selector.isCommentLine('')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// isEmptyLine
// ---------------------------------------------------------------------------
describe('Selector.isEmptyLine', () => {
    it('returns true for an empty string', () => {
        expect(Selector.isEmptyLine('')).toBe(true);
    });

    it('returns true for a whitespace-only string', () => {
        expect(Selector.isEmptyLine('   ')).toBe(true);
    });

    it('returns false for a non-empty line', () => {
        expect(Selector.isEmptyLine('GET https://example.com')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// isFileVariableDefinitionLine
// ---------------------------------------------------------------------------
describe('Selector.isFileVariableDefinitionLine', () => {
    it('returns true for @var = value', () => {
        expect(Selector.isFileVariableDefinitionLine('@host = https://example.com')).toBe(true);
    });

    it('returns true with leading whitespace', () => {
        expect(Selector.isFileVariableDefinitionLine('  @token = abc123')).toBe(true);
    });

    it('returns false for a comment line', () => {
        expect(Selector.isFileVariableDefinitionLine('# comment')).toBe(false);
    });

    it('returns false for a request line', () => {
        expect(Selector.isFileVariableDefinitionLine('GET https://example.com')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// isResponseStatusLine
// ---------------------------------------------------------------------------
describe('Selector.isResponseStatusLine', () => {
    it('returns true for HTTP/1.1 status lines', () => {
        expect(Selector.isResponseStatusLine('HTTP/1.1 200 OK')).toBe(true);
    });

    it('returns true for HTTP/2 status lines', () => {
        expect(Selector.isResponseStatusLine('HTTP/2 404 Not Found')).toBe(true);
    });

    it('returns false for request lines', () => {
        expect(Selector.isResponseStatusLine('GET https://example.com')).toBe(false);
    });

    it('returns false for empty lines', () => {
        expect(Selector.isResponseStatusLine('')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// isRequestVariableDefinitionLine
// ---------------------------------------------------------------------------
describe('Selector.isRequestVariableDefinitionLine', () => {
    it('returns true for # @name style', () => {
        expect(Selector.isRequestVariableDefinitionLine('# @name myRequest')).toBe(true);
    });

    it('returns true for // @name style', () => {
        expect(Selector.isRequestVariableDefinitionLine('// @name myRequest')).toBe(true);
    });

    it('returns false for non-name comment', () => {
        expect(Selector.isRequestVariableDefinitionLine('# comment')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// getRequestVariableDefinitionName
// ---------------------------------------------------------------------------
describe('Selector.getRequestVariableDefinitionName', () => {
    it('extracts the name from a # @name line', () => {
        expect(Selector.getRequestVariableDefinitionName('# @name createUser')).toBe('createUser');
    });

    it('extracts the name from a // @name line', () => {
        expect(Selector.getRequestVariableDefinitionName('// @name getProfile')).toBe('getProfile');
    });

    it('returns undefined when there is no @name', () => {
        expect(Selector.getRequestVariableDefinitionName('# just a comment')).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// getPrompVariableDefinition
// ---------------------------------------------------------------------------
describe('Selector.getPrompVariableDefinition', () => {
    it('extracts the name from # @prompt varname', () => {
        const result = Selector.getPrompVariableDefinition('# @prompt username');
        expect(result?.name).toBe('username');
        expect(result?.description).toBeUndefined();
    });

    it('extracts both name and description', () => {
        const result = Selector.getPrompVariableDefinition('# @prompt username Your username');
        expect(result?.name).toBe('username');
        expect(result?.description).toBe('Your username');
    });

    it('returns undefined for a non-prompt comment', () => {
        expect(Selector.getPrompVariableDefinition('# @name myRequest')).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// parsePromptMetadataForVariableDefinitions
// ---------------------------------------------------------------------------
describe('Selector.parsePromptMetadataForVariableDefinitions', () => {
    it('returns an empty array for undefined input', () => {
        expect(Selector.parsePromptMetadataForVariableDefinitions(undefined)).toEqual([]);
    });

    it('returns an empty array for empty JSON array string', () => {
        expect(Selector.parsePromptMetadataForVariableDefinitions('[]')).toEqual([]);
    });

    it('parses a JSON array with one entry', () => {
        const json = JSON.stringify([{ name: 'foo', description: 'bar' }]);
        const result = Selector.parsePromptMetadataForVariableDefinitions(json);
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('foo');
        expect(result[0].description).toBe('bar');
    });

    it('parses a JSON array with multiple entries', () => {
        const json = JSON.stringify([
            { name: 'a', description: 'desc-a' },
            { name: 'b', description: 'desc-b' },
        ]);
        const result = Selector.parsePromptMetadataForVariableDefinitions(json);
        expect(result).toHaveLength(2);
        expect(result[1].name).toBe('b');
    });
});

// ---------------------------------------------------------------------------
// parseReqMetadatas
// ---------------------------------------------------------------------------
describe('Selector.parseReqMetadatas', () => {
    it('returns an empty map for lines with no metadata', () => {
        const lines = ['GET https://example.com'];
        const result = Selector.parseReqMetadatas(lines);
        expect(result.size).toBe(0);
    });

    it('parses # @name metadata', () => {
        const lines = ['# @name myRequest', 'GET https://example.com'];
        const result = Selector.parseReqMetadatas(lines);
        expect(result.get(RequestMetadata.Name)).toBe('myRequest');
    });

    it('parses // @no-redirect metadata', () => {
        const lines = ['// @no-redirect', 'GET https://example.com'];
        const result = Selector.parseReqMetadatas(lines);
        expect(result.has(RequestMetadata.NoRedirect)).toBe(true);
    });

    it('stops reading metadata at the first non-comment, non-empty request line', () => {
        const lines = ['GET https://example.com', '# @name afterRequest'];
        const result = Selector.parseReqMetadatas(lines);
        expect(result.has(RequestMetadata.Name)).toBe(false);
    });

    it('skips empty lines before metadata', () => {
        const lines = ['', '# @name skipEmpty', 'GET https://example.com'];
        const result = Selector.parseReqMetadatas(lines);
        expect(result.get(RequestMetadata.Name)).toBe('skipEmpty');
    });

    it('accumulates multiple @prompt lines as a JSON array', () => {
        const lines = [
            '# @prompt username Your name',
            '# @prompt password Your password',
            'POST https://example.com',
        ];
        const result = Selector.parseReqMetadatas(lines);
        const promptJson = result.get(RequestMetadata.Prompt);
        expect(promptJson).toBeDefined();
        const defs = JSON.parse(promptJson!);
        expect(defs).toHaveLength(2);
        expect(defs[0].name).toBe('username');
        expect(defs[1].name).toBe('password');
    });
});

// ---------------------------------------------------------------------------
// getDelimitedText
// ---------------------------------------------------------------------------
describe('Selector.getDelimitedText', () => {
    it('returns the full text when there are no delimiters', () => {
        const text = 'GET https://example.com';
        expect(Selector.getDelimitedText(text, 0)).toBe(text);
    });

    it('returns null when the cursor is on a delimiter line', () => {
        const text = ['GET https://a.com', '###', 'POST https://b.com'].join('\n');
        expect(Selector.getDelimitedText(text, 1)).toBeNull();
    });

    it('returns the text before the first delimiter when cursor is above it', () => {
        const text = ['GET https://a.com', '###', 'POST https://b.com'].join('\n');
        const result = Selector.getDelimitedText(text, 0);
        expect(result).toBe('GET https://a.com');
    });

    it('returns the text after the last delimiter when cursor is below it', () => {
        const text = ['GET https://a.com', '###', 'POST https://b.com'].join('\n');
        const result = Selector.getDelimitedText(text, 2);
        expect(result).toBe('POST https://b.com');
    });

    it('returns the text between two delimiters', () => {
        const lines = [
            'GET https://a.com',
            '###',
            'POST https://b.com',
            '###',
            'DELETE https://c.com',
        ];
        const text = lines.join('\n');
        const result = Selector.getDelimitedText(text, 2);
        expect(result).toBe('POST https://b.com');
    });

    it('returns null when cursor is exactly on one of multiple delimiters', () => {
        const lines = ['GET https://a.com', '###', 'POST https://b.com', '###'];
        const text = lines.join('\n');
        expect(Selector.getDelimitedText(text, 3)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// getRequestRanges
// ---------------------------------------------------------------------------
describe('Selector.getRequestRanges', () => {
    it('returns a single range for a simple request', () => {
        const lines = ['GET https://example.com'];
        const ranges = Selector.getRequestRanges(lines);
        expect(ranges).toHaveLength(1);
        expect(ranges[0]).toEqual([0, 0]);
    });

    it('ignores comment lines before the request', () => {
        const lines = ['# comment', 'GET https://example.com'];
        const ranges = Selector.getRequestRanges(lines);
        expect(ranges).toHaveLength(1);
        expect(ranges[0][0]).toBe(1);
    });

    it('ignores empty lines before and after the request', () => {
        const lines = ['', 'GET https://example.com', ''];
        const ranges = Selector.getRequestRanges(lines);
        expect(ranges).toHaveLength(1);
        expect(ranges[0]).toEqual([1, 1]);
    });

    it('ignores file variable definition lines', () => {
        const lines = ['@token = abc', 'GET https://example.com'];
        const ranges = Selector.getRequestRanges(lines);
        expect(ranges).toHaveLength(1);
        expect(ranges[0][0]).toBe(1);
    });

    it('stops at a response status line', () => {
        const lines = ['HTTP/1.1 200 OK', 'Content-Type: application/json'];
        const ranges = Selector.getRequestRanges(lines);
        expect(ranges).toHaveLength(0);
    });

    it('returns empty array for only comment and empty lines', () => {
        const lines = ['# just a comment', ''];
        const ranges = Selector.getRequestRanges(lines);
        expect(ranges).toHaveLength(0);
    });

    it('returns two ranges when there are two distinct request blocks', () => {
        const lines = [
            '@var = val',
            '',
            '# comment',
            'GET https://a.com',
            '',
            '###',
            '',
            'POST https://b.com',
            '',
        ];
        // Pass without defaults to get raw ranges
        const ranges = Selector.getRequestRanges(lines);
        expect(ranges).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------
// getRequestRangeByName
// ---------------------------------------------------------------------------
function documentOf(text: string) {
    return { getText: () => text } as any;
}

describe('Selector.getRequestRangeByName', () => {
    it('finds a named request in the middle of a multi-request file', () => {
        const text = [
            '@baseUrl = https://example.com',
            '',
            '###',
            '# @name first',
            'GET {{baseUrl}}/first',
            '',
            '###',
            '# @name second',
            'GET {{baseUrl}}/second',
            '',
            '###',
            '# @name third',
            'GET {{baseUrl}}/third',
        ].join(EOL);

        const range = Selector.getRequestRangeByName(documentOf(text), 'second');
        if (!range) {
            throw new Error('expected a range to be found for "second"');
        }
        expect(range.start.line).toBe(7);
        expect(range.end.line).toBe(7);
    });

    it('finds a named request before the first delimiter', () => {
        const text = [
            '# @name only',
            'GET https://example.com',
            '###',
            '# @name other',
            'GET https://example.com/other',
        ].join(EOL);

        const range = Selector.getRequestRangeByName(documentOf(text), 'only');
        if (!range) {
            throw new Error('expected a range to be found for "only"');
        }
        expect(range.start.line).toBe(0);
    });

    it('returns null when no request has the given name', () => {
        const text = [
            '# @name first',
            'GET https://example.com',
        ].join(EOL);

        const range = Selector.getRequestRangeByName(documentOf(text), 'missing');
        expect(range).toBeNull();
    });

    it('returns null for an empty document', () => {
        const range = Selector.getRequestRangeByName(documentOf(''), 'anything');
        expect(range).toBeNull();
    });
});
