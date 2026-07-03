import { fromString, RequestMetadata } from '../../src/models/requestMetadata';

describe('fromString', () => {
    it('returns Name for "name"', () => {
        expect(fromString('name')).toBe(RequestMetadata.Name);
    });

    it('returns Note for "note"', () => {
        expect(fromString('note')).toBe(RequestMetadata.Note);
    });

    it('returns NoRedirect for "no-redirect"', () => {
        expect(fromString('no-redirect')).toBe(RequestMetadata.NoRedirect);
    });

    it('returns NoCookieJar for "no-cookie-jar"', () => {
        expect(fromString('no-cookie-jar')).toBe(RequestMetadata.NoCookieJar);
    });

    it('returns Prompt for "prompt"', () => {
        expect(fromString('prompt')).toBe(RequestMetadata.Prompt);
    });

    it('returns undefined for an unknown value', () => {
        expect(fromString('unknown')).toBeUndefined();
    });

    it('returns undefined for an empty string', () => {
        expect(fromString('')).toBeUndefined();
    });

    it('is case-insensitive - NAME maps to Name', () => {
        expect(fromString('NAME')).toBe(RequestMetadata.Name);
    });
});
