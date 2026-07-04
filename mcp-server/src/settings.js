import fs from 'node:fs';
import path from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';

/**
 * Reads `rest-client.environmentVariables` out of a workspace's
 * `.vscode/settings.json`, mirroring how the REST Client extension resolves
 * environment variables (see src/utils/httpVariableProviders/environmentVariableProvider.ts).
 * Returns { shared, environments } where `shared` applies to every
 * environment and `environments` maps environment name -> variable map.
 */
export function loadWorkspaceEnvironmentVariables(workspaceRoot) {
  const settingsPath = path.join(workspaceRoot, '.vscode', 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    return { shared: {}, environments: {} };
  }

  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const settings = parseJsonc(raw) || {};
    const all = settings['rest-client.environmentVariables'] || {};
    const { $shared: shared = {}, ...environments } = all;
    return { shared, environments };
  } catch {
    return { shared: {}, environments: {} };
  }
}

/**
 * Resolves the effective environment variable map for a given environment
 * name (shared vars merged with the named environment's vars, named vars win).
 */
export function resolveEnvironmentVariables(workspaceRoot, environmentName) {
  const { shared, environments } = loadWorkspaceEnvironmentVariables(workspaceRoot);
  const named = environmentName ? environments[environmentName] || {} : {};
  return { ...shared, ...named };
}
