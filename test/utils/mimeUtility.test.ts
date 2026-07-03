import { MimeUtility } from '../../src/utils/mimeUtility';

describe('MimeUtility.parse', () => {
    it('parses essence and charset', () => {
        const parsed = MimeUtility.parse('application/json; charset=utf-8');

        expect(parsed.essence).toBe('application/json');
        expect(parsed.charset).toBe('utf-8');
    });

    it('parses essence without parameters', () => {
        const parsed = MimeUtility.parse('text/html');

        expect(parsed.essence).toBe('text/html');
        expect(parsed.charset).toBeUndefined();
    });

    it('normalises type and subtype to lowercase', () => {
        const parsed = MimeUtility.parse('Application/JSON');

        expect(parsed.essence).toBe('application/json');
    });

    it('parses vendor subtype with + suffix', () => {
        const parsed = MimeUtility.parse('application/vnd.github+json');

        expect(parsed.essence).toBe('application/vnd.github+json');
        expect(parsed.charset).toBeUndefined();
    });

    it('handles a content type string with no subtype (no slash)', () => {
        const parsed = MimeUtility.parse('application');

        expect(parsed.essence).toBe('application/');
        expect(parsed.charset).toBeUndefined();
    });
});

describe('MimeUtility.getExtension', () => {
    it('prefers custom extension mapping over mime-types fallback', () => {
        const extension = MimeUtility.getExtension('application/json; charset=utf-8', {
            'application/json': '.custom-json'
        });

        expect(extension).toBe('custom-json');
    });

    it('falls back to mime-types when no custom mapping', () => {
        const extension = MimeUtility.getExtension('application/json', {});

        expect(extension).toBe('json');
    });

    it('returns empty string for undefined content type', () => {
        const extension = MimeUtility.getExtension(undefined, {});

        expect(extension).toBe('');
    });

    it('returns empty string when mime-types has no extension for the content type', () => {
        const extension = MimeUtility.getExtension('application/vnd.unknown-proprietary-type', {});

        expect(extension).toBe('');
    });
});

describe('MimeUtility.isBrowserSupportedImageFormat', () => {
    it('returns true for supported image formats', () => {
        expect(MimeUtility.isBrowserSupportedImageFormat('image/jpeg')).toBe(true);
        expect(MimeUtility.isBrowserSupportedImageFormat('image/png')).toBe(true);
        expect(MimeUtility.isBrowserSupportedImageFormat('image/gif')).toBe(true);
        expect(MimeUtility.isBrowserSupportedImageFormat('image/webp')).toBe(true);
        expect(MimeUtility.isBrowserSupportedImageFormat('image/bmp')).toBe(true);
    });

    it('returns false for unsupported image format', () => {
        expect(MimeUtility.isBrowserSupportedImageFormat('image/svg+xml')).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(MimeUtility.isBrowserSupportedImageFormat(undefined)).toBe(false);
    });
});

describe('MimeUtility.isJSON', () => {
    it('returns true for application/json', () => {
        expect(MimeUtility.isJSON('application/json')).toBe(true);
    });

    it('returns true for text/json', () => {
        expect(MimeUtility.isJSON('text/json')).toBe(true);
    });

    it('returns true for vendor json subtypes with +json suffix', () => {
        expect(MimeUtility.isJSON('application/vnd.github+json')).toBe(true);
    });

    it('returns true for x-amz-json subtype', () => {
        expect(MimeUtility.isJSON('application/x-amz-json-1.1')).toBe(true);
    });

    it('returns false for non-JSON type', () => {
        expect(MimeUtility.isJSON('text/plain')).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(MimeUtility.isJSON(undefined)).toBe(false);
    });
});

describe('MimeUtility.isXml', () => {
    it('returns true for application/xml', () => {
        expect(MimeUtility.isXml('application/xml')).toBe(true);
    });

    it('returns true for text/xml', () => {
        expect(MimeUtility.isXml('text/xml')).toBe(true);
    });

    it('returns true for types with +xml suffix', () => {
        expect(MimeUtility.isXml('application/atom+xml')).toBe(true);
    });

    it('returns false for non-XML type', () => {
        expect(MimeUtility.isXml('application/json')).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(MimeUtility.isXml(undefined)).toBe(false);
    });
});

describe('MimeUtility.isHtml', () => {
    it('returns true for text/html', () => {
        expect(MimeUtility.isHtml('text/html')).toBe(true);
    });

    it('returns false for text/plain', () => {
        expect(MimeUtility.isHtml('text/plain')).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(MimeUtility.isHtml(undefined)).toBe(false);
    });
});

describe('MimeUtility.isJavaScript', () => {
    it('returns true for application/javascript', () => {
        expect(MimeUtility.isJavaScript('application/javascript')).toBe(true);
    });

    it('returns true for text/javascript', () => {
        expect(MimeUtility.isJavaScript('text/javascript')).toBe(true);
    });

    it('returns false for non-JavaScript type', () => {
        expect(MimeUtility.isJavaScript('text/plain')).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(MimeUtility.isJavaScript(undefined)).toBe(false);
    });
});

describe('MimeUtility.isCSS', () => {
    it('returns true for text/css', () => {
        expect(MimeUtility.isCSS('text/css')).toBe(true);
    });

    it('returns false for non-CSS type', () => {
        expect(MimeUtility.isCSS('text/html')).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(MimeUtility.isCSS(undefined)).toBe(false);
    });
});

describe('MimeUtility.isMultiPartMixed', () => {
    it('returns true for multipart/mixed', () => {
        expect(MimeUtility.isMultiPartMixed('multipart/mixed')).toBe(true);
    });

    it('returns false for multipart/form-data', () => {
        expect(MimeUtility.isMultiPartMixed('multipart/form-data')).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(MimeUtility.isMultiPartMixed(undefined)).toBe(false);
    });
});

describe('MimeUtility.isMultiPartFormData', () => {
    it('returns true for multipart/form-data', () => {
        expect(MimeUtility.isMultiPartFormData('multipart/form-data')).toBe(true);
    });

    it('returns false for multipart/mixed', () => {
        expect(MimeUtility.isMultiPartFormData('multipart/mixed')).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(MimeUtility.isMultiPartFormData(undefined)).toBe(false);
    });
});

describe('MimeUtility.isFormUrlEncoded', () => {
    it('returns true for application/x-www-form-urlencoded', () => {
        expect(MimeUtility.isFormUrlEncoded('application/x-www-form-urlencoded')).toBe(true);
    });

    it('returns false for application/json', () => {
        expect(MimeUtility.isFormUrlEncoded('application/json')).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(MimeUtility.isFormUrlEncoded(undefined)).toBe(false);
    });
});

describe('MimeUtility.isNewlineDelimitedJSON', () => {
    it('returns true for application/x-ndjson', () => {
        expect(MimeUtility.isNewlineDelimitedJSON('application/x-ndjson')).toBe(true);
    });

    it('returns false for application/json', () => {
        expect(MimeUtility.isNewlineDelimitedJSON('application/json')).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(MimeUtility.isNewlineDelimitedJSON(undefined)).toBe(false);
    });
});
