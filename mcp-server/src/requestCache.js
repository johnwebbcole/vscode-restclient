/**
 * An in-memory, process-lifetime cache of named request/response results, keyed
 * by a request's '# @name' value. Backs {{name.response.body.$.path}} /
 * {{name.request...}} chaining (see resolveChainedVariable in
 * variableSubstitution.js) across separate run_request/run_file tool calls,
 * the same way run_file's local `chainedResults` object already backs it
 * within a single call.
 *
 * Each entry is { request: {method,url,headers,body}, response: {status,headers,body} },
 * the same shape run_file assembles locally. Running a request under a name
 * that's already cached simply overwrites the previous entry - no TTL or
 * eviction, matching how run_file already behaves when a name repeats.
 */
export class RequestCache {
  constructor() {
    this.store = new Map(); // name -> { request, response }
  }

  get(name) {
    return this.store.get(name);
  }

  set(name, entry) {
    this.store.set(name, entry);
  }

  /** Returns a plain object snapshot suitable as `chainedResults` for substituteVariables. */
  toObject() {
    return Object.fromEntries(this.store);
  }

  clear() {
    this.store.clear();
  }
}

export function createRequestCache() {
  return new RequestCache();
}
