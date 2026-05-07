'use strict';

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const cron     = require('node-cron');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

const GNEWS_KEY    = process.env.GNEWS_KEY        || '';
const NEWSDATA_KEY = process.env.NEWSDATA_KEY     || '';
const CURRENTS_KEY = process.env.CURRENTS_API_KEY || '';
const GEMINI_KEY   = process.env.GEMINI_API_KEY   || '';
const GROQ_KEY     = process.env.GROQ_API_KEY     || '';   // kept as fallback

// ── In-memory cache ───────────────────────────────────────────────────────────
let cache = { articles: [], insights: [], momentum: {}, generatedAt: null };

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'robotics-intelligence-platform.html'));
});

app.get('/api/status', (req, res) => {
  res.json({
    status:      'OK',
    timestamp:   new Date().toISOString(),
    articles:    cache.articles.length,
    insights:    cache.insights.length,
    lastRefresh: cache.generatedAt ? new Date(cache.generatedAt).toISOString() : null
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTOR CLASSIFIER — broad keyword coverage
// ─────────────────────────────────────────────────────────────────────────────
function classifyIndustry(text) {
  const t = text.toLowerCase();
  if (/agri|farm|crop|harvest|irrigation|livestock|poultry|food.process|precision.farm|greenhouse/.test(t))
    return 'Agriculture';
  if (/defence|defense|military|counter.drone|weapon|missile|combat|unmanned|uav|battlefield|army|navy|air.force|warfar|ammunition|tank|naval/.test(t))
    return 'Defence';
  if (/logistic|warehouse|supply.chain|last.mile|delivery|freight|shipping|fulfillment|inventory|distribution|3pl/.test(t))
    return 'Logistics';
  if (/automotive|vehicle|self.driv|autonomous.car|electric.car|\bev\b|tesla|lidar|connected.car|fleet|driverless/.test(t))
    return 'Automotive';
  if (/health|medical|surgery|hospital|pharma|clinical|patient|diagnostic|drug.discov|biotech|radiology|patholog/.test(t))
    return 'Healthcare';
  if (/\bspace\b|satellite|rocket|orbit|lunar|nasa|spacex|isro|launch.vehicle|spacecraft|asteroid|mars/.test(t))
    return 'Space';
  if (/consumer|smart.home|home.robot|vacuum.robot|wearable|retail.robot|entertainment.robot|personal.robot/.test(t))
    return 'Consumer';
  if (/semiconductor|chip|processor|\bgpu\b|nvidia|intel|wafer|foundry|fab|tsmc|microchip/.test(t))
    return 'Semiconductor';
  if (/manufactur|factory|industrial.robot|cobot|assembly.line|production.line|cnc|welding.robot|pick.and.place/.test(t))
    return 'Manufacturing';
  if (/ai.agent|large.language|foundation.model|generative.ai|llm|openai|anthropic|chatgpt|automation.platform|robotic.process/.test(t))
    return 'AI & Software';
  return 'General';
}

// ─────────────────────────────────────────────────────────────────────────────
// NEWS SOURCES — 4 parallel fetches
// ─────────────────────────────────────────────────────────────────────────────
function normaliseArticle(title, summary, link, source, publishedAt) {
  return {
    title:       title       || '',
    summary:     summary     || '',
    link:        link        || '',
    source,
    publishedAt: publishedAt || null,
    industry:    classifyIndustry((title || '') + ' ' + (summary || '')),
    vcl:         'General',
    signal:      'watch'
  };
}

async function fetchGNews() {
  if (!GNEWS_KEY) return [];
  const q   = 'robotics OR automation OR "artificial intelligence" OR drone OR semiconductor';
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&max=10&apikey=${GNEWS_KEY}`;
  try {
    const res  = await fetch(url);
    if (!res.ok) throw new Error(`GNews ${res.status}`);
    const data = await res.json();
    return (data.articles || [])
      .map(a => normaliseArticle(a.title, a.description, a.url, a.source?.name || 'GNews', a.publishedAt))
      .filter(a => a.title.length > 10);
  } catch (e) { console.error('  ✗ GNews:', e.message); return []; }
}

async function fetchNewsData() {
  if (!NEWSDATA_KEY) return [];
  const url = `https://newsdata.io/api/1/news?q=robotics+OR+automation+OR+drone+OR+AI&language=en&apikey=${NEWSDATA_KEY}`;
  try {
    const res  = await fetch(url);
    if (!res.ok) throw new Error(`NewsData ${res.status}`);
    const data = await res.json();
    return (data.results || [])
      .map(a => normaliseArticle(a.title, a.description, a.link, a.source_id || 'NewsData', a.pubDate))
      .filter(a => a.title.length > 10);
  } catch (e) { console.error('  ✗ NewsData:', e.message); return []; }
}

async function fetchCurrents() {
  if (!CURRENTS_KEY) return [];
  const url = `https://api.currentsapi.services/v1/search?keywords=robotics+automation+drone+AI&language=en&apiKey=${CURRENTS_KEY}`;
  try {
    const res  = await fetch(url);
    if (!res.ok) throw new Error(`Currents ${res.status}`);
    const data = await res.json();
    return (data.news || [])
      .map(a => normaliseArticle(a.title, a.description, a.url, 'CurrentsAPI', a.published))
      .filter(a => a.title.length > 10);
  } catch (e) { console.error('  ✗ Currents:', e.message); return []; }
}

async function fetchGuardian() {
  // The Guardian — free, no key needed for basic access
  const url = 'https://content.guardianapis.com/search?q=robotics+automation+artificial+intelligence+drone&show-fields=trailText&page-size=10&api-key=test';
  try {
    const res  = await fetch(url);
    if (!res.ok) throw new Error(`Guardian ${res.status}`);
    const data = await res.json();
    return (data.response?.results || [])
      .map(a => normaliseArticle(a.webTitle, a.fields?.trailText, a.webUrl, 'The Guardian', a.webPublicationDate))
      .filter(a => a.title.length > 10);
  } catch (e) { console.error('  ✗ Guardian:', e.message); return []; }
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE-BASED INDIA CONTEXT — always populated, Gemini enhances if available
// ─────────────────────────────────────────────────────────────────────────────
const INDIA_CTX = {
  Agriculture: {
    indiaImpact: 'High',
    indiaWhy: 'India has 140M+ farmers with low automation penetration — precision agri-robotics has massive greenfield opportunity under PM Kisan and RKVY schemes.',
    indianCompanies: ['CropIn', 'Intello Labs', 'Fasal']
  },
  Defence: {
    indiaImpact: 'High',
    indiaWhy: 'India\'s ₹6.2L Cr defence budget and "Make in India" mandate are accelerating domestic drone and autonomous defence system procurement at scale.',
    indianCompanies: ['ideaForge Technology', 'Data Patterns', 'Alpha Design Technologies']
  },
  Logistics: {
    indiaImpact: 'High',
    indiaWhy: 'India\'s e-commerce boom (2nd fastest globally) is driving urgent warehouse automation across Tier-1 and Tier-2 cities — ROI proven at 18–24 months.',
    indianCompanies: ['GreyOrange', 'Addverb Technologies', 'ElasticRun']
  },
  Automotive: {
    indiaImpact: 'High',
    indiaWhy: 'FAME-II subsidies and EV policy push OEMs toward factory automation — Pune, Chennai and Manesar hubs are rapidly expanding robot density.',
    indianCompanies: ['Tata Motors', 'Mahindra Electric', 'Ola Electric']
  },
  Healthcare: {
    indiaImpact: 'Medium',
    indiaWhy: 'India\'s 1:1456 doctor-patient ratio creates acute demand for AI diagnostics and surgical robotics, especially in Tier-2+ cities.',
    indianCompanies: ['Niramai', 'Sigtuple', 'Qure.ai']
  },
  Space: {
    indiaImpact: 'High',
    indiaWhy: 'IN-SPACe commercialisation and 150+ space startups make India a fast-growing market — ISRO launch cadence is accelerating satellite demand.',
    indianCompanies: ['Skyroot Aerospace', 'Agnikul Cosmos', 'Pixxel']
  },
  Consumer: {
    indiaImpact: 'Medium',
    indiaWhy: 'India\'s 300M+ middle class and rising smart home adoption are opening early-stage consumer robotics demand in metro and Tier-1 markets.',
    indianCompanies: ['Milagrow Robots', 'Aqara India', 'Robosapiens India']
  },
  Semiconductor: {
    indiaImpact: 'High',
    indiaWhy: 'India Semiconductor Mission ($10B) and Tata/Micron fab investments are building domestic chip packaging and ATMP capacity at pace.',
    indianCompanies: ['Tata Electronics', 'CG Power', 'Kaynes Technology']
  },
  Manufacturing: {
    indiaImpact: 'High',
    indiaWhy: 'PLI schemes across 14 sectors and China+1 supply chain realignment are driving rapid cobot and industrial automation adoption in Indian factories.',
    indianCompanies: ['Jyoti CNC', 'Bharat Forge', 'KUKA India']
  },
  'AI & Software': {
    indiaImpact: 'High',
    indiaWhy: 'India\'s 5M+ developer base and 1,700+ Global Capability Centres make it the world\'s largest AI software talent and delivery hub.',
    indianCompanies: ['Persistent Systems', 'Mphasis', 'KPIT Technologies']
  },
  General: {
    indiaImpact: 'Medium',
    indiaWhy: 'India\'s Digital India mission and 3rd-largest startup ecosystem position it to rapidly absorb and commercialise emerging automation trends.',
    indianCompanies: ['Tata Consultancy Services', 'Infosys', 'Tech Mahindra']
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// RULE-BASED INSIGHT ENGINE — 2 insights per sector
// ─────────────────────────────────────────────────────────────────────────────
const VCL_MAP = {
  Agriculture:  'Software & AI',
  Defence:      'System Integrators',
  Logistics:    'Software & AI',
  Automotive:   'Manufacturers',
  Healthcare:   'Software & AI',
  Space:        'System Integrators',
  Consumer:     'Integration & Services',
  Semiconductor:'Semiconductor',
  Manufacturing:'Manufacturers',
  'AI & Software': 'Software & AI',
  General:      'Software & AI'
};

const SECTOR_CTX = {
  Agriculture:  {
    structural: { title: 'Agriculture: Software Layer Unclaimed Over Hardware',   why: 'Hardware is commoditising — AI farm management software captures recurring margin.', action: 'Back AI-native farm intelligence platforms targeting precision farming and yield optimisation.' },
    trend:      { title: 'Agriculture: Agri-Robotics Adoption Accelerating',       why: 'Government subsidies and labour shortages are driving faster agri-robot deployment.', action: 'Target agri-robotics distributors and sensor network providers in Tier-2 farm markets.' }
  },
  Defence:      {
    structural: { title: 'Defence: Autonomy Spend Structurally Rising',           why: 'Defence drone and counter-drone budgets are compounding 20%+ annually across NATO and Indo-Pacific.', action: 'Evaluate autonomous defence tech startups with dual-use certification and government contracts.' },
    trend:      { title: 'Defence: Counter-Drone Systems in Demand',              why: 'Geopolitical tensions are accelerating procurement of counter-UAS and electronic warfare systems.', action: 'Focus on counter-drone software and sensor fusion companies with proven field deployment.' }
  },
  Logistics:    {
    structural: { title: 'Logistics: Warehouse Automation ROI Is Proven',         why: 'E-commerce growth drives 15–20% cost reduction from warehouse robotics — measurable and bankable.', action: 'Target warehouse robotics and WMS software companies with Fortune 500 pilot contracts.' },
    trend:      { title: 'Logistics: Last-Mile Robotics at Inflection Point',     why: 'Labour cost pressure and delivery density are finally making last-mile robots economically viable.', action: 'Back last-mile autonomous delivery platforms with regulatory approvals in hand.' }
  },
  Automotive:   {
    structural: { title: 'Automotive: EV Software Stack Underbuilt',              why: 'EV transition shifts value from mechanical to software — OEMs are structurally behind on software.', action: 'Back EV software stack and OTA update platform companies supplying multiple OEMs.' },
    trend:      { title: 'Automotive: AV Sensor Supply Chain Opportunity',        why: 'Autonomous vehicle programmes are scaling sensor procurement with no dominant supplier.', action: 'Invest in lidar and sensor fusion software companies with Tier-1 automotive design wins.' }
  },
  Healthcare:   {
    structural: { title: 'Healthcare: Surgical Robotics Margins Compounding',     why: 'Surgical robotics command 70%+ gross margins with 10-year hospital lock-in contracts.', action: 'Focus on minimally invasive surgical robotics with CE/FDA clearance and recurring consumables.' },
    trend:      { title: 'Healthcare: AI Diagnostics Replacing Manual Reads',     why: 'AI radiology and pathology tools are achieving specialist-level accuracy at 10% of cost.', action: 'Back AI diagnostic platforms with peer-reviewed validation and payer reimbursement pathways.' }
  },
  Space:        {
    structural: { title: 'Space: Systems Integration Layer Structurally Absent',  why: 'Commercial launches growing past 100/year with zero multi-mission orchestration infrastructure.', action: 'Invest in mission control and systems integration software for commercial space robotics.' },
    trend:      { title: 'Space: On-Orbit Servicing Demand Emerging',             why: 'Satellite fleet operators need refuelling and repair services as orbital congestion grows.', action: 'Back on-orbit servicing startups with anchor contracts from satellite fleet operators.' }
  },
  Consumer:     {
    structural: { title: 'Consumer: Home Robots Crossing Mass-Market Threshold',  why: 'Price-performance of home robots has hit the consumer adoption curve tipping point.', action: 'Target consumer robotics platforms with app ecosystems and subscription revenue models.' },
    trend:      { title: 'Consumer: AI Agents Entering Daily Workflows',          why: 'AI assistants are moving from chat to task execution — sticky engagement and high LTV.', action: 'Back AI agent platforms with workflow integrations and demonstrated retention metrics.' }
  },
  Semiconductor:{
    structural: { title: 'Semiconductor: AI Chip Demand Structurally Undersupplied', why: 'AI inference demand is growing 10× faster than fab capacity additions.', action: 'Invest in AI chip designers and advanced packaging companies with hyperscaler supply agreements.' },
    trend:      { title: 'Semiconductor: Edge AI Chips Opening New Markets',      why: 'On-device AI processing removes cloud dependency — enabling robotics in connectivity-poor environments.', action: 'Back edge AI semiconductor companies targeting robotics, automotive and industrial IoT.' }
  },
  Manufacturing:{
    structural: { title: 'Manufacturing: Cobot Penetration Still Under 5%',       why: 'Only 5% of global manufacturing tasks are automated — runway is enormous at current adoption rates.', action: 'Target cobot and flexible automation platform companies with SME-focused pricing models.' },
    trend:      { title: 'Manufacturing: AI Quality Control Replacing Vision Systems', why: 'AI-powered defect detection outperforms traditional machine vision at a fraction of integration cost.', action: 'Back AI quality inspection platforms with proven production line deployments and quick payback.' }
  },
  'AI & Software': {
    structural: { title: 'AI Platforms: Horizontal Automation Stack Emerging',    why: 'Foundation models are enabling cross-industry automation platforms with winner-take-most dynamics.', action: 'Back horizontal AI automation platforms with strong developer ecosystems and API revenue.' },
    trend:      { title: 'AI Agents: Autonomous Task Execution Going Mainstream', why: 'AI agents are moving from demos to production — enterprise spend on agentic workflows is accelerating.', action: 'Invest in enterprise AI agent platforms with measurable productivity gains and Fortune 500 pilots.' }
  },
  General:      {
    structural: { title: 'Cross-Sector: AI Automation Convergence Signal',        why: 'Multiple industries simultaneously adopting AI automation signals a platform-level shift in progress.', action: 'Identify cross-sector AI automation infrastructure plays with horizontal applicability.' },
    trend:      { title: 'General: Automation Adoption Accelerating This Cycle',  why: 'Volume of automation news signals market is past early adopter phase and entering mainstream deployment.', action: 'Look for automation enablement platforms — integration tools, training data and workflow APIs.' }
  }
};

function deriveTag(text, count) {
  if (/\bfund|\binvest|deal signed|contract award|billion|\bmillion|raise|ipo|acqui|partner/.test(text)) return 'invest';
  if (/saturated|too many|margin pressure|commodit|legacy player|decline/.test(text))                  return 'saturated';
  return count >= 3 ? 'invest' : 'watch';
}

function deriveTimeSensitivity(text) {
  if (/launch|deploy|announc|signed|awarded|today|this week|just released|unveiled/.test(text)) return 'Immediate';
  if (/plan|roadmap|develop|next year|2027|2028|2029|future|long.term/.test(text))             return 'Long-term';
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
    const text    = arts.map(a => (a.title + ' ' + (a.summary || ''))).join(' ').toLowerCase();
    const sources = [...new Set(arts.map(a => a.source))].slice(0, 3);
    const topArt  = arts[0];
    const secArt  = arts[1] || arts[0];
    const ctx     = SECTOR_CTX[sector] || SECTOR_CTX.General;

    const tag             = deriveTag(text, count);
    const momentum        = count >= 5 ? 'high' : count >= 2 ? 'medium' : 'low';
    const confidence      = count >= 5 ? 'High' : count >= 2 ? 'Medium' : 'Low';
    const timeSensitivity = deriveTimeSensitivity(text);
    const vcl             = VCL_MAP[sector] || 'Software & AI';
    const india           = INDIA_CTX[sector] || INDIA_CTX.General;

    // Insight 1 — Structural gap / opportunity
    insights.push({
      tag,
      title:           ctx.structural.title,
      sector,
      vcl,
      what:            `${count} signal${count > 1 ? 's' : ''} this cycle — top story: "${topArt.title.slice(0, 85)}"`,
      why:             ctx.structural.why,
      whyMatters:      `${count} corroborating source${count > 1 ? 's' : ''} confirm ${momentum} momentum in ${sector} — structural gap remains open.`,
      action:          ctx.structural.action,
      confidence,
      timeSensitivity,
      momentum,
      dataBasis:       `${count} article${count > 1 ? 's' : ''} from ${sources.join(', ')}.`,
      indiaImpact:     india.indiaImpact,
      indiaWhy:        india.indiaWhy,
      indianCompanies: india.indianCompanies
    });

    // Insight 2 — Trend / current cycle signal
    insights.push({
      tag:             tag === 'invest' ? 'watch' : tag,
      title:           ctx.trend.title,
      sector,
      vcl,
      what:            `Trend signal: "${secArt.title.slice(0, 85)}"`,
      why:             ctx.trend.why,
      whyMatters:      `Current news cycle reinforces ${sector} as an active investment theme — timing window is ${timeSensitivity.toLowerCase()}.`,
      action:          ctx.trend.action,
      confidence:      count >= 3 ? 'Medium' : 'Low',
      timeSensitivity,
      momentum,
      dataBasis:       `Trend derived from ${count} article${count > 1 ? 's' : ''} across ${sources.join(', ')}.`,
      indiaImpact:     india.indiaImpact,
      indiaWhy:        india.indiaWhy,
      indianCompanies: india.indianCompanies
    });
  }

  const order = { invest: 0, watch: 1, saturated: 2 };
  return insights.sort((a, b) => order[a.tag] - order[b.tag]);
}

// ─────────────────────────────────────────────────────────────────────────────
// GEMINI — India context only (~80 tokens input, 1M tokens/day free)
// ─────────────────────────────────────────────────────────────────────────────
async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents:         [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 800, temperature: 0.3 }
    })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Gemini ${res.status}: ${err?.error?.message || 'unknown'}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// enrichIndiaContext — rule-based India context is already set; Gemini ENHANCES it
// with news-specific analysis. If Gemini is unavailable, rule-based data stands.
async function enrichIndiaContext(insights) {
  if (!GEMINI_KEY && !GROQ_KEY) {
    console.log('  → India context: rule-based (no AI key available)');
    return insights;  // already populated from INDIA_CTX
  }
  if (insights.length === 0) return insights;

  const sectors = [...new Set(insights.map(i => i.sector))];
  // Build sector+headline summary so Gemini can give news-specific India context
  const sectorHeadlines = sectors.map(s => {
    const arts = insights.filter(i => i.sector === s);
    const headline = arts[0]?.what?.replace(/^.*?top story: "/, '').replace(/"$/, '') || s;
    return `${s}: ${headline.slice(0, 80)}`;
  }).join('\n');

  const prompt = `You are an India-focused investment analyst. Based on today's robotics/automation news headlines below, assess India impact for each sector.

Headlines:
${sectorHeadlines}

Return a JSON array — one object per sector listed. Each object must have:
- sector: exact name from the list
- indiaImpact: "High", "Medium", or "Low"
- indiaWhy: one specific sentence on India opportunity or risk linked to today's news
- indianCompanies: array of 2-3 real Indian companies active in this sector

JSON array only. No markdown. No explanation.`;

  try {
    let text = '';
    if (GEMINI_KEY) {
      console.log('  → India context via Gemini (news-specific enhancement)…');
      text = await callGemini(prompt);
    } else {
      console.log('  → India context via Groq fallback…');
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile', max_tokens: 600, temperature: 0.3,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const d = await r.json();
      text = d.choices?.[0]?.message?.content || '';
    }

    const start = text.indexOf('[');
    const end   = text.lastIndexOf(']');
    if (start === -1 || end === -1) throw new Error('No JSON array in AI response');
    const aiData = JSON.parse(text.slice(start, end + 1));

    // Merge AI data onto insights; fall back to existing rule-based value if field missing
    return insights.map(ins => {
      const match = aiData.find(d => d.sector === ins.sector);
      if (!match) return ins;   // keep rule-based India data untouched
      return {
        ...ins,
        indiaImpact:     match.indiaImpact     || ins.indiaImpact,
        indiaWhy:        match.indiaWhy        || ins.indiaWhy,
        indianCompanies: (match.indianCompanies && match.indianCompanies.length)
                           ? match.indianCompanies
                           : ins.indianCompanies
      };
    });

  } catch (e) {
    console.error('  ✗ India AI enrichment failed — keeping rule-based data:', e.message);
    return insights;  // rule-based data already in place, no "Analysing..." ever
  }
}

async function generateInsights(articles) {
  if (articles.length === 0) return [];
  console.log('  → Building rule-based insights (2 per sector)…');
  const base     = buildInsightsLocally(articles);
  console.log(`  ✓ ${base.length} base insights built across ${Math.round(base.length / 2)} sectors`);
  const enriched = await enrichIndiaContext(base);
  console.log(`  ✓ India context enriched — ${enriched.length} total insights`);
  return enriched;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function buildMomentum(articles) {
  const counts = {};
  articles.forEach(a => { counts[a.industry] = (counts[a.industry] || 0) + 1; });
  return counts;
}

function deduplicate(articles) {
  const seen = new Set();
  return articles.filter(a => {
    const key = a.title.slice(0, 60).toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// REFRESH PIPELINE
// ─────────────────────────────────────────────────────────────────────────────
async function refresh() {
  console.log(`[${new Date().toISOString()}] Refresh triggered`);

  const [gnews, newsdata, currents, guardian] = await Promise.all([
    fetchGNews(), fetchNewsData(), fetchCurrents(), fetchGuardian()
  ]);
  console.log(`  ✓ GNews:${gnews.length} NewsData:${newsdata.length} Currents:${currents.length} Guardian:${guardian.length}`);

  const articles = deduplicate([...gnews, ...newsdata, ...currents, ...guardian]);
  console.log(`  ✓ ${articles.length} unique articles`);

  const insights = await generateInsights(articles);

  cache = { articles, insights, momentum: buildMomentum(articles), generatedAt: Date.now() };
  return cache;
}

// ─────────────────────────────────────────────────────────────────────────────
// API ROUTES
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/refresh', async (req, res) => {
  try   { res.json(await refresh()); }
  catch (e) { console.error('Refresh error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/cache',        (req, res) => res.json(cache));
app.post('/api/auto-refresh',(req, res) => res.json({ ok: true }));

app.get('/api/test-gemini', async (req, res) => {
  if (!GEMINI_KEY) return res.json({ ok: false, error: 'GEMINI_API_KEY not set' });
  try {
    const text = await callGemini('Reply with exactly: {"ok":true}');
    res.json({ ok: true, response: text, keyTail: GEMINI_KEY.slice(-4) });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

// ── Cron — every 2 hours ──────────────────────────────────────────────────────
cron.schedule('0 */2 * * *', () => {
  refresh().catch(e => console.error('Cron error:', e.message));
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Robotics Intelligence Engine on port ${PORT}`);
  console.log(`   GNews      : ${GNEWS_KEY    ? '✓' : '✗'}`);
  console.log(`   NewsData   : ${NEWSDATA_KEY ? '✓' : '✗'}`);
  console.log(`   Currents   : ${CURRENTS_KEY ? '✓' : '✗'}`);
  console.log(`   Guardian   : ✓ (no key needed)`);
  console.log(`   Gemini     : ${GEMINI_KEY   ? '✓' : '✗'}`);
  console.log(`   Groq backup: ${GROQ_KEY     ? '✓' : '✗'}`);
});
