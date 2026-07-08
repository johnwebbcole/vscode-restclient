// Implements the subset of REST Client's system variables ($guid, $timestamp,
// $datetime, $localDatetime, $randomInt, $processEnv, $dotenv) that can run
// headlessly, i.e. without VS Code UI (interactive AAD/OIDC sign-in and
// clipboard are intentionally not supported).
// See src/utils/httpVariableProviders/systemVariableProvider.ts upstream.

import fs from 'node:fs';
import path from 'node:path';

const DURATION_UNITS = { y: 'years', Q: 'quarters', M: 'months', w: 'weeks', d: 'days', h: 'hours', m: 'minutes', s: 'seconds', ms: 'milliseconds' };

function addDuration(date, amount, unit) {
  const ms = {
    y: 365 * 24 * 60 * 60 * 1000,
    Q: 91 * 24 * 60 * 60 * 1000,
    M: 30 * 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    h: 60 * 60 * 1000,
    m: 60 * 1000,
    s: 1000,
    ms: 1,
  }[unit];
  return new Date(date.getTime() + amount * ms);
}

function formatCustom(date, format) {
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return format
    .replace(/YYYY/g, date.getUTCFullYear())
    .replace(/MM/g, pad(date.getUTCMonth() + 1))
    .replace(/DD/g, pad(date.getUTCDate()))
    .replace(/HH/g, pad(date.getUTCHours()))
    .replace(/mm/g, pad(date.getUTCMinutes()))
    .replace(/ss/g, pad(date.getUTCSeconds()));
}

const TIMESTAMP_REGEX = /^\$timestamp(?:\s(-?\d+)\s(y|Q|M|w|d|h|m|s|ms))?$/;
const DATETIME_REGEX = /^\$datetime\s(rfc1123|iso8601|'.+'|".+")(?:\s(-?\d+)\s(y|Q|M|w|d|h|m|s|ms))?$/;
const LOCAL_DATETIME_REGEX = /^\$localDatetime\s(rfc1123|iso8601|'.+'|".+")(?:\s(-?\d+)\s(y|Q|M|w|d|h|m|s|ms))?$/;
const RANDOM_INT_REGEX = /^\$randomInt\s(-?\d+)\s(-?\d+)$/;
const PROCESS_ENV_REGEX = /^\$processEnv\s(%)?(\w+)$/;
const DOTENV_REGEX = /^\$dotenv\s(%)?([\w-.]+)$/;

// Minimal .env parser (KEY=value per line, '#' comments, optional quotes) -
// good enough for the values REST Client's own {{$dotenv}} variable expects;
// no need for the full dotenv package's multiline/expansion support here.
function parseDotenv(content) {
  const result = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    const quoted = /^"(.*)"$/.exec(value) || /^'(.*)'$/.exec(value);
    if (quoted) {
      value = quoted[1];
    } else {
      const commentIdx = value.indexOf(' #');
      if (commentIdx !== -1) value = value.slice(0, commentIdx).trim();
    }
    result[key] = value;
  }
  return result;
}

// Finds the closest '.env.<environmentName>' (preferred) or '.env' file,
// walking up from the .http file's directory - mirroring
// SystemVariableProvider's dotenv resolution upstream.
function findDotenvFile(startDir, environmentName) {
  let dir = startDir;
  while (true) {
    if (environmentName) {
      const namedPath = path.join(dir, `.env.${environmentName}`);
      if (fs.existsSync(namedPath)) return namedPath;
    }
    const plainPath = path.join(dir, '.env');
    if (fs.existsSync(plainPath)) return plainPath;

    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

// Resolves "$dotenv [%]NAME": with the '%' toggle, NAME is itself looked up
// in the workspace's rest-client.environmentVariables first (falling back to
// NAME unchanged if absent) to get the actual .env key - the same indirection
// upstream's resolveSettingsEnvironmentVariable performs.
function resolveDotenvVariable(name, { httpFileDir, environmentName, environmentVariables = {} } = {}) {
  const match = DOTENV_REGEX.exec(name);
  if (!match || !httpFileDir) return undefined;
  const [, refToggle, key] = match;

  const dotenvPath = findDotenvFile(httpFileDir, environmentName);
  if (!dotenvPath) return undefined;

  const dotEnvVarName = refToggle && Object.prototype.hasOwnProperty.call(environmentVariables, key)
    ? String(environmentVariables[key])
    : key;

  const parsed = parseDotenv(fs.readFileSync(dotenvPath, 'utf8'));
  if (!Object.prototype.hasOwnProperty.call(parsed, dotEnvVarName)) return undefined;
  return parsed[dotEnvVarName];
}

/**
 * Resolves a system variable expression (the text inside {{ }}, e.g.
 * "$randomInt 1 100"). Returns undefined if `expr` isn't a system variable.
 * `context` carries the extra state ($dotenv alone needs: `httpFileDir`, the
 * directory to search for a .env file, `environmentName`, and
 * `environmentVariables`, the workspace's rest-client.environmentVariables map
 * for the '%' indirection).
 */
export function resolveSystemVariable(expr, context) {
  const name = expr.trim();

  if (name === '$guid') {
    return crypto.randomUUID();
  }

  let match = TIMESTAMP_REGEX.exec(name);
  if (match) {
    const [, offset, unit] = match;
    let date = new Date();
    if (offset && unit) date = addDuration(date, Number(offset), unit);
    return Math.floor(date.getTime() / 1000).toString();
  }

  match = DATETIME_REGEX.exec(name) || LOCAL_DATETIME_REGEX.exec(name);
  if (match) {
    const [, type, offset, unit] = match;
    let date = new Date();
    if (offset && unit) date = addDuration(date, Number(offset), unit);
    if (type === 'rfc1123') return date.toUTCString();
    if (type === 'iso8601') return date.toISOString();
    return formatCustom(date, type.slice(1, -1));
  }

  match = RANDOM_INT_REGEX.exec(name);
  if (match) {
    const min = Number(match[1]);
    const max = Number(match[2]);
    if (min < max) return (Math.floor(Math.random() * (max - min)) + min).toString();
    return undefined;
  }

  match = PROCESS_ENV_REGEX.exec(name);
  if (match) {
    const envName = match[2];
    return process.env[envName] ?? '';
  }

  if (DOTENV_REGEX.test(name)) {
    return resolveDotenvVariable(name, context);
  }

  return undefined;
}

export const UNSUPPORTED_SYSTEM_VARIABLE_REGEX = /^\$(aadToken|aadV2Token|oidcToken)\b/;
