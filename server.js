// Unified dev server — serves API handlers on /api/* and proxies UI to Vite
// Production: serve static dist/ from Express on the same port
// Run:  node server.js          → API on :3001
//       SERVE_STATIC=1 node server.js → API + built dist/ on :3001

import 'dotenv/config';
import express from 'express';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

import searchHandler          from './api/search.js';
import suggestHandler        from './api/suggest.js';
import healthHandler         from './api/health.js';
import generateReviewHandler from './api/generate-review.js';
import generateChapterHandler from './api/generate-chapter.js';
import generateOutlineHandler from './api/generate-outline.js';
import rewriteSelectionHandler from './api/rewrite-selection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.API_PORT || 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Wrap Vercel-style handler for Express ────────────────────────────────
function route(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error('[api] unhandled error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error', message: err.message });
      }
    }
  };
}

// ── API routes ────────────────────────────────────────────────────────────
app.all('/api/search',           route(searchHandler));
app.all('/api/suggest',          route(suggestHandler));
app.all('/api/health',           route(healthHandler));
app.all('/api/generate-review',   route(generateReviewHandler));
app.all('/api/generate-chapter',  route(generateChapterHandler));
app.all('/api/generate-outline',     route(generateOutlineHandler));
app.all('/api/rewrite-selection',    route(rewriteSelectionHandler));

// ── Static frontend (built dist/) ────────────────────────────────────────
const distDir = join(__dirname, 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA fallback — Express 5 requires named wildcard
  app.get('/{*path}', (req, res) => {
    res.sendFile(join(distDir, 'index.html'));
  });
  console.log('[api-server] serving built frontend from dist/');
}

app.listen(PORT, () => {
  console.log(`[api-server] http://localhost:${PORT}`);
  console.log(`[api-server] elastic  : ${!!(process.env.ELASTIC_URL && process.env.ELASTIC_API_KEY)}`);
  console.log(`[api-server] gemini   : ${!!process.env.GEMINI_API_KEY}`);
  console.log(`[api-server] openai   : ${!!process.env.OPENAI_API_KEY}`);
  console.log(`[api-server] ss-key   : ${!!process.env.SEMANTIC_SCHOLAR_API_KEY}`);
});
