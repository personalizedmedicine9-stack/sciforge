#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# SciForge - Local Development Starter
# ═══════════════════════════════════════════════════════════════════════════

set -e
cd "$(dirname "$0")"

echo ""
echo "  ╔══════════════════════════════════════════════════════════════╗"
echo "  ║            SciForge - Local Development Server              ║"
echo "  ║   Dr. Mahmoud's Scientific Literature Intelligence Platform ║"
echo "  ╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Install dependencies if needed ──────────────────────────────
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
  echo ""
fi

# ── Step 2: Build if needed ─────────────────────────────────────────────
if [ ! -d "dist" ]; then
  echo "🔨 Building frontend..."
  npx vite build
  echo ""
fi

# ── Step 3: Start the server ────────────────────────────────────────────
echo "🚀 Starting SciForge server..."
echo "   Gemini API Key: $([ -n \"$GEMINI_API_KEY\" ] && echo '✅ Configured' || echo '⚠️  Not set (AI features disabled)')"
echo ""
echo "   🌐 Open: http://localhost:3001"
echo ""

node serve.js
