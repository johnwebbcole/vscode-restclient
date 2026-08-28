/**
 * Encodings the `{{$file <path> [encoding]}}` system variable can apply to a file's bytes
 * before they are substituted into a request.
 */
export enum FileEncoding {
    /** Decode the file as UTF-8 text and insert it verbatim.  The default. */
    Raw = 'raw',
    /** Standard base64 (RFC 4648), suitable for embedding binary files such as images. */
    Base64 = 'base64',
    /** UTF-8 text escaped as the body of a JSON string, without the surrounding quotes. */
    Json = 'json',
}

/**
 * Parses the optional encoding argument.  Returns undefined for anything unrecognized so an
 * unknown encoding surfaces as a warning rather than silently falling back to raw bytes.
 */
export function fromString(value: string | undefined): FileEncoding | undefined {
    switch (value?.trim().toLowerCase()) {
        case undefined:
        case '':
        case 'raw':
            return FileEncoding.Raw;
        case 'base64':
            return FileEncoding.Base64;
        case 'json':
            return FileEncoding.Json;
        default:
            return undefined;
    }
}
