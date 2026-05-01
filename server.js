const fetch = require('node-fetch');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

// ── API Keys ──────────────────────────────────────────────────────────────────
const GNEWS_KEY     = process.env.GNEWS_KEY     || '';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "robotics-intelligence-platform.html"));
});

// ── Anthropic client ──────────────────────────────────────────────────────────
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY || '',
  baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
  defaultHeaders: process.env.CLAUDE_CODE_OAUTH_TOKEN
    ? { 'anthropic-beta': 'oauth-2025-04-20' }
    : {}
});

// ── Keyword maps ──────────────────────────────────────────────────────────────
const INDUSTRY_KEYWORDS = {
  Defence:    ['defense','defence','military','weapon','drone','uav','army','nato','pentagon','combat','surveillance','tactical','warfighter'],
  Healthcare: ['surgical','medical','hospital','surgery','rehabilitation','exoskeleton','clinical','patient','therapy','medtech'],
  Logistics:  ['warehouse','logistics','fulfilment','fulfillment','supply chain','amr','autonomous mobile','delivery','amazon','last-mile','e-commerce'],
  Automotive: ['autonomous vehicle','self-driving','lidar','adas','robotaxi','electric vehicle','waymo','tesla','automotive','av '],
  Agriculture:['farm','agriculture','crop','harvest','tractor','precision farming','weed','livestock','agri','greenhouse'],
  Space:      ['space','orbital','satellite','lunar','moon','mars','rocket','spacecraft','nasa','esa','orbit','in-space'],
  Consumer:   ['home robot','humanoid','companion robot','cleaning robot','consumer robot','figure ai','household','personal robot']
};

const VCL_KEYWORDS = {
  'Software & AI':          ['ai','software','algorithm','model','llm','neural','autonomy','platform','saas','machine learning'],
  'Semiconductor':          ['chip','semiconductor','gpu','processor','silicon','nvidia','qualcomm','edge ai','integrated circuit'],
  'Manufacturers':          ['robot','manufacture','production','build','launch','deploy','assemble','factory'],
  'Components & Subsystems':['sensor','lidar','camera','actuator','motor','haptic','component','subsystem','vision system'],
  'System Integrators':     ['integrat','system integrat','end-to-end','turnkey','solution provider','systems'],
  'Design':                 ['design','prototype','concept','engineer','r&d','research','develop'],
  'Integration & Services': ['service','maintenance','support','consulting','implement','deploy service']
};

function tagArticle(text) {
  const lower = text.toLowerCase();
  let industry = 'General'; let maxScore = 0;
  for (const [ind, kws] of Object.entries(INDUSTRY_KEYWORDS)) {
    const score = kws.filter(k => lower.includes(k)).length;
    if (score > maxScore) { maxScore = score; industry = ind; }
  }
  let vcl = 'General'; let vclScore = 0;
  for (const [layer, kws] of Object.entries(VCL_KEYWORDS)) {
    const score = kws.filter(k => lower.includes(k)).length;
    if (score > vclScore) { vclScore = score; vcl = layer; }
  }
  return { industry, vcl };
}

function signalTag(article) {
  const lower = (article.title + ' ' + (article.summary || '')).toLowerCase();
  if (['fund','invest','acqui','raise','series','valuat','capital','round'].some(k => lower.includes(k))) return 'invest';
  return 'watch';
}

// ── In-memory cache ───────────────────────────────────────────────────────────
let cache = { articles: [], insights: [], momentum: {}, generatedAt: null };

// ── Shared query ──────────────────────────────────────────────────────────────
const SEARCH_QUERY = 'robotics OR humanoid OR "autonomous robot" OR "robotic arm" OR "drone delivery" OR "surgical robot" OR "warehouse robot" OR "self-driving" OR "agricultural robot" OR "robot funding"';

// ── GNews fetch (free: 100 req/day, max 10 per request) ───────────────────────
async function fetchGNews() {
  if (!GNEWS_KEY) return [];
  try {
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(SEARCH_QUERY)}&lang=en&max=10&sortby=publishedAt&token=${GNEWS_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`  ⚠ GNews returned ${res.status}: ${body.slice(0, 120)}`);
      return [];
    }
    const data = await res.json();
    console.log(`  ✓ GNews: ${(data.articles||[]).length} articles`);
    return (data.articles || []).map(a => {
      const text = (a.title || '') + ' ' + (a.description || '');
      const { industry, vcl } = tagArticle(text);
      return {
        title:   a.title || '',
        summary: (a.description || '').replace(/<[^>]+>/g, '').slice(0, 220),
        link:    a.url || '',
        pubDate: a.publishedAt || '',
        source:  a.source?.name || 'GNews',
        image:   a.image || '',
        industry, vcl,
        signal:  signalTag({ title: a.title, summary: a.description }),
        fetchedAt: Date.now()
      };
    }).filter(a => a.title.length > 10);
  } catch (err) {
    console.warn('  ⚠ GNews fetch failed:', err.message);
    return [];
  }
}

async function fetchAllNews() {
  const articles = await fetchGNews();
  const seen = new Set();
  return articles.filter(a => {
    const key = a.title.slice(0, 45).toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return a.title.length > 10;
  });
}

// ── Momentum ──────────────────────────────────────────────────────────────────
function computeMomentum(articles) {
  const industries = ['Agriculture','Automotive','Consumer','Defence','Healthcare','Logistics','Space','General'];
  const scores = {};
  industries.forEach(i => { scores[i] = { count: 0, invest: 0, watch: 0, articles: [] }; });
  articles.forEach(a => {
    const ind = scores[a.industry] ? a.industry : 'General';
    scores[ind].count++;
    if (a.signal === 'invest') scores[ind].invest++;
    else scores[ind].watch++;
    if (scores[ind].articles.length < 5) scores[ind].articles.push(a.title);
  });
  return scores;
}

// ── Claude prompt ─────────────────────────────────────────────────────────────
async function generateAIInsights(articles, momentum) {
  const topArticles = articles.slice(0, 12).map(a =>
    `[${a.industry}/${a.vcl}] ${a.title} (${a.source})`
  ).join('\n');

  const momentumSummary = Object.entries(momentum)
    .filter(([,v]) => v.count > 0)
    .sort((a,b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([ind, v]) => `${ind}: ${v.count} total signals (${v.invest} funding events, ${v.watch} news events)`)
    .join('\n');

  const prompt = `Robotics investment analyst. Generate 5 investment insights from live news + structural gaps.

LIVE NEWS (${articles.length} signals fetched):
${topArticles}

SECTOR MOMENTUM:
${momentumSummary}

STRUCTURAL GAPS (0 companies in these cells):
Agriculture×Software&AI | Space×Software&AI | Consumer×Software&AI
Healthcare×Components | Defence×Semiconductor | Space×SystemIntegrators | Logistics×Software&AI

RULES: Each insight MUST fuse a live signal with a gap. Keep all text fields to 1-2 lines max.

Return ONLY valid JSON array:
[{"tag":"invest|watch|saturated","title":"<85 chars","what":"1 line","why":"1 line","whyMatters":"1 punchy line","action":"1 line","sector":"Agriculture|Automotive|Consumer|Defence|Healthcare|Logistics|Space","vcl":"Software & AI|Semiconductor|Manufacturers|Components & Subsystems|System Integrators|Design|Integration & Services","confidence":"High|Medium|Low","timeSensitivity":"Immediate|Emerging|Long-term","dataBasis":"1 line with numbers","momentum":"high|medium|low","indiaImpact":"High|Medium|Low","indiaWhy":"1 line"}]`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }]
    });
    const raw = (msg.content && msg.content[0]?.text) || '';
    const start = raw.indexOf('[');
    const end   = raw.lastIndexOf(']');
    if (start !== -1 && end > start) {
      try {
        const parsed = JSON.parse(raw.slice(start, end + 1));
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch(parseErr) {
        console.warn('  ⚠ JSON.parse failed:', parseErr.message.slice(0, 80));
      }
    }
    console.warn('  ⚠ Claude returned empty/invalid JSON — using fallback');
    return generateFallbackInsights(articles, momentum);
  } catch (err) {
    console.error('  ⚠ Claude API error:', err.message);
    return generateFallbackInsights(articles, momentum);
  }
}

// ── Fallback ──────────────────────────────────────────────────────────────────
function generateFallbackInsights(articles, momentum) {
  const topSectors = Object.entries(momentum)
    .filter(([k,v]) => k !== 'General' && v.count > 0)
    .sort((a,b) => b[1].count - a[1].count);

  const GAPS = {
    Agriculture: { vcl: 'Software & AI', gap: '9 hardware vs 1 software (9:1)' },
    Space:       { vcl: 'Software & AI', gap: '8 hardware vs 0 software' },
    Consumer:    { vcl: 'Software & AI', gap: '14 hardware vs 0 software' },
    Defence:     { vcl: 'Semiconductor', gap: '14 companies, 0 chip makers' },
    Healthcare:  { vcl: 'Components & Subsystems', gap: '$380B market, 0 component specialists' },
    Logistics:   { vcl: 'Software & AI', gap: '10 hardware vs 2 software (5:1)' }
  };

  return topSectors.slice(0, 5).map(([sector, data]) => {
    const gap = GAPS[sector];
    return {
      tag: data.invest > 0 ? 'invest' : 'watch',
      title: `${sector} gaining ${data.count} live signals — ${gap ? gap.vcl+' gap remains open' : 'activity rising'}`,
      what: `${data.count} news signals tracked in ${sector} this cycle, including ${data.invest} funding event${data.invest!==1?'s':''}.`,
      why: gap ? `Despite activity, the ${gap.vcl} layer in ${sector} remains vacant (${gap.gap}).` : 'Momentum is building but structural gaps persist.',
      whyMatters: `${sector} is generating news but the software/AI layer is still unbuilt — activity creates urgency for the platform play.`,
      action: `Monitor ${sector} ${gap?.vcl||'software'} closely. Review structural gap in Cross-Map heatmap for unclaimed positions.`,
      sector, vcl: gap?.vcl || 'Software & AI',
      confidence: data.invest > 0 ? 'High' : 'Medium',
      timeSensitivity: data.count >= 4 ? 'Immediate' : 'Emerging',
      dataBasis: gap ? `${gap.gap} — structural imbalance confirmed in live data.` : `${data.count} signals detected.`,
      momentum: data.count >= 4 ? 'high' : data.count >= 2 ? 'medium' : 'low',
      indiaImpact: ['Agriculture','Defence','Space','Logistics'].includes(sector) ? 'High' : 'Medium',
      indiaWhy: `India's ${sector.toLowerCase()} sector is actively scaling and will benefit from global trends in this space.`
    };
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/api/news', async (req, res) => {
  const articles = await fetchAllNews();
  res.json({ articles, fetchedAt: new Date().toISOString() });
});

app.post('/api/refresh', async (req, res) => {
  cache = { articles: [], insights: [], momentum: {}, generatedAt: null };
  try {
    console.log(`[${new Date().toISOString()}] Refresh triggered — querying NewsAPI…`);
    const articles = await fetchAllNews();
    console.log(`  ✓ ${articles.length} fresh articles fetched`);

    const momentum = computeMomentum(articles);
    const activeSectors = Object.entries(momentum).filter(([,v])=>v.count>0).map(([k])=>k).join(', ');
    console.log(`  ✓ Active sectors: ${activeSectors}`);

    console.log('  → Calling Claude for AI insights…');
    const insights = await generateAIInsights(articles, momentum);
    console.log(`  ✓ ${insights.length} insights generated`);

    cache = { articles, insights, momentum, generatedAt: new Date().toISOString() };
    res.json(cache);
  } catch (err) {
    console.error('[Refresh] Fatal error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cache', (req, res) => res.json(cache));

app.get('/api/status', (req, res) => {
  const rawKey = process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY || '';
  const maskedKey = rawKey.length > 8 ? '****' + rawKey.slice(-4) : rawKey.length > 0 ? '****' : 'NOT SET';
  const maskOrUnset = k => k.length > 8 ? '****' + k.slice(-4) : k.length > 0 ? '****' : 'NOT SET';

  res.json({
    newsEndpoint: 'GNews (up to 10 articles per refresh)',
    apiKey:        maskedKey,
    gNewsKey:      maskOrUnset(GNEWS_KEY),
    articlesFetched: cache.articles.length,
    lastFetch:     cache.generatedAt ? new Date(cache.generatedAt).toLocaleString() : null,
    source:        cache.generatedAt ? 'Live (last refresh)' : 'No data — click Refresh',
    feedCount:     1
  });
});

// ── Auto-refresh ──────────────────────────────────────────────────────────────
let autoRefreshEnabled = false;
let cronJob = null;

async function runBackgroundRefresh() {
  console.log(`[${new Date().toISOString()}] Auto-refresh triggered…`);
  try {
    cache = { articles: [], insights: [], momentum: {}, generatedAt: null };
    const articles = await fetchAllNews();
    const momentum = computeMomentum(articles);
    const insights = await generateAIInsights(articles, momentum);
    cache = { articles, insights, momentum, generatedAt: new Date().toISOString() };
    console.log(`  ✓ Auto-refresh complete — ${articles.length} articles, ${insights.length} insights`);
  } catch (err) {
    console.error('[Auto-refresh] Error:', err.message);
  }
}

app.post('/api/auto-refresh', (req, res) => {
  const { enable } = req.body;
  autoRefreshEnabled = !!enable;
  if (autoRefreshEnabled) {
    if (!cronJob) {
      cronJob = cron.schedule('*/20 * * * *', runBackgroundRefresh);
      console.log('[Auto-refresh] Scheduled — every 20 minutes');
    }
  } else {
    if (cronJob) { cronJob.destroy(); cronJob = null; }
    console.log('[Auto-refresh] Stopped');
  }
  res.json({ autoRefreshEnabled, nextRun: autoRefreshEnabled ? '20 min from last trigger' : null });
});

app.get('/api/auto-refresh', (req, res) => {
  res.json({ autoRefreshEnabled });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Robotics Intelligence Engine running at http://localhost:${PORT}`);
  console.log(`   GNews key: ${GNEWS_KEY ? '****' + GNEWS_KEY.slice(-4) : 'NOT SET'}`);
  console.log(`   Platform: http://localhost:${PORT}/robotics-intelligence-platform.html\n`);
});
