import { MemoryCache } from '../../src/utils/memoryCache';

describe('MemoryCache', () => {
    describe('createOrGet', () => {
        it('creates a new cache instance for an unseen name', () => {
            const cache = MemoryCache.createOrGet<string>('test-cache-new-1');

            expect(cache).toBeInstanceOf(MemoryCache);
        });

        it('returns the same instance for the same name', () => {
            const first = MemoryCache.createOrGet<string>('test-cache-same-1');
            const second = MemoryCache.createOrGet<string>('test-cache-same-1');

            expect(first).toBe(second);
        });

        it('returns different instances for different names', () => {
            const cacheA = MemoryCache.createOrGet<string>('test-cache-diff-a');
            const cacheB = MemoryCache.createOrGet<string>('test-cache-diff-b');

            expect(cacheA).not.toBe(cacheB);
        });
    });

    describe('get and set', () => {
        it('stores and retrieves a value by key', () => {
            const cache = MemoryCache.createOrGet<number>('test-cache-get-set-1');

            cache.set('answer', 42);

            expect(cache.get('answer')).toBe(42);
        });

        it('returns undefined for a key that has not been set', () => {
            const cache = MemoryCache.createOrGet<number>('test-cache-get-set-2');

            expect(cache.get('nonexistent')).toBeUndefined();
        });

        it('overwrites an existing value for the same key', () => {
            const cache = MemoryCache.createOrGet<string>('test-cache-get-set-3');
            cache.set('key', 'first');
            cache.set('key', 'second');

            expect(cache.get('key')).toBe('second');
        });
    });

    describe('clear', () => {
        it('removes all entries from the cache', () => {
            const cache = MemoryCache.createOrGet<string>('test-cache-clear-1');
            cache.set('a', 'alpha');
            cache.set('b', 'beta');

            cache.clear();

            expect(cache.get('a')).toBeUndefined();
            expect(cache.get('b')).toBeUndefined();
        });
    });
});
