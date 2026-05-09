import 'dotenv/config';
import express from 'express';

import healthHandler from './api/health.js';
import searchHandler from './api/search.js';
import suggestHandler from './api/suggest.js';
import generateReviewHandler from './api/generate-review.js';
import generateChapterHandler from './api/generate-chapter.js';
import generateOutlineHandler from './api/generate-outline.js';
import rewriteSelectionHandler from './api/rewrite-selection.js';

const app = express();
const PORT = 3001;

app.use(express.json());

// CORS for dev
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

function route(handler) {
  return async (req, res) => {
    try { await handler(req, res); }
    catch (err) {
      console.error('[api]', err.message);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    }
  };
}

app.all('/api/search', route(searchHandler));
app.all('/api/suggest', route(suggestHandler));
app.all('/api/health', route(healthHandler));
app.all('/api/generate-review', route(generateReviewHandler));
app.all('/api/generate-chapter', route(generateChapterHandler));
app.all('/api/generate-outline', route(generateOutlineHandler));
app.all('/api/rewrite-selection', route(rewriteSelectionHandler));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server on :${PORT} | Gemini: ${!!process.env.GEMINI_API_KEY}`);
});
