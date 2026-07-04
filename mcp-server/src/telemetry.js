/**
 * Structured logging for transport-selection decisions (mcp vs curl), so
 * operators/agents can see which path was chosen and why.
 *
 * Writes to stderr, never stdout: stdout is the MCP stdio protocol channel
 * (see index.js's StdioServerTransport) - anything written there that isn't a
 * valid protocol frame would corrupt the connection.
 */
export function logTransportSelection({ tool, selectedTransport, selectionReason, detail } = {}) {
  const line = {
    event: 'transport_selection',
    timestamp: new Date().toISOString(),
    tool,
    selected_transport: selectedTransport,
    selection_reason: selectionReason,
  };
  if (detail !== undefined) {
    line.detail = detail;
  }
  process.stderr.write(`${JSON.stringify(line)}\n`);
}
