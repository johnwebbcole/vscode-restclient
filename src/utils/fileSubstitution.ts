import { FileEncoding, fromString as parseFileEncoding } from '../models/fileEncoding';

export interface ParsedFileVariable {
    /** The path exactly as written, still relative if the author wrote it that way. */
    readonly filePath: string;
    readonly encoding: FileEncoding;
}

/**
 * `$file <path> [encoding]`.  The path may be wrapped in single or double quotes so it can
 * contain spaces; an unquoted path runs to the next whitespace.
 */
const fileVariableRegex = /^\$file\s+(?:"([^"]+)"|'([^']+)'|(\S+))(?:\s+(\S+))?\s*$/;

/**
 * Parses the text inside `{{ }}` into a path and an encoding.  Returns undefined when the
 * expression is malformed or names an encoding that does not exist, so the caller can report
 * the problem instead of guessing at what was meant.
 */
export function parseFileVariable(name: string): ParsedFileVariable | undefined {
    const groups = fileVariableRegex.exec(name.trim());
    if (groups === null) {
        return undefined;
    }

    const [, doubleQuoted, singleQuoted, bare, rawEncoding] = groups;
    const filePath = doubleQuoted ?? singleQuoted ?? bare;
    const encoding = parseFileEncoding(rawEncoding);
    if (encoding === undefined) {
        return undefined;
    }

    return { filePath, encoding };
}

/**
 * Turns the file's bytes into the string spliced into the request.
 *
 * `Json` produces the *inside* of a JSON string — quotes, backslashes, newlines and control
 * characters escaped, but no surrounding quotes — so it drops into a body that already has
 * them: `{ "note": "{{$file note.txt json}}" }`.
 */
export function encodeFileContent(content: Buffer, encoding: FileEncoding): string {
    switch (encoding) {
        case FileEncoding.Base64:
            return content.toString('base64');
        case FileEncoding.Json: {
            const serialized = JSON.stringify(content.toString('utf8'));
            return serialized.slice(1, -1);
        }
        case FileEncoding.Raw:
        default:
            return content.toString('utf8');
    }
}
