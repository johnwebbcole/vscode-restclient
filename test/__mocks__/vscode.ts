/**
 * Minimal mock of the 'vscode' module for unit tests running outside the Extension Host.
 * Only stubs the surface area that the tested utilities actually touch at module-load and
 * runtime.  Tests that need specific behaviour can override individual properties with
 * vi.mocked() or vi.spyOn().
 */

import { vi } from 'vitest';

class Uri {
    public readonly scheme: string;
    public readonly authority: string;
    public readonly path: string;
    public readonly query: string;
    public readonly fragment: string;

    private constructor(scheme: string, authority: string, path: string, query: string, fragment: string) {
        this.scheme = scheme;
        this.authority = authority;
        this.path = path;
        this.query = query;
        this.fragment = fragment;
    }

    public get fsPath(): string {
        return this.path;
    }

    public toString(): string {
        return `${this.scheme}://${this.authority}${this.path}`;
    }

    public static parse(value: string): Uri {
        try {
            const url = new URL(value);
            return new Uri(url.protocol.replace(':', ''), url.host, url.pathname, url.search, url.hash);
        } catch {
            return new Uri('file', '', value, '', '');
        }
    }

    public static file(path: string): Uri {
        return new Uri('file', '', path, '', '');
    }

    public with(change: Partial<{ scheme: string; authority: string; path: string; query: string; fragment: string }>): Uri {
        return new Uri(
            change.scheme ?? this.scheme,
            change.authority ?? this.authority,
            change.path ?? this.path,
            change.query ?? this.query,
            change.fragment ?? this.fragment
        );
    }
}

class Position {
    constructor(public readonly line: number, public readonly character: number) {}

    public with(change: { line?: number; character?: number }): Position {
        return new Position(change.line ?? this.line, change.character ?? this.character);
    }

    public isEqual(other: Position): boolean {
        return this.line === other.line && this.character === other.character;
    }
}

class Range {
    public readonly start: Position;
    public readonly end: Position;

    constructor(
        startOrLine: Position | number,
        startCharOrEnd: Position | number,
        endLine?: number,
        endCharacter?: number
    ) {
        if (startOrLine instanceof Position) {
            this.start = startOrLine;
            this.end = startCharOrEnd as Position;
        } else {
            this.start = new Position(startOrLine as number, startCharOrEnd as number);
            this.end = new Position(endLine!, endCharacter!);
        }
    }

    public with(start?: Position, end?: Position): Range {
        return new Range(start ?? this.start, end ?? this.end);
    }
}

class SnippetString {
    constructor(public value: string = '') {}
    public appendText(text: string): this { this.value += text; return this; }
}

class MarkdownString {
    constructor(public value: string = '') {}
    public appendMarkdown(text: string): this { this.value += text; return this; }
}

const window = {
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showInputBox: vi.fn(),
    showQuickPick: vi.fn(),
    createOutputChannel: vi.fn(() => ({
        appendLine: vi.fn(),
        append: vi.fn(),
        show: vi.fn(),
        dispose: vi.fn(),
    })),
    activeTextEditor: undefined as any,
    visibleTextEditors: [],
    onDidChangeActiveTextEditor: vi.fn(),
};

const workspace = {
    getWorkspaceFolder: vi.fn(),
    getConfiguration: vi.fn(() => ({
        get: vi.fn(),
        has: vi.fn(),
        inspect: vi.fn(),
        update: vi.fn(),
    })),
    workspaceFolders: undefined as any,
    onDidChangeConfiguration: vi.fn(),
    openTextDocument: vi.fn(),
    fs: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
    },
};

const env = {
    clipboard: {
        readText: vi.fn(),
        writeText: vi.fn(),
    },
    openExternal: vi.fn(),
    uriScheme: 'vscode',
    language: 'en',
};

const commands = {
    registerCommand: vi.fn(),
    executeCommand: vi.fn(),
};

const languages = {
    registerHoverProvider: vi.fn(),
    registerDefinitionProvider: vi.fn(),
    registerCompletionItemProvider: vi.fn(),
    registerCodeLensProvider: vi.fn(),
    registerDocumentLinkProvider: vi.fn(),
    createDiagnosticCollection: vi.fn(() => ({
        set: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
        dispose: vi.fn(),
    })),
};

const extensions = {
    getExtension: vi.fn(),
};

const StatusBarAlignment = { Left: 1, Right: 2 };
const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };
const CompletionItemKind = { Text: 0, Method: 1, Function: 2, Constructor: 3, Field: 4, Variable: 5, Class: 6 };
const CodeLensProvider = {};

class EventEmitter {
    private listeners: Array<(...args: any[]) => any> = [];
    public event = (listener: (...args: any[]) => any) => {
        this.listeners.push(listener);
        return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
    };
    public fire(...args: any[]) { this.listeners.forEach(l => l(...args)); }
    public dispose() { this.listeners = []; }
}

export {
    Uri,
    Position,
    Range,
    SnippetString,
    MarkdownString,
    EventEmitter,
    StatusBarAlignment,
    DiagnosticSeverity,
    CompletionItemKind,
    CodeLensProvider,
    window,
    workspace,
    env,
    commands,
    languages,
    extensions,
};
