import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveSystemVariable } from './systemVariables.js';

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dotenv-test-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('$dotenv system variable', () => {
  test('resolves a plain key straight from .env', () => {
    withTempDir(dir => {
      fs.writeFileSync(path.join(dir, '.env'), 'GATEWAY=https://staging.example.com\n');
      const value = resolveSystemVariable('$dotenv GATEWAY', { httpFileDir: dir });
      assert.equal(value, 'https://staging.example.com');
    });
  });

  test('resolves the "%NAME" indirection through environmentVariables, falling back to NAME itself', () => {
    withTempDir(dir => {
      fs.writeFileSync(path.join(dir, '.env'), 'GATEWAY=https://staging.example.com\nOTHER_KEY=other-value\n');

      // No mapping for GATEWAY in environmentVariables -> falls back to the literal key.
      assert.equal(
        resolveSystemVariable('$dotenv %GATEWAY', { httpFileDir: dir, environmentVariables: {} }),
        'https://staging.example.com',
      );

      // A mapping present -> indirects through it to find the real .env key.
      assert.equal(
        resolveSystemVariable('$dotenv %GATEWAY', { httpFileDir: dir, environmentVariables: { GATEWAY: 'OTHER_KEY' } }),
        'other-value',
      );
    });
  });

  test('searches parent directories for a .env file when none exists alongside the .http file', () => {
    withTempDir(dir => {
      fs.writeFileSync(path.join(dir, '.env'), 'FOO=bar\n');
      const nested = path.join(dir, 'nested', 'deeper');
      fs.mkdirSync(nested, { recursive: true });

      const value = resolveSystemVariable('$dotenv FOO', { httpFileDir: nested });
      assert.equal(value, 'bar');
    });
  });

  test('prefers .env.<environmentName> over the plain .env file', () => {
    withTempDir(dir => {
      fs.writeFileSync(path.join(dir, '.env'), 'FOO=base\n');
      fs.writeFileSync(path.join(dir, '.env.stg'), 'FOO=staging\n');

      const value = resolveSystemVariable('$dotenv FOO', { httpFileDir: dir, environmentName: 'stg' });
      assert.equal(value, 'staging');
    });
  });

  test('strips surrounding quotes from values', () => {
    withTempDir(dir => {
      fs.writeFileSync(path.join(dir, '.env'), 'TOKEN="abc def"\n');
      const value = resolveSystemVariable('$dotenv TOKEN', { httpFileDir: dir });
      assert.equal(value, 'abc def');
    });
  });

  test('returns undefined for a missing key', () => {
    withTempDir(dir => {
      fs.writeFileSync(path.join(dir, '.env'), 'FOO=bar\n');
      const value = resolveSystemVariable('$dotenv MISSING', { httpFileDir: dir });
      assert.equal(value, undefined);
    });
  });

  test('returns undefined when no .env file is found anywhere up the tree', () => {
    withTempDir(dir => {
      const value = resolveSystemVariable('$dotenv FOO', { httpFileDir: dir });
      assert.equal(value, undefined);
    });
  });

  test('returns undefined without a httpFileDir in context (no document to search from)', () => {
    const value = resolveSystemVariable('$dotenv FOO', {});
    assert.equal(value, undefined);
  });
});
