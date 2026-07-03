import { Readable } from 'node:stream';
import { expect } from 'vitest';
import { convertBufferToStream, convertStreamToBuffer, convertStreamToString } from '../../src/utils/streamUtility';

describe('streamUtility', () => {
    it('converts stream to buffer', async () => {
        const input = Buffer.from('hello world');
        const stream = convertBufferToStream(input);
        const buffer = await convertStreamToBuffer(stream);

        expect(buffer).toStrictEqual(input);
    });

    it('converts stream to string with encoding', async () => {
        const stream = convertBufferToStream(Buffer.from('plain text'));
        const text = await convertStreamToString(stream, 'utf-8');

        expect(text).toBe('plain text');
    });

    it('converts string chunks from stream to buffer', async () => {
        const stream = Readable.from(['first-', 'second']);
        const buffer = await convertStreamToBuffer(stream);

        expect(buffer).toStrictEqual(Buffer.from('first-second'));
    });

    it('rejects when stream emits error', async () => {
        const expectedError = new Error('failed to read stream');
        const stream = new Readable({
            read() {
                this.destroy(expectedError);
            }
        });

        await expect(convertStreamToBuffer(stream)).rejects.toBe(expectedError);
    });
});
