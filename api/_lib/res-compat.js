// Adds Express-style .status() / .set() / .json() / .end() to a raw
// Node http.ServerResponse so the same handler code works on both:
//   - Bolt/local (Vite plugin already provides an Express-like shim)
//   - Vercel serverless (receives raw http.IncomingMessage / ServerResponse)
//
// Call wrapRes(res) at the top of every handler BEFORE any res.* call.
// It is idempotent — if res already has .json it is returned as-is.

export function wrapReq(req) {
  // Vercel passes query params in req.query (same as Express).
  // In raw Node the URL must be parsed manually.
  if (req.query) return req; // already Express-compatible

  const url   = new URL(req.url, 'http://localhost');
  const query = {};
  for (const [k, v] of url.searchParams) query[k] = v;

  return new Proxy(req, {
    get(target, prop) {
      if (prop === 'query') return query;
      const val = target[prop];
      return typeof val === 'function' ? val.bind(target) : val;
    },
  });
}

export function wrapRes(res) {
  // Already wrapped or Express res — skip
  if (typeof res.json === 'function' && typeof res.set === 'function') return res;

  let _status = 200;
  const _headers = {};

  const shim = {
    headersSent: false,

    status(code) {
      _status = code;
      return shim;
    },

    set(keyOrObj, value) {
      if (keyOrObj && typeof keyOrObj === 'object') {
        for (const [k, v] of Object.entries(keyOrObj)) _headers[k] = v;
      } else if (typeof keyOrObj === 'string') {
        _headers[keyOrObj] = value;
      }
      return shim;
    },

    json(data) {
      if (shim.headersSent) return;
      shim.headersSent = true;
      _headers['Content-Type'] = 'application/json';
      res.writeHead(_status, _headers);
      res.end(JSON.stringify(data));
    },

    end(body) {
      if (shim.headersSent) return;
      shim.headersSent = true;
      res.writeHead(_status, _headers);
      res.end(body || '');
    },
  };

  return shim;
}
