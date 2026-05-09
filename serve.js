import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

import healthHandler from './api/health.js';
import searchHandler from './api/search.js';
import suggestHandler from './api/suggest.js';
import generateReviewHandler from './api/generate-review.js';
import generateChapterHandler from './api/generate-chapter.js';
import generateOutlineHandler from './api/generate-outline.js';
import rewriteSelectionHandler from './api/rewrite-selection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

function route(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error('[api] error:', err.message);
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

app.use(express.static(join(__dirname, 'dist')));
app.get('/{*path}', (req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')));

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`   Gemini API: ${!!process.env.GEMINI_API_KEY}`);
});

server.on('error', (e) => console.error('Server error:', e.message));
process.on('uncaughtException', (e) => console.error('Uncaught:', e.message));
process.on('unhandledRejection', (e) => console.error('Unhandled rejection:', e));
