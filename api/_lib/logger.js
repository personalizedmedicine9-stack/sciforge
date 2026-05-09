// ── Structured logger ─────────────────────────────────────────────────────
// Outputs JSON lines to stdout/stderr for log aggregation (Vercel, Datadog, etc.)

function log(level, message, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...meta,
  };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  info:  (msg, meta) => log('info',  msg, meta),
  warn:  (msg, meta) => log('warn',  msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  debug: (msg, meta) => { if (process.env.LOG_LEVEL === 'debug') log('debug', msg, meta); },
};

// Track request latency
export function startTimer() {
  const start = Date.now();
  return () => Date.now() - start;
}
