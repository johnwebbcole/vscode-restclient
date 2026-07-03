import { vi } from 'vitest';

/**
 * VariableProcessor (imported transitively via Selector) pulls in complex providers
 * that trigger a Telemetry/SystemSettings static initializer cascade at module load
 * time.  Mock it before loading VariableUtility so those modules are never executed.
 */
vi.mock('../../src/utils/variableProcessor', () => ({
    VariableProcessor: {
        processRawRequest: vi.fn().mockResolvedValue(''),
    },
}));

import { Range } from 'vscode';
import { VariableUtility } from '../../src/utils/variableUtility';

// ---------------------------------------------------------------------------
// getFileVariableDefinitionRanges
// ---------------------------------------------------------------------------
describe('VariableUtility.getFileVariableDefinitionRanges', () => {
    it('returns an empty array when the variable is not defined', () => {
        const lines = ['GET https://example.com'];
        const ranges = VariableUtility.getFileVariableDefinitionRanges(lines, 'host');
        expect(ranges).toHaveLength(0);
    });

    it('returns a range when the variable is defined once', () => {
        const lines = ['@host = https://example.com'];
        const ranges = VariableUtility.getFileVariableDefinitionRanges(lines, 'host');
        expect(ranges).toHaveLength(1);
    });

    it('uses the correct line index for the range', () => {
        const lines = ['GET https://example.com', '@token = abc123'];
        const ranges = VariableUtility.getFileVariableDefinitionRanges(lines, 'token');
        expect(ranges).toHaveLength(1);
        expect(ranges[0].start.line).toBe(1);
    });

    it('includes the @ in the range (start position)', () => {
        const lines = ['@host = https://example.com'];
        const ranges = VariableUtility.getFileVariableDefinitionRanges(lines, 'host');
        const varStart = '@host'.indexOf('@');
        expect(ranges[0].start.character).toBe(varStart);
    });

    it('end position covers @varname (name length + 1 for @)', () => {
        const lines = ['@host = https://example.com'];
        const ranges = VariableUtility.getFileVariableDefinitionRanges(lines, 'host');
        // '@host' has length 5
        expect(ranges[0].end.character).toBe(5);
    });

    it('finds multiple definitions across lines', () => {
        const lines = [
            '@host = https://a.com',
            'GET {{host}}',
            '@host = https://b.com',
        ];
        const ranges = VariableUtility.getFileVariableDefinitionRanges(lines, 'host');
        expect(ranges).toHaveLength(2);
        expect(ranges[0].start.line).toBe(0);
        expect(ranges[1].start.line).toBe(2);
    });

    it('does not match a differently-named variable', () => {
        const lines = ['@hostname = example.com'];
        const ranges = VariableUtility.getFileVariableDefinitionRanges(lines, 'host');
        expect(ranges).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// getRequestVariableDefinitionRanges
// ---------------------------------------------------------------------------
describe('VariableUtility.getRequestVariableDefinitionRanges', () => {
    it('returns an empty array when the variable is not defined', () => {
        const lines = ['GET https://example.com'];
        const ranges = VariableUtility.getRequestVariableDefinitionRanges(lines, 'getUser');
        expect(ranges).toHaveLength(0);
    });

    it('returns a range for # @name style', () => {
        const lines = ['# @name getUser', 'GET https://example.com/users/1'];
        const ranges = VariableUtility.getRequestVariableDefinitionRanges(lines, 'getUser');
        expect(ranges).toHaveLength(1);
    });

    it('returns a range for // @name style', () => {
        const lines = ['// @name createUser', 'POST https://example.com/users'];
        const ranges = VariableUtility.getRequestVariableDefinitionRanges(lines, 'createUser');
        expect(ranges).toHaveLength(1);
    });

    it('uses the correct line index', () => {
        const lines = ['GET https://example.com', '# @name createUser', 'POST https://example.com'];
        const ranges = VariableUtility.getRequestVariableDefinitionRanges(lines, 'createUser');
        expect(ranges[0].start.line).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// getFileVariableReferenceRanges
// ---------------------------------------------------------------------------
describe('VariableUtility.getFileVariableReferenceRanges', () => {
    it('returns an empty array when the variable is not referenced', () => {
        const lines = ['GET https://example.com'];
        const ranges = VariableUtility.getFileVariableReferenceRanges(lines, 'host');
        expect(ranges).toHaveLength(0);
    });

    it('finds a single reference', () => {
        const lines = ['GET {{host}}/api'];
        const ranges = VariableUtility.getFileVariableReferenceRanges(lines, 'host');
        expect(ranges).toHaveLength(1);
    });

    it('finds multiple references on the same line', () => {
        const lines = ['GET {{host}}/{{host}}/api'];
        const ranges = VariableUtility.getFileVariableReferenceRanges(lines, 'host');
        expect(ranges).toHaveLength(2);
    });

    it('finds references across multiple lines', () => {
        const lines = ['GET {{host}}/api', 'Host: {{host}}'];
        const ranges = VariableUtility.getFileVariableReferenceRanges(lines, 'host');
        expect(ranges).toHaveLength(2);
        expect(ranges[0].start.line).toBe(0);
        expect(ranges[1].start.line).toBe(1);
    });

    it('skips comment lines', () => {
        const lines = ['# {{host}}', 'GET {{host}}/api'];
        const ranges = VariableUtility.getFileVariableReferenceRanges(lines, 'host');
        expect(ranges).toHaveLength(1);
        expect(ranges[0].start.line).toBe(1);
    });

    it('does not match a differently-named variable', () => {
        const lines = ['GET {{hostname}}/api'];
        const ranges = VariableUtility.getFileVariableReferenceRanges(lines, 'host');
        expect(ranges).toHaveLength(0);
    });

    it('range start character skips the {{ prefix', () => {
        const lines = ['GET {{host}}/api'];
        const ranges = VariableUtility.getFileVariableReferenceRanges(lines, 'host');
        // "GET " = 4 chars, then "{{" = 2 more → start char = 6
        expect(ranges[0].start.character).toBe(6);
        // end char = start + 'host'.length = 10
        expect(ranges[0].end.character).toBe(10);
    });
});
