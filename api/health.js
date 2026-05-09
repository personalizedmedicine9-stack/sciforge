import { getClient } from './_lib/elastic.js';
import { logger, startTimer } from './_lib/logger.js';
import { wrapReq, wrapRes } from './_lib/res-compat.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Content-Type': 'application/json',
};

export default async function handler(rawReq, rawRes) {
  const req = wrapReq(rawReq);
  const res = wrapRes(rawRes);
  if (req.method === 'OPTIONS') return res.status(200).set(CORS).end();

  const elapsed = startTimer();

  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    services: {},
  };

  // Check Elasticsearch
  try {
    const es      = getClient();
    const info    = await es.cluster.health({ timeout: '5s' });
    checks.services.elasticsearch = {
      status: info.status || 'unknown',
      latency_ms: elapsed(),
    };
  } catch (err) {
    checks.services.elasticsearch = { status: 'down', error: err.message };
    checks.status = 'degraded';
  }

  // Check env vars
  checks.config = {
    elastic_configured:      !!(process.env.ELASTIC_URL && process.env.ELASTIC_API_KEY),
    embedding_configured:    !!process.env.OPENAI_API_KEY,
    pubmed_key_configured:   !!process.env.PUBMED_API_KEY,
  };

  const httpStatus = checks.status === 'ok' ? 200 : 207;
  logger.info('health_check', { status: checks.status, latencyMs: elapsed() });

  return res.status(httpStatus).set(CORS).json(checks);
}
