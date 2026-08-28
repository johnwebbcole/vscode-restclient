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

describe('$file system variable', () => {
  test('inserts a text file verbatim when no encoding is given', () => {
    withTempDir(dir => {
      fs.writeFileSync(path.join(dir, 'bar.txt'), 'hello world\n');
      assert.equal(resolveSystemVariable('$file bar.txt', { httpFileDir: dir }), 'hello world\n');
    });
  });

  test('base64 encodes binary content without corrupting it', () => {
    withTempDir(dir => {
      const binary = Buffer.from([0x00, 0xff, 0x89, 0x50, 0x4e, 0x47]);
      fs.writeFileSync(path.join(dir, 'foo.jpg'), binary);
      const value = resolveSystemVariable('$file foo.jpg base64', { httpFileDir: dir });
      assert.ok(Buffer.from(value, 'base64').equals(binary));
    });
  });

  test('json encoding escapes the content so it parses back once quoted', () => {
    withTempDir(dir => {
      const original = 'say "hi"\nsecond line';
      fs.writeFileSync(path.join(dir, 'note.txt'), original);
      const value = resolveSystemVariable('$file note.txt json', { httpFileDir: dir });
      assert.equal(JSON.parse(`"${value}"`), original);
    });
  });

  test("prefers the workspace root over the .http file's directory", () => {
    withTempDir(dir => {
      const workspaceRoot = path.join(dir, 'workspace');
      const httpFileDir = path.join(dir, 'requests');
      fs.mkdirSync(workspaceRoot);
      fs.mkdirSync(httpFileDir);
      fs.writeFileSync(path.join(workspaceRoot, 'bar.txt'), 'from workspace');
      fs.writeFileSync(path.join(httpFileDir, 'bar.txt'), 'from http file dir');
      assert.equal(resolveSystemVariable('$file bar.txt', { workspaceRoot, httpFileDir }), 'from workspace');
    });
  });

  test("falls back to the .http file's directory when the workspace root has no such file", () => {
    withTempDir(dir => {
      const workspaceRoot = path.join(dir, 'workspace');
      const httpFileDir = path.join(dir, 'requests');
      fs.mkdirSync(workspaceRoot);
      fs.mkdirSync(httpFileDir);
      fs.writeFileSync(path.join(httpFileDir, 'bar.txt'), 'from http file dir');
      assert.equal(resolveSystemVariable('$file bar.txt', { workspaceRoot, httpFileDir }), 'from http file dir');
    });
  });

  test('resolves an absolute path as given', () => {
    withTempDir(dir => {
      const absolutePath = path.join(dir, 'bar.txt');
      fs.writeFileSync(absolutePath, 'absolute');
      assert.equal(resolveSystemVariable(`$file ${absolutePath}`, {}), 'absolute');
    });
  });

  test('accepts a quoted path containing spaces', () => {
    withTempDir(dir => {
      fs.writeFileSync(path.join(dir, 'foo bar.txt'), 'spaced');
      assert.equal(resolveSystemVariable('$file "foo bar.txt"', { httpFileDir: dir }), 'spaced');
    });
  });

  test('returns undefined for a missing file', () => {
    withTempDir(dir => {
      assert.equal(resolveSystemVariable('$file nope.txt', { httpFileDir: dir }), undefined);
    });
  });

  test('returns undefined for an unknown encoding rather than falling back to raw', () => {
    withTempDir(dir => {
      fs.writeFileSync(path.join(dir, 'bar.txt'), 'hello');
      assert.equal(resolveSystemVariable('$file bar.txt rot13', { httpFileDir: dir }), undefined);
    });
  });

  test('returns undefined when the path names a directory', () => {
    withTempDir(dir => {
      fs.mkdirSync(path.join(dir, 'sub'));
      assert.equal(resolveSystemVariable('$file sub', { httpFileDir: dir }), undefined);
    });
  });

  test('returns undefined when no path is given', () => {
    assert.equal(resolveSystemVariable('$file', { httpFileDir: '/tmp' }), undefined);
  });
});
