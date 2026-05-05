'use strict';

require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const cron      = require('node-cron');
const Anthropic = require('@anthropic-ai/sdk');
const path      = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const GNEWS_KEY      = process.env.GNEWS_KEY      || '';
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY || '';

// ── In-memory cache ───────────────────────────────────────────────────────────
let cache = {
  articles:    [],
  insights:    [],
  momentum:    {},
  generatedAt: null
};

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ── Static routes ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'robotics-intelligence-platform.html'));
});

// ── Status ────────────────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({
    status:      'OK',
    timestamp:   new Date().toISOString(),
    articles:    cache.articles.length,
    insights:    cache.insights.length,
    lastRefresh: cache.generatedAt
      ? new Date(cache.generatedAt).toISOString()
      : null
  });
});

// ── Sector classifier ─────────────────────────────────────────────────────────
function classifyIndustry(text) {
  const t = text.toLowerCase();
  if (/agri|farm|crop|harvest|irrigation/.test(t))                     return 'Agriculture';
  if (/defence|defense|military|drone|weapon|missile|combat/.test(t))  return 'Defence';
  if (/logistic|warehouse|supply chain|delivery|freight/.test(t))      return 'Logistics';
  if (/automotive|vehicle|\bcar\b|\bev\b|tesla|electric vehicle/.test(t)) return 'Automotive';
  if (/health|medical|surgery|hospital|pharma|clinical/.test(t))       return 'Healthcare';
  if (/\bspace\b|satellite|rocket|orbit|lunar|nasa/.test(t))           return 'Space';
  if (/consumer|retail|\bhome\b|entertainment|wearable/.test(t))       return 'Consumer';
  return 'General';
}

// ── GNews fetch ───────────────────────────────────────────────────────────────
async function fetchGNews() {
  if (!GNEWS_KEY) {
    console.warn('  ⚠ GNEWS_KEY not set — skipping news fetch');
    return [];
  }

  const query = 'robotics OR automation OR "artificial intelligence" OR drone';
  const url   = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=10&apikey=${GNEWS_KEY}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GNews responded ${res.status}`);
    const data = await res.json();

    return (data.articles || []).map(a => ({
      title:       a.title       || '',
      summary:     a.description || '',
      link:        a.url         || '',
      source:      a.source?.name || 'GNews',
      publishedAt: a.publishedAt || null,
      industry:    classifyIndustry((a.title || '') + ' ' + (a.description || '')),
      vcl:         'General',
      signal:      'watch'
    })).filter(a => a.title.length > 10);

  } catch (e) {
    console.error('  ✗ GNews error:', e.message);
    return [];
  }
}

// ── Claude insight generation ─────────────────────────────────────────────────
async function generateInsights(articles) {
  if (!ANTHROPIC_KEY) {
    console.warn('  ⚠ ANTHROPIC_API_KEY not set — skipping insight generation');
    return [];
  }
  if (articles.length === 0) return [];

  const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

  // Group headlines by sector
  const sectors = {};
  articles.forEach(a => {
    if (!sectors[a.industry]) sectors[a.industry] = [];
    sectors[a.industry].push(a.title);
  });

  const sectorSummary = Object.entries(sectors)
    .map(([s, titles]) => `${s}:\n  - ${titles.join('\n  - ')}`)
    .join('\n\n');

  const prompt = `You are a senior investment analyst specialising in robotics and automation.

Live news grouped by sector:
${sectorSummary}

Generate exactly 5 investment insights as a JSON array. Each object must have these keys:
  tag            — "invest" | "watch" | "saturated"
  title          — punchy title, max 10 words
  sector         — one of: Agriculture / Defence / Logistics / Automotive / Healthcare / Space / Consumer / General
  vcl            — one of: Manufacturers / Software & AI / System Integrators / Components & Subsystems / Design / Semiconductor / Integration & Services
  what           — what is happening (1 sentence)
  why            — why it matters for investors (1 sentence)
  whyMatters     — the key opportunity or risk (1 sentence)
  action         — recommended investor action (1 sentence)
  confidence     — "High" | "Medium" | "Low"
  timeSensitivity — "Immediate" | "Emerging" | "Long-term"
  momentum       — "high" | "medium" | "low"
  dataBasis      — what data supports this (1 sentence)
  indiaImpact    — "High" | "Medium" | "Low"
  indiaWhy       — India relevance (1 sentence)

Return ONLY a valid JSON array. No markdown, no explanation.`;

  try {
    const msg = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      messages:   [{ role: 'user', content: prompt }]
    });

    const text  = msg.content[0].text;
    const start = text.indexOf('[');
    const end   = text.lastIndexOf(']');
    if (start === -1 || end === -1) throw new Error('No JSON array in Claude response');
    return JSON.parse(text.slice(start, end + 1));

  } catch (e) {
    console.error('  ✗ Claude error:', e.message);
    return [];
  }
}

// ── Momentum helper ───────────────────────────────────────────────────────────
function buildMomentum(articles) {
  const counts = {};
  articles.forEach(a => {
    counts[a.industry] = (counts[a.industry] || 0) + 1;
  });
  return counts;
}

// ── Refresh pipeline ──────────────────────────────────────────────────────────
async function refresh() {
  console.log(`[${new Date().toISOString()}] Refresh triggered`);

  const articles = await fetchGNews();
  console.log(`  ✓ GNews: ${articles.length} articles`);

  const insights = await generateInsights(articles);
  console.log(`  ✓ Insights: ${insights.length} generated`);

  cache = {
    articles,
    insights,
    momentum:    buildMomentum(articles),
    generatedAt: Date.now()
  };

  return cache;
}

// ── API routes ────────────────────────────────────────────────────────────────
app.post('/api/refresh', async (req, res) => {
  try {
    const data = await refresh();
    res.json(data);
  } catch (e) {
    console.error('Refresh route error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/cache', (req, res) => {
  res.json(cache);
});

// Kept for frontend compatibility
app.post('/api/auto-refresh', (req, res) => {
  res.json({ ok: true });
});

// ── Cron — auto-refresh every 20 minutes ─────────────────────────────────────
cron.schedule('*/20 * * * *', () => {
  refresh().catch(e => console.error('Cron error:', e.message));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Robotics Intelligence Engine running on port ${PORT}`);
  console.log(`   GNews key   : ${GNEWS_KEY     ? '****' + GNEWS_KEY.slice(-4)     : 'NOT SET'}`);
  console.log(`   Anthropic   : ${ANTHROPIC_KEY ? '****' + ANTHROPIC_KEY.slice(-4) : 'NOT SET'}`);
});
