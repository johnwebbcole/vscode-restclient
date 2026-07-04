/**
 * Centralized transport-selection policy for agent-driven HTTP calls.
 *
 * This is the single place that decides "curl or MCP" so the rule isn't
 * duplicated (and can't drift) between code, AGENTS.md, and README docs.
 * Detection of *whether* MCP is actually reachable is intentionally left to
 * the caller (an agent harness knows if its rest-client MCP tools are present
 * in its tool list; this module only knows what to do once that's known) -
 * that keeps selectTransport a pure, trivially testable function.
 */

export const TRANSPORT = Object.freeze({
  MCP: 'mcp',
  CURL: 'curl',
});

export const SELECTION_REASON = Object.freeze({
  DEFAULT_MCP: 'default_mcp',
  EXPLICIT_CURL: 'explicit_curl',
  MCP_UNAVAILABLE: 'mcp_unavailable',
});

// Catches phrasing like "use curl", "run curl", "via curl", "with curl" -
// i.e. the user naming the tool they want, not just mentioning it in passing
// (so "does this API support curl?" would NOT match - no imperative verb).
const EXPLICIT_CURL_PHRASE = /\b(?:use|run|via|with)\s+curl\b/i;

// Catches a literal curl command line the user pasted/typed as their ask
// (e.g. "curl -X GET https://..."), anchored to line start so a mid-sentence
// mention of the word "curl" doesn't trigger it.
const LITERAL_CURL_COMMAND = /(?:^|\n)\s*curl(?:\.exe)?\s+\S/i;

/**
 * True if the user's instruction explicitly asks for curl, either by naming
 * it with an imperative verb or by supplying a literal curl command.
 */
export function isExplicitCurlRequest(instruction) {
  if (typeof instruction !== 'string' || instruction.length === 0) {
    return false;
  }
  return EXPLICIT_CURL_PHRASE.test(instruction) || LITERAL_CURL_COMMAND.test(instruction);
}

/**
 * Decides which transport an agent should use for an HTTP call.
 *
 * @param {object} options
 * @param {string} [options.instruction] - The user's ask, verbatim, used only
 *   for explicit-curl detection.
 * @param {boolean} [options.mcpAvailable] - Whether the caller's MCP tools are
 *   reachable right now. Defaults to true (the common case: the server is up
 *   and this function is being asked to pick a transport for a new request).
 * @returns {{ transport: string|null, selectionReason: string, explicitCurl: boolean, error?: Error }}
 */
export function selectTransport({ instruction = '', mcpAvailable = true } = {}) {
  const explicitCurl = isExplicitCurlRequest(instruction);

  // Explicit curl wins even when MCP is unavailable - curl doesn't need MCP,
  // so there's no reason to block an explicit request for it.
  if (explicitCurl) {
    return { transport: TRANSPORT.CURL, selectionReason: SELECTION_REASON.EXPLICIT_CURL, explicitCurl: true };
  }

  if (!mcpAvailable) {
    // Do NOT silently fall back to curl here - that would defeat the whole
    // point of the policy. Surface a clear, actionable error instead and let
    // the caller decide (report to the user / retry once MCP is back).
    const error = new Error(
      "Rest Client MCP service is unavailable, and curl was not explicitly requested. " +
      "Not falling back to curl automatically. To proceed: check that '.mcp.json' registers " +
      "the 'rest-client' server, run 'cd mcp-server && npm install' if dependencies are missing, " +
      "then restart the agent session so it reconnects. If you actually want curl, say so explicitly " +
      "(e.g. \"use curl\") or provide the curl command directly."
    );
    error.code = 'MCP_UNAVAILABLE';
    return { transport: null, selectionReason: SELECTION_REASON.MCP_UNAVAILABLE, explicitCurl: false, error };
  }

  return { transport: TRANSPORT.MCP, selectionReason: SELECTION_REASON.DEFAULT_MCP, explicitCurl: false };
}
