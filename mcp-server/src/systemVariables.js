// Implements the subset of REST Client's system variables ($guid, $timestamp,
// $datetime, $localDatetime, $randomInt, $processEnv) that can run headlessly,
// i.e. without VS Code UI (interactive AAD/OIDC sign-in, clipboard, dotenv
// resolution tied to the active editor, etc. are intentionally not supported).
// See src/utils/httpVariableProviders/systemVariableProvider.ts upstream.

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

/**
 * Resolves a system variable expression (the text inside {{ }}, e.g.
 * "$randomInt 1 100"). Returns undefined if `expr` isn't a system variable.
 */
export function resolveSystemVariable(expr) {
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

  return undefined;
}

export const UNSUPPORTED_SYSTEM_VARIABLE_REGEX = /^\$(aadToken|aadV2Token|oidcToken|dotenv)\b/;
