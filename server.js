'use strict';

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const cron     = require('node-cron');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const GNEWS_KEY       = process.env.GNEWS_KEY        || '';
const NEWSDATA_KEY    = process.env.NEWSDATA_KEY     || '';
const CURRENTS_KEY    = process.env.CURRENTS_API_KEY || '';
const GROQ_KEY        = process.env.GROQ_API_KEY     || '';

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

// ── NewsData.io fetch ─────────────────────────────────────────────────────────
async function fetchNewsData() {
  if (!NEWSDATA_KEY) return [];
  const url = `https://newsdata.io/api/1/news?q=robotics+OR+automation+OR+drone&language=en&apikey=${NEWSDATA_KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`NewsData responded ${res.status}`);
    const data = await res.json();
    return (data.results || []).map(a => ({
      title:       a.title       || '',
      summary:     a.description || '',
      link:        a.link        || '',
      source:      a.source_id   || 'NewsData',
      publishedAt: a.pubDate     || null,
      industry:    classifyIndustry((a.title || '') + ' ' + (a.description || '')),
      vcl:         'General',
      signal:      'watch'
    })).filter(a => a.title.length > 10);
  } catch (e) {
    console.error('  ✗ NewsData error:', e.message);
    return [];
  }
}

// ── CurrentsAPI fetch ─────────────────────────────────────────────────────────
async function fetchCurrents() {
  if (!CURRENTS_KEY) return [];
  const url = `https://api.currentsapi.services/v1/search?keywords=robotics+automation+drone&language=en&apiKey=${CURRENTS_KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CurrentsAPI responded ${res.status}`);
    const data = await res.json();
    return (data.news || []).map(a => ({
      title:       a.title       || '',
      summary:     a.description || '',
      link:        a.url         || '',
      source:      'CurrentsAPI',
      publishedAt: a.published   || null,
      industry:    classifyIndustry((a.title || '') + ' ' + (a.description || '')),
      vcl:         'General',
      signal:      'watch'
    })).filter(a => a.title.length > 10);
  } catch (e) {
    console.error('  ✗ CurrentsAPI error:', e.message);
    return [];
  }
}

// ── Groq insight generation ───────────────────────────────────────────────────
async function generateInsights(articles) {
  if (!GROQ_KEY) {
    console.warn('  ⚠ GROQ_API_KEY not set — skipping insight generation');
    return [];
  }
  if (articles.length === 0) return [];

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
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({
        model:      'llama-3.3-70b-versatile',
        max_tokens: 2500,
        temperature: 0.4,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq ${res.status}: ${err}`);
    }

    const data  = await res.json();
    const text  = data.choices[0].message.content;
    console.log('  Groq raw response (first 200):', text.slice(0, 200));
    const start = text.indexOf('[');
    const end   = text.lastIndexOf(']');
    if (start === -1 || end === -1) throw new Error('No JSON array in Groq response');
    return JSON.parse(text.slice(start, end + 1));

  } catch (e) {
    console.error('  ✗ Groq error:', e.message);
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

// ── Deduplicate articles by title ─────────────────────────────────────────────
function deduplicate(articles) {
  const seen = new Set();
  return articles.filter(a => {
    const key = a.title.slice(0, 60).toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Refresh pipeline ──────────────────────────────────────────────────────────
async function refresh() {
  console.log(`[${new Date().toISOString()}] Refresh triggered`);

  const [gnews, newsdata, currents] = await Promise.all([
    fetchGNews(),
    fetchNewsData(),
    fetchCurrents()
  ]);
  console.log(`  ✓ GNews: ${gnews.length} | NewsData: ${newsdata.length} | Currents: ${currents.length}`);

  const articles = deduplicate([...gnews, ...newsdata, ...currents]);
  console.log(`  ✓ ${articles.length} unique articles after dedup`);

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

// Quick Groq connectivity test
app.get('/api/test-groq', async (req, res) => {
  if (!GROQ_KEY) return res.json({ ok: false, error: 'GROQ_API_KEY not set' });
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model:      'llama-3.3-70b-versatile',
        max_tokens: 20,
        messages:   [{ role: 'user', content: 'Reply with just: {"ok":true}' }]
      })
    });
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || JSON.stringify(data);
    res.json({ ok: r.ok, response: text, keyTail: GROQ_KEY.slice(-4) });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Full insight generation test — shows raw Groq output and any errors
app.get('/api/test-insights', async (req, res) => {
  if (!GROQ_KEY) return res.json({ ok: false, error: 'GROQ_API_KEY not set' });
  const samplePrompt = `You are an investment analyst. Given this robotics news:
Defence: AI-powered counter-drone system launched in Hyderabad
General: Meta launching AI agents for task automation
Generate exactly 2 investment insights as a JSON array with keys: tag, title, sector, vcl, what, why, whyMatters, action, confidence, timeSensitivity, momentum, dataBasis, indiaImpact, indiaWhy.
Return ONLY valid JSON array.`;
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model:       'llama-3.3-70b-versatile',
        max_tokens:  1000,
        temperature: 0.4,
        messages:    [{ role: 'user', content: samplePrompt }]
      })
    });
    const data  = await r.json();
    const text  = data.choices?.[0]?.message?.content || '';
    const start = text.indexOf('[');
    const end   = text.lastIndexOf(']');
    let parsed  = null;
    let parseError = null;
    if (start !== -1 && end !== -1) {
      try { parsed = JSON.parse(text.slice(start, end + 1)); }
      catch(e) { parseError = e.message; }
    }
    res.json({ ok: r.ok, httpStatus: r.status, rawText: text, parsed, parseError, groqError: data.error || null });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

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
  console.log(`   GNews      : ${GNEWS_KEY    ? '✓ set' : '✗ NOT SET'}`);
  console.log(`   NewsData   : ${NEWSDATA_KEY ? '✓ set' : '✗ NOT SET'}`);
  console.log(`   Currents   : ${CURRENTS_KEY ? '✓ set' : '✗ NOT SET'}`);
  console.log(`   Groq       : ${GROQ_KEY     ? '✓ set' : '✗ NOT SET'}`);
});
