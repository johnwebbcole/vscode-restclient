import { describe, expect, it } from 'vitest';
import { FileEncoding, fromString } from '../../src/models/fileEncoding';
import { encodeFileContent, parseFileVariable } from '../../src/utils/fileSubstitution';

describe('fromString', () => {
    it('defaults to raw when no encoding is given', () => {
        expect(fromString(undefined)).toBe(FileEncoding.Raw);
        expect(fromString('')).toBe(FileEncoding.Raw);
    });

    it('parses each supported encoding', () => {
        expect(fromString('raw')).toBe(FileEncoding.Raw);
        expect(fromString('base64')).toBe(FileEncoding.Base64);
        expect(fromString('json')).toBe(FileEncoding.Json);
    });

    it('is case insensitive and tolerates surrounding whitespace', () => {
        expect(fromString('Base64')).toBe(FileEncoding.Base64);
        expect(fromString('  JSON  ')).toBe(FileEncoding.Json);
    });

    it('returns undefined for an unknown encoding rather than falling back to raw', () => {
        expect(fromString('hex')).toBeUndefined();
        expect(fromString('base64url')).toBeUndefined();
    });
});

describe('parseFileVariable', () => {
    it('parses a bare path with no encoding as raw', () => {
        expect(parseFileVariable('$file bar.txt')).toEqual({ filePath: 'bar.txt', encoding: FileEncoding.Raw });
    });

    it('parses a bare path with an encoding', () => {
        expect(parseFileVariable('$file foo.jpg base64')).toEqual({ filePath: 'foo.jpg', encoding: FileEncoding.Base64 });
    });

    it('keeps a relative path with directory segments intact', () => {
        expect(parseFileVariable('$file ./data/payload.json json'))
            .toEqual({ filePath: './data/payload.json', encoding: FileEncoding.Json });
    });

    it('parses an absolute path', () => {
        expect(parseFileVariable('$file /var/data/foo.bin base64'))
            .toEqual({ filePath: '/var/data/foo.bin', encoding: FileEncoding.Base64 });
    });

    it('parses a windows absolute path', () => {
        expect(parseFileVariable('$file C:\\data\\foo.bin base64'))
            .toEqual({ filePath: 'C:\\data\\foo.bin', encoding: FileEncoding.Base64 });
    });

    it('accepts a double quoted path containing spaces', () => {
        expect(parseFileVariable('$file "my photos/foo bar.jpg" base64'))
            .toEqual({ filePath: 'my photos/foo bar.jpg', encoding: FileEncoding.Base64 });
    });

    it('accepts a single quoted path containing spaces', () => {
        expect(parseFileVariable("$file 'foo bar.txt'"))
            .toEqual({ filePath: 'foo bar.txt', encoding: FileEncoding.Raw });
    });

    it('tolerates extra whitespace around the arguments', () => {
        expect(parseFileVariable('$file    bar.txt   base64  '))
            .toEqual({ filePath: 'bar.txt', encoding: FileEncoding.Base64 });
    });

    it('returns undefined when no path is given', () => {
        expect(parseFileVariable('$file')).toBeUndefined();
        expect(parseFileVariable('$file   ')).toBeUndefined();
    });

    it('returns undefined for an unknown encoding', () => {
        expect(parseFileVariable('$file bar.txt rot13')).toBeUndefined();
    });

    it('returns undefined for an unquoted path with spaces, which reads as a bad encoding', () => {
        expect(parseFileVariable('$file foo bar.txt')).toBeUndefined();
    });

    it('returns undefined for trailing arguments beyond the encoding', () => {
        expect(parseFileVariable('$file bar.txt base64 extra')).toBeUndefined();
    });

    it('does not match a different variable that starts with the same letters', () => {
        expect(parseFileVariable('$filename bar.txt')).toBeUndefined();
    });
});

describe('encodeFileContent', () => {
    it('returns UTF-8 text verbatim for raw, including the trailing newline', () => {
        expect(encodeFileContent(Buffer.from('hello world\n', 'utf8'), FileEncoding.Raw)).toBe('hello world\n');
    });

    it('decodes multi-byte UTF-8 correctly for raw', () => {
        expect(encodeFileContent(Buffer.from('héllo — wörld', 'utf8'), FileEncoding.Raw)).toBe('héllo — wörld');
    });

    it('base64 encodes text', () => {
        expect(encodeFileContent(Buffer.from('hello world', 'utf8'), FileEncoding.Base64)).toBe('aGVsbG8gd29ybGQ=');
    });

    it('base64 encodes arbitrary binary bytes without corrupting them', () => {
        const binary = Buffer.from([0x00, 0xff, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
        const encoded = encodeFileContent(binary, FileEncoding.Base64);
        expect(Buffer.from(encoded, 'base64').equals(binary)).toBe(true);
    });

    it('base64 encodes an empty file as an empty string', () => {
        expect(encodeFileContent(Buffer.alloc(0), FileEncoding.Base64)).toBe('');
    });

    it('json escapes quotes, backslashes and newlines without adding surrounding quotes', () => {
        const encoded = encodeFileContent(Buffer.from('say "hi"\\path\nnext', 'utf8'), FileEncoding.Json);
        expect(encoded).toBe('say \\"hi\\"\\\\path\\nnext');
    });

    it('produces json output that parses back to the original text once quoted', () => {
        const original = 'line one\r\n\ttabbed "quoted" \u0007 bell';
        const encoded = encodeFileContent(Buffer.from(original, 'utf8'), FileEncoding.Json);
        expect(JSON.parse(`"${encoded}"`)).toBe(original);
    });

    it('json encodes an empty file as an empty string', () => {
        expect(encodeFileContent(Buffer.alloc(0), FileEncoding.Json)).toBe('');
    });
});
