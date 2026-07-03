import { ElementType, HttpElement } from '../../src/models/httpElement';

describe('HttpElement', () => {
    describe('Method type', () => {
        it('appends a trailing space to the text', () => {
            const el = new HttpElement('GET', ElementType.Method);
            expect(el.text).toBe('GET ');
        });

        it('stores the original name unchanged', () => {
            const el = new HttpElement('POST', ElementType.Method);
            expect(el.name).toBe('POST');
        });
    });

    describe('Header type', () => {
        it('appends ": " to the text', () => {
            const el = new HttpElement('Content-Type', ElementType.Header);
            expect(el.text).toBe('Content-Type: ');
        });

        it('stores the original name unchanged', () => {
            const el = new HttpElement('Accept', ElementType.Header);
            expect(el.name).toBe('Accept');
        });

        it('respects an explicit description', () => {
            const el = new HttpElement('Authorization', ElementType.Header, null, 'Auth header');
            expect(el.description).toBe('Auth header');
        });
    });

    describe('SystemVariable type', () => {
        it('strips the leading $ from the name', () => {
            const el = new HttpElement('$guid', ElementType.SystemVariable);
            expect(el.name).toBe('guid');
        });

        it('keeps the original text (name used for text)', () => {
            const el = new HttpElement('$guid', ElementType.SystemVariable);
            expect(el.text).toBe('$guid');
        });
    });

    describe('URL type', () => {
        it('stores the name unchanged', () => {
            const el = new HttpElement('example.com/api', ElementType.URL);
            expect(el.name).toBe('example.com/api');
        });

        it('uses the name as text when no explicit text is given', () => {
            const el = new HttpElement('example.com/api', ElementType.URL);
            expect(el.text).toBe('example.com/api');
        });
    });

    describe('explicit text override', () => {
        it('uses the provided text for a URL element', () => {
            const el = new HttpElement('example.com', ElementType.URL, null, undefined, 'custom-text');
            expect(el.text).toBe('custom-text');
        });

        it('appends ": " to an explicit string text for Header elements', () => {
            // Header type always appends ': ' regardless of whether text was explicit
            const el = new HttpElement('Accept', ElementType.Header, null, undefined, 'custom-text');
            expect(el.text).toBe('custom-text: ');
        });
    });

    describe('prefix', () => {
        it('stores a prefix when provided', () => {
            const el = new HttpElement('application/json', ElementType.MIME, '^\\s*(Content-Type)');
            expect(el.prefix).toBe('^\\s*(Content-Type)');
        });

        it('is undefined when not provided', () => {
            const el = new HttpElement('GET', ElementType.Method);
            expect(el.prefix).toBeUndefined();
        });

        it('stores null when explicitly set to null', () => {
            const el = new HttpElement('Accept', ElementType.Header, null);
            expect(el.prefix).toBeNull();
        });
    });
});
