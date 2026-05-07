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

// ── Rule-based insight engine ─────────────────────────────────────────────────

const VCL_MAP = {
  Agriculture: 'Software & AI',
  Defence:     'System Integrators',
  Logistics:   'Software & AI',
  Automotive:  'Manufacturers',
  Healthcare:  'Software & AI',
  Space:       'System Integrators',
  Consumer:    'Integration & Services',
  General:     'Software & AI'
};

const SECTOR_CONTEXT = {
  Agriculture: { why: 'Agri-robotics is underpenetrated — software layer over hardware creates high-margin recurring revenue.', action: 'Back AI-native farm intelligence platforms targeting data monetisation over hardware.' },
  Defence:     { why: 'Defence drone and autonomy spending is accelerating globally with geopolitical tensions rising.', action: 'Evaluate autonomous defence tech and counter-drone system startups with MIL-SPEC credentials.' },
  Logistics:   { why: 'E-commerce growth drives relentless warehouse automation demand with measurable ROI.', action: 'Target last-mile and warehouse robotics players with proven unit economics.' },
  Automotive:  { why: 'EV and autonomous vehicle transition is creating new software and sensor supply chain opportunities.', action: 'Back sensor fusion and AV software stack companies as Tier-1 suppliers transition.' },
  Healthcare:  { why: 'Surgical robotics and AI diagnostics command premium pricing with sticky hospital contracts.', action: 'Focus on AI diagnostics and minimally invasive surgical robotics with FDA clearance.' },
  Space:       { why: 'Commercial space is scaling rapidly — ground-to-orbit robotics and servicing are structurally unaddressed.', action: 'Invest in on-orbit servicing and mission integration software as launch frequency grows.' },
  Consumer:    { why: 'Home robotics and AI assistants are crossing the mass-market adoption threshold.', action: 'Target consumer robotics platforms with strong recurring revenue models.' },
  General:     { why: 'AI and automation are converging across industries, compressing software development cycles.', action: 'Identify cross-sector AI automation platforms with horizontal applicability.' }
};

function deriveTag(text, count) {
  if (/fund|invest|deal|contract|billion|raise|launch|award|partner/.test(text)) return 'invest';
  if (/saturated|commodit|margin pressure|too many players|decline|legacy/.test(text)) return 'saturated';
  return count >= 3 ? 'invest' : 'watch';
}

function deriveTimeSensitivity(text) {
  if (/launch|deploy|announc|sign|award|today|this week|just/.test(text)) return 'Immediate';
  if (/plan|develop|next year|2027|2028|future|roadmap/.test(text))       return 'Long-term';
  return 'Emerging';
}

function buildInsightsLocally(articles) {
  const sectors = {};
  articles.forEach(a => {
    if (!sectors[a.industry]) sectors[a.industry] = [];
    sectors[a.industry].push(a);
  });

  const insights = [];

  for (const [sector, arts] of Object.entries(sectors)) {
    const count   = arts.length;
    const text    = arts.map(a => a.title + ' ' + (a.summary || '')).join(' ').toLowerCase();
    const sources = [...new Set(arts.map(a => a.source))].slice(0, 3);
    const topArt  = arts[0];
    const ctx     = SECTOR_CONTEXT[sector] || SECTOR_CONTEXT.General;

    const tag             = deriveTag(text, count);
    const momentum        = count >= 4 ? 'high' : count >= 2 ? 'medium' : 'low';
    const confidence      = count >= 4 ? 'High' : count >= 2 ? 'Medium' : 'Low';
    const timeSensitivity = deriveTimeSensitivity(text);

    insights.push({
      tag,
      title:           `${sector}: ${tag === 'invest' ? 'Strong Signal' : tag === 'saturated' ? 'Crowded Space' : 'Emerging Trend'}`,
      sector,
      vcl:             VCL_MAP[sector] || 'Software & AI',
      what:            `${count} news signal${count > 1 ? 's' : ''} detected — leading story: "${topArt.title.slice(0, 90)}"`,
      why:             ctx.why,
      whyMatters:      `${count} corroborating source${count > 1 ? 's' : ''} signal ${momentum} momentum in ${sector} robotics this cycle.`,
      action:          ctx.action,
      confidence,
      timeSensitivity,
      momentum,
      dataBasis:       `${count} article${count > 1 ? 's' : ''} from ${sources.join(', ')}.`,
      indiaImpact:     'Medium',
      indiaWhy:        'Analysing India context…',
      indianCompanies: []
    });
  }

  // Sort: invest first, then watch, then saturated
  const order = { invest: 0, watch: 1, saturated: 2 };
  return insights.sort((a, b) => order[a.tag] - order[b.tag]);
}

// ── Groq: India context only (~80 tokens input) ───────────────────────────────
async function enrichIndiaContext(insights) {
  if (!GROQ_KEY || insights.length === 0) return insights;

  const sectorList = [...new Set(insights.map(i => i.sector))].join(', ');
  const prompt = `For these sectors: ${sectorList}
Return a JSON array. Each object: sector, indiaImpact("High"|"Medium"|"Low"), indiaWhy(1 sentence on India opportunity/risk), indianCompanies(array of 2-3 real Indian company names active in this space).
JSON only.`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model:       'llama-3.3-70b-versatile',
        max_tokens:  600,
        temperature: 0.3,
        messages:    [{ role: 'user', content: prompt }]
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Groq ${res.status}: ${err?.error?.message || 'unknown'}`);
    }

    const data  = await res.json();
    const text  = data.choices[0].message.content;
    const start = text.indexOf('[');
    const end   = text.lastIndexOf(']');
    if (start === -1 || end === -1) throw new Error('No JSON from Groq');

    const indiaData = JSON.parse(text.slice(start, end + 1));

    // Merge India context into insights
    return insights.map(ins => {
      const match = indiaData.find(d => d.sector === ins.sector);
      if (!match) return ins;
      return {
        ...ins,
        indiaImpact:     match.indiaImpact     || ins.indiaImpact,
        indiaWhy:        match.indiaWhy        || ins.indiaWhy,
        indianCompanies: match.indianCompanies || []
      };
    });

  } catch (e) {
    console.error('  ✗ Groq India enrichment error:', e.message);
    return insights; // return rule-based insights even if Groq fails
  }
}

async function generateInsights(articles) {
  if (articles.length === 0) return [];
  console.log('  → Building rule-based insights…');
  const insights = buildInsightsLocally(articles);
  console.log(`  ✓ ${insights.length} rule-based insights built`);
  console.log('  → Enriching with India context via Groq…');
  const enriched = await enrichIndiaContext(insights);
  console.log('  ✓ India context added');
  return enriched;
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

// ── Cron — auto-refresh every 2 hours (saves Groq token quota) ───────────────
cron.schedule('0 */2 * * *', () => {
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
