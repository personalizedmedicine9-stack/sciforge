import { Client } from '@elastic/elasticsearch';

let _client = null;

export function getClient() {
  if (_client) return _client;

  const url    = process.env.ELASTIC_URL;
  const apiKey = process.env.ELASTIC_API_KEY;

  if (!url || !apiKey) {
    throw new Error('ELASTIC_URL and ELASTIC_API_KEY must be set');
  }

  _client = new Client({
    node: url,
    auth: { apiKey },
    requestTimeout: 10_000,
    sniffOnStart: false,
  });

  return _client;
}

export const INDEX = 'papers_v1';
