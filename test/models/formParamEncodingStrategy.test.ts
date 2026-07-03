import { FormParamEncodingStrategy, fromString } from '../../src/models/formParamEncodingStrategy';

describe('fromString', () => {
    it('returns Never for "never"', () => {
        expect(fromString('never')).toBe(FormParamEncodingStrategy.Never);
    });

    it('returns Always for "always"', () => {
        expect(fromString('always')).toBe(FormParamEncodingStrategy.Always);
    });

    it('returns Automatic for "automatic"', () => {
        expect(fromString('automatic')).toBe(FormParamEncodingStrategy.Automatic);
    });

    it('is case-insensitive - NEVER maps to Never', () => {
        expect(fromString('NEVER')).toBe(FormParamEncodingStrategy.Never);
    });

    it('is case-insensitive - ALWAYS maps to Always', () => {
        expect(fromString('ALWAYS')).toBe(FormParamEncodingStrategy.Always);
    });

    it('defaults to Automatic for an unknown value', () => {
        expect(fromString('unknown')).toBe(FormParamEncodingStrategy.Automatic);
    });

    it('defaults to Automatic for an empty string', () => {
        expect(fromString('')).toBe(FormParamEncodingStrategy.Automatic);
    });
});
