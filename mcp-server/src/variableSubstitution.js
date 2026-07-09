import { JSONPath } from 'jsonpath-plus';
import { resolveSystemVariable, UNSUPPORTED_SYSTEM_VARIABLE_REGEX } from './systemVariables.js';

const VARIABLE_REGEX = /\{\{(.+?)\}\}/g;
const REQUEST_VARIABLE_PATH_REGEX = /^(\w+)(?:\.(request|response)(?:\.(body|headers)(?:\.(.*))?)?)?$/;

function getHeaderCaseInsensitive(headers, name) {
  if (!headers) return undefined;
  const found = headers.find(([key]) => key.toLowerCase() === name.toLowerCase());
  return found ? found[1] : undefined;
}

function resolveBodyPath(body, headers, nameOrPath) {
  if (!body) return undefined;
  if (nameOrPath === '*') return body;

  let path = nameOrPath;
  let forceJson = false;
  if (path.startsWith('asJson.')) {
    path = path.substring('asJson.'.length);
    forceJson = true;
  }

  const contentType = getHeaderCaseInsensitive(headers, 'content-type') || '';
  const looksJson = forceJson || /json/i.test(contentType);
  if (!looksJson) return undefined;

  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    const result = JSONPath({ path, json: parsed });
    if (result.length === 0) return undefined;
    return typeof result[0] === 'string' ? result[0] : JSON.stringify(result[0]);
  } catch {
    return undefined;
  }
}

// Resolves "{{requestName.response.body.$.token}}" style references against
// previously run requests, mirroring requestVariableCacheValueProcessor.ts.
// `results` maps request name -> { request: {method,url,headers,body}, response: {status,headers,body} }.
function resolveChainedVariable(expr, results) {
  const match = REQUEST_VARIABLE_PATH_REGEX.exec(expr.trim());
  if (!match) return undefined;
  const [, requestName, entityType, part, nameOrPath] = match;

  const entry = results[requestName];
  if (!entry || !entityType) return undefined;

  const entity = entityType === 'request' ? entry.request : entry.response;
  if (!entity || !part) return undefined;

  if (part === 'headers') {
    if (!nameOrPath) return undefined;
    return getHeaderCaseInsensitive(entity.headers, nameOrPath);
  }
  return resolveBodyPath(entity.body, entity.headers, nameOrPath || '');
}

/**
 * Substitutes {{...}} tokens in `text` using (in priority order, matching
 * upstream VariableProcessor): system variables, chained request/response
 * variables, file '@name = value' variables, then workspace environment
 * variables. Unresolved tokens are left untouched.
 */
export function substituteVariables(text, { fileVariables = {}, environmentVariables = {}, inputVariables = {}, chainedResults = {}, systemVariableContext = {} } = {}) {
  const warnings = [];

  const result = text.replace(VARIABLE_REGEX, (whole, rawName) => {
    const name = rawName.trim();

    if (name.startsWith('$')) {
      if (UNSUPPORTED_SYSTEM_VARIABLE_REGEX.test(name)) {
        warnings.push(`System variable '${name}' requires interactive VS Code sign-in and isn't supported by the MCP server.`);
        return whole;
      }
      const value = resolveSystemVariable(name, { ...systemVariableContext, environmentVariables });
      if (value !== undefined) return value;
      warnings.push(`Could not resolve system variable '{{${name}}}'.`);
      return whole;
    }

    if (Object.prototype.hasOwnProperty.call(inputVariables, name)) {
      return String(inputVariables[name]);
    }

    const chained = resolveChainedVariable(name, chainedResults);
    if (chained !== undefined) return chained;

    if (Object.prototype.hasOwnProperty.call(fileVariables, name)) {
      return fileVariables[name];
    }

    if (Object.prototype.hasOwnProperty.call(environmentVariables, name)) {
      return String(environmentVariables[name]);
    }

    warnings.push(`Could not resolve variable '{{${name}}}'.`);
    return whole;
  });

  return { result, warnings };
}

/**
 * File variables can themselves reference other variables (input variables,
 * system variables, and chained request results from `context.chainedResults`),
 * so resolve them in declaration order against the given context. Callers
 * should re-resolve per request, since chained results accumulate as a run
 * progresses.
 */
export function resolveFileVariables(rawFileVariables, context) {
  const resolved = {};
  for (const [name, rawValue] of Object.entries(rawFileVariables)) {
    const { result } = substituteVariables(rawValue, { ...context, fileVariables: resolved });
    resolved[name] = result;
  }
  return resolved;
}
