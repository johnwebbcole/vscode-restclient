// Parses .http/.rest files using the same conventions as the REST Client
// VS Code extension (see src/utils/selector.ts and src/utils/httpRequestParser.ts
// in the parent project): '###' request separators, '@name = value' file
// variables, '# @name requestName' / '// @name requestName' metadata comments,
// and '#' / '//' comment lines.

const DELIMITER_REGEX = /^#{3,}/;
const COMMENT_REGEX = /^\s*(#|\/{2})/;
const METADATA_REGEX = /^\s*(?:#|\/{2})\s*@([\w-]+)(?:\s+(.*?))?\s*$/;
const FILE_VARIABLE_REGEX = /^\s*@([^\s=]+)\s*=\s*(.*?)\s*$/;
const REQUEST_LINE_REGEX = /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|CONNECT|TRACE|LOCK|UNLOCK|PROPFIND|PROPPATCH|COPY|MOVE|MKCOL|MKCALENDAR|ACL|SEARCH)\s+(.*)$/i;
const HTTP_VERSION_SUFFIX_REGEX = /\s+HTTP\/.*$/i;

function isEmptyLine(line) {
  return line.trim() === '';
}

function isCommentLine(line) {
  return COMMENT_REGEX.test(line);
}

function isFileVariableLine(line) {
  return FILE_VARIABLE_REGEX.test(line);
}

// Splits the whole file into blocks separated by '###' delimiter lines,
// mirroring Selector.getDelimiterRows / getRequestRanges.
function splitIntoBlocks(lines) {
  const blocks = [];
  let start = 0;
  for (let i = 0; i <= lines.length; i++) {
    const isDelimiter = i === lines.length || DELIMITER_REGEX.test(lines[i]);
    if (isDelimiter) {
      blocks.push({ startLine: start, lines: lines.slice(start, i) });
      start = i + 1;
    }
  }
  return blocks;
}

function parseRequestLine(line) {
  const match = REQUEST_LINE_REGEX.exec(line.trim());
  let method;
  let url;
  if (match) {
    method = match[1].toUpperCase();
    url = match[2].trim();
  } else {
    method = 'GET';
    url = line.trim();
  }
  const versionMatch = HTTP_VERSION_SUFFIX_REGEX.exec(url);
  if (versionMatch) {
    url = url.substring(0, versionMatch.index);
  }
  return { method, url: url.trim() };
}

function parseHeaders(headerLines) {
  const headers = [];
  for (const raw of headerLines) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const name = line.substring(0, idx).trim();
    const value = line.substring(idx + 1).trim();
    headers.push([name, value]);
  }
  return headers;
}

function isFormUrlEncoded(contentTypeHeader) {
  if (!contentTypeHeader) return false;
  return contentTypeHeader.split(';')[0].trim().toLowerCase() === 'application/x-www-form-urlencoded';
}

// Joins body lines the same way the REST Client extension does
// (HttpRequestParser.parseBody): for form-urlencoded bodies, a line starting
// with '&' is a continuation of the previous line (no newline inserted) so
// long parameter lists can be wrapped across lines; everything else joins
// lines with '\n' as usual.
function joinBodyLines(bodyLines, contentTypeHeader) {
  if (!isFormUrlEncoded(contentTypeHeader)) {
    return bodyLines.join('\n');
  }
  return bodyLines.reduce((acc, line, i) => acc + (i === 0 || line.startsWith('&') ? '' : '\n') + line, '');
}

// Extracts the request contained in a block, given the block's raw (comment
// and file-variable stripped) lines. Returns null if the block has no request.
function buildRequest(rawLines) {
  // trim leading/trailing blank lines
  let start = 0;
  let end = rawLines.length - 1;
  while (start <= end && (isEmptyLine(rawLines[start]) || isFileVariableLine(rawLines[start]))) start++;
  while (end >= start && isEmptyLine(rawLines[end])) end--;
  if (start > end) return null;

  const lines = rawLines.slice(start, end + 1);
  const requestLineText = lines[0];
  const { method, url } = parseRequestLine(requestLineText);
  if (!url) return null;

  let i = 1;
  const headerLines = [];
  while (i < lines.length && !isEmptyLine(lines[i])) {
    headerLines.push(lines[i]);
    i++;
  }
  // skip the blank line separating headers from body
  if (i < lines.length && isEmptyLine(lines[i])) i++;

  const headers = parseHeaders(headerLines);
  const contentTypeHeader = headers.find(([name]) => name.toLowerCase() === 'content-type')?.[1];
  const bodyLines = lines.slice(i);
  let body = bodyLines.length > 0 ? joinBodyLines(bodyLines, contentTypeHeader).replace(/\n+$/, '') : undefined;

  return {
    method,
    url,
    headers,
    body: body || undefined,
  };
}

// Scans the leading comment lines of a block for '@name' (and other)
// metadata, mirroring Selector.parseReqMetadatas.
function parseMetadata(lines) {
  const metadata = {};
  for (const line of lines) {
    if (isEmptyLine(line) || isFileVariableLine(line)) continue;
    if (!isCommentLine(line)) break;
    const match = METADATA_REGEX.exec(line);
    if (match) {
      metadata[match[1].toLowerCase()] = match[2];
    }
  }
  return metadata;
}

/**
 * Parses the file-level '@name = value' variable definitions found anywhere
 * in the document (later definitions win on name collisions).
 */
export function extractFileVariables(text) {
  const lines = text.split(/\r?\n/);
  const vars = {};
  for (const line of lines) {
    const match = FILE_VARIABLE_REGEX.exec(line);
    if (match && !isCommentLine(line)) {
      vars[match[1]] = match[2];
    }
  }
  return vars;
}

/**
 * Parses a full .http/.rest file into an ordered list of requests.
 * Each request has: { index, name, method, url, headers, body, line }
 */
export function parseHttpFile(text) {
  const lines = text.split(/\r?\n/);
  const blocks = splitIntoBlocks(lines);
  const requests = [];

  for (const block of blocks) {
    const metadata = parseMetadata(block.lines);
    const rawLines = block.lines.filter(l => !isCommentLine(l));
    const request = buildRequest(rawLines);
    if (!request) continue;

    requests.push({
      index: requests.length,
      name: metadata.name,
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body,
      line: block.startLine + 1,
      note: metadata.note,
    });
  }

  return requests;
}
