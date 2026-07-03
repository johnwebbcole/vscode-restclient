import { vi } from 'vitest';
import { window, workspace } from 'vscode';
import { getCurrentHttpFileName, getCurrentTextDocument, getWorkspaceRootPath } from '../../src/utils/workspaceUtility';

beforeEach(() => {
    // Reset to no active editor before each test
    (window as any).activeTextEditor = undefined;
    vi.mocked(workspace.getWorkspaceFolder).mockReset();
});

describe('getCurrentTextDocument', () => {
    it('returns undefined when there is no active editor', () => {
        (window as any).activeTextEditor = undefined;
        expect(getCurrentTextDocument()).toBeUndefined();
    });

    it('returns the document from the active editor', () => {
        const mockDoc = { fileName: '/project/test.http', uri: { toString: () => 'file:///project/test.http' } };
        (window as any).activeTextEditor = { document: mockDoc };

        expect(getCurrentTextDocument()).toBe(mockDoc);
    });
});

describe('getWorkspaceRootPath', () => {
    it('returns undefined when there is no active editor', () => {
        (window as any).activeTextEditor = undefined;
        expect(getWorkspaceRootPath()).toBeUndefined();
    });

    it('returns undefined when no workspace folder is found', () => {
        const mockDoc = { fileName: '/project/test.http', uri: { toString: () => 'file:///project/test.http' } };
        (window as any).activeTextEditor = { document: mockDoc };
        vi.mocked(workspace.getWorkspaceFolder).mockReturnValue(undefined);

        expect(getWorkspaceRootPath()).toBeUndefined();
    });

    it('returns the workspace folder URI string when found', () => {
        const mockDoc = { fileName: '/project/test.http', uri: {} };
        (window as any).activeTextEditor = { document: mockDoc };
        vi.mocked(workspace.getWorkspaceFolder).mockReturnValue({
            uri: { toString: () => 'file:///project' },
        } as any);

        expect(getWorkspaceRootPath()).toBe('file:///project');
    });
});

describe('getCurrentHttpFileName', () => {
    it('returns undefined when there is no active editor', () => {
        (window as any).activeTextEditor = undefined;
        expect(getCurrentHttpFileName()).toBeUndefined();
    });

    it('returns the base name without extension', () => {
        const mockDoc = { fileName: '/project/requests.http' };
        (window as any).activeTextEditor = { document: mockDoc };

        expect(getCurrentHttpFileName()).toBe('requests');
    });

    it('strips a .rest extension', () => {
        const mockDoc = { fileName: '/project/my-api.rest' };
        (window as any).activeTextEditor = { document: mockDoc };

        expect(getCurrentHttpFileName()).toBe('my-api');
    });

    it('handles a file with no extension', () => {
        const mockDoc = { fileName: '/project/requests' };
        (window as any).activeTextEditor = { document: mockDoc };

        expect(getCurrentHttpFileName()).toBe('requests');
    });
});
