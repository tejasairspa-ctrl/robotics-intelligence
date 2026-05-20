'use strict';

require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const cron        = require('node-cron');
const path        = require('path');
const { MongoClient } = require('mongodb');

const app  = express();
const PORT = process.env.PORT || 3000;

const GNEWS_KEY    = process.env.GNEWS_KEY        || '';
const NEWSDATA_KEY = process.env.NEWSDATA_KEY     || '';
const CURRENTS_KEY = process.env.CURRENTS_API_KEY || '';
const GEMINI_KEY   = process.env.GEMINI_API_KEY   || '';
const GROQ_KEY     = process.env.GROQ_API_KEY     || '';
const MONGODB_URI  = process.env.MONGODB_URI      || '';

// ── MongoDB Atlas connection ───────────────────────────────────────────────────
let mongoDb     = null;   // set once connected
let mongoClient = null;

async function connectMongo() {
  if (!MONGODB_URI) {
    console.log('   MongoDB   : not configured — signal history is in-memory only');
    return;
  }
  try {
    mongoClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 6000,
      connectTimeoutMS:         6000
    });
    await mongoClient.connect();
    mongoDb = mongoClient.db('robointel');
    console.log('   MongoDB   : ✓ Connected to Atlas (robointel)');

    // Create TTL index — auto-delete snapshots older than 90 days
    await mongoDb.collection('signalHistory').createIndex(
      { capturedAt: 1 },
      { expireAfterSeconds: 90 * 24 * 3600, background: true }
    );

    // Load last 30 snapshots into memory on startup
    const docs = await mongoDb.collection('signalHistory')
      .find({})
      .sort({ capturedAt: -1 })
      .limit(30)
      .toArray();
    signalHistory = docs;
    console.log(`   MongoDB   : ✓ Loaded ${signalHistory.length} snapshots from Atlas`);
  } catch (e) {
    console.error('   MongoDB   : ✗ Connection failed:', e.message, '— using in-memory fallback');
    mongoDb = null;
  }
}

// ── In-memory cache ───────────────────────────────────────────────────────────
let cache = { articles: [], insights: [], weakSignals: [], narratives: [], momentum: {}, generatedAt: null };

// ── Signal evolution memory — persists across refreshes ──────────────────────
// key: `${sector}-${type}` (e.g. "Defence-structural")
// value: { firstSeen, history: [{ ts, tag, confidenceScore, momentum, articleCount }] }
let signalMemory = {};

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
// SECTOR CLASSIFIER
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
// INDIA CONTEXT — rule-based, Gemini enhances
// ─────────────────────────────────────────────────────────────────────────────
const INDIA_CTX = {
  Agriculture:    { indiaImpact: 'High',   indiaWhy: 'India has 140M+ farmers with low automation penetration — precision agri-robotics has massive greenfield opportunity under PM Kisan and RKVY schemes.',           indianCompanies: ['CropIn', 'Intello Labs', 'Fasal'] },
  Defence:        { indiaImpact: 'High',   indiaWhy: 'India\'s ₹6.2L Cr defence budget and "Make in India" mandate are accelerating domestic drone and autonomous defence system procurement at scale.',                indianCompanies: ['ideaForge Technology', 'Data Patterns', 'Alpha Design Technologies'] },
  Logistics:      { indiaImpact: 'High',   indiaWhy: 'India\'s e-commerce boom (2nd fastest globally) is driving urgent warehouse automation across Tier-1 and Tier-2 cities — ROI proven at 18–24 months.',           indianCompanies: ['GreyOrange', 'Addverb Technologies', 'ElasticRun'] },
  Automotive:     { indiaImpact: 'High',   indiaWhy: 'FAME-II subsidies and EV policy push OEMs toward factory automation — Pune, Chennai and Manesar hubs are rapidly expanding robot density.',                       indianCompanies: ['Tata Motors', 'Mahindra Electric', 'Ola Electric'] },
  Healthcare:     { indiaImpact: 'Medium', indiaWhy: 'India\'s 1:1456 doctor-patient ratio creates acute demand for AI diagnostics and surgical robotics, especially in Tier-2+ cities.',                              indianCompanies: ['Niramai', 'Sigtuple', 'Qure.ai'] },
  Space:          { indiaImpact: 'High',   indiaWhy: 'IN-SPACe commercialisation and 150+ space startups make India a fast-growing market — ISRO launch cadence is accelerating satellite demand.',                     indianCompanies: ['Skyroot Aerospace', 'Agnikul Cosmos', 'Pixxel'] },
  Consumer:       { indiaImpact: 'Medium', indiaWhy: 'India\'s 300M+ middle class and rising smart home adoption are opening early-stage consumer robotics demand in metro and Tier-1 markets.',                        indianCompanies: ['Milagrow Robots', 'Aqara India', 'Robosapiens India'] },
  Semiconductor:  { indiaImpact: 'High',   indiaWhy: 'India Semiconductor Mission ($10B) and Tata/Micron fab investments are building domestic chip packaging and ATMP capacity at pace.',                             indianCompanies: ['Tata Electronics', 'CG Power', 'Kaynes Technology'] },
  Manufacturing:  { indiaImpact: 'High',   indiaWhy: 'PLI schemes across 14 sectors and China+1 supply chain realignment are driving rapid cobot and industrial automation adoption in Indian factories.',              indianCompanies: ['Jyoti CNC', 'Bharat Forge', 'KUKA India'] },
  'AI & Software':{ indiaImpact: 'High',   indiaWhy: 'India\'s 5M+ developer base and 1,700+ Global Capability Centres make it the world\'s largest AI software talent and delivery hub.',                             indianCompanies: ['Persistent Systems', 'Mphasis', 'KPIT Technologies'] },
  General:        { indiaImpact: 'Medium', indiaWhy: 'India\'s Digital India mission and 3rd-largest startup ecosystem position it to rapidly absorb and commercialise emerging automation trends.',                    indianCompanies: ['Tata Consultancy Services', 'Infosys', 'Tech Mahindra'] }
};

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGIC INTELLIGENCE CONTEXT — per sector
// Fields: structural, trend, whyThisMatters, watchNext, threats, timeHorizon, narrative, narrativeCluster
// ─────────────────────────────────────────────────────────────────────────────
const VCL_MAP = {
  Agriculture: 'Software & AI', Defence: 'System Integrators', Logistics: 'Software & AI',
  Automotive: 'Manufacturers', Healthcare: 'Software & AI', Space: 'System Integrators',
  Consumer: 'Integration & Services', Semiconductor: 'Semiconductor', Manufacturing: 'Manufacturers',
  'AI & Software': 'Software & AI', General: 'Software & AI'
};

const SECTOR_CTX = {
  Agriculture: {
    structural:      { title: 'Agriculture: Software Layer Unclaimed Over Hardware',   why: 'Hardware is commoditising — AI farm management software captures recurring margin.', action: 'Back AI-native farm intelligence platforms targeting precision farming and yield optimisation.' },
    trend:           { title: 'Agriculture: Agri-Robotics Adoption Accelerating',       why: 'Government subsidies and labour shortages are driving faster agri-robot deployment.', action: 'Target agri-robotics distributors and sensor network providers in Tier-2 farm markets.' },
    whyThisMatters:  'Every 1% yield efficiency gain at scale translates to billions in avoided import costs globally. The first platform to own the agri-data layer locks in 10+ year retention — this is not a hardware story, it is a data infrastructure story.',
    watchNext:       ['cold chain automation providers', 'drone regulatory approvals for crop spraying', 'soil health SaaS adoption in emerging markets', 'precision irrigation sensor supply chains'],
    threats:         'Land fragmentation across India and Southeast Asia limits large-scale deployment ROI. Weather dependency and subsidised labour artificially suppress automation urgency in key markets.',
    timeHorizon:     { label: 'Medium-Term', type: 'medium', note: '2–5 year mainstream adoption window' },
    narrative:       'Agri-Automation Buildout',
    narrativeCluster: 'Human-Augmentation Systems'
  },
  Defence: {
    structural:      { title: 'Defence: Autonomy Spend Structurally Rising',           why: 'Defence drone and counter-drone budgets are compounding 20%+ annually across NATO and Indo-Pacific.', action: 'Evaluate autonomous defence tech startups with dual-use certification and government contracts.' },
    trend:           { title: 'Defence: Counter-Drone Systems in Demand',              why: 'Geopolitical tensions are accelerating procurement of counter-UAS and electronic warfare systems.', action: 'Focus on counter-drone software and sensor fusion companies with proven field deployment.' },
    whyThisMatters:  'Modern conflict has conclusively demonstrated that drone and counter-drone capability is now a baseline requirement — not a differentiator. Nations without autonomous defence infrastructure are structurally exposed. Budget allocation will compound regardless of peacetime pressures.',
    watchNext:       ['electronic warfare spectrum allocation', 'AI target recognition procurement cycles', 'dual-use robotics export controls', 'defence AI safety regulation timelines'],
    threats:         'Regulatory uncertainty around autonomous lethal systems could delay procurement. Export control tightening may fragment the global defence robotics supply chain. Hype cycles in defence tech can inflate valuations beyond actual contract visibility.',
    timeHorizon:     { label: 'Immediate', type: 'immediate', note: 'Active procurement cycles underway' },
    narrative:       'Defence Autonomy Acceleration',
    narrativeCluster: 'Strategic & Security Autonomy'
  },
  Logistics: {
    structural:      { title: 'Logistics: Warehouse Automation ROI Is Proven',         why: 'E-commerce growth drives 15–20% cost reduction from warehouse robotics — measurable and bankable.', action: 'Target warehouse robotics and WMS software companies with Fortune 500 pilot contracts.' },
    trend:           { title: 'Logistics: Last-Mile Robotics at Inflection Point',     why: 'Labour cost pressure and delivery density are finally making last-mile robots economically viable.', action: 'Back last-mile autonomous delivery platforms with regulatory approvals in hand.' },
    whyThisMatters:  'Logistics automation is not cyclical — it is structural. Every warehouse that automates permanently removes labour dependency. Companies that automate now lock in 30–40% cost advantages over competitors who wait. The ROI is proven and the payback period is contracting.',
    watchNext:       ['autonomous forklift safety certification timelines', 'last-mile regulatory frameworks city-by-city', 'WMS-robotics integration standards', 'dock automation and loading robot adoption'],
    threats:         'Labour union resistance in key markets could slow adoption in regulated environments. Hardware standardisation lag creates integration friction that erodes software margin. Oversupply of warehouse robotics vendors is compressing hardware pricing.',
    timeHorizon:     { label: 'Short-Term', type: 'short', note: '6–18 month active deployment window' },
    narrative:       'E-Commerce Automation Wave',
    narrativeCluster: 'Industrial Automation Wave'
  },
  Automotive: {
    structural:      { title: 'Automotive: EV Software Stack Underbuilt',              why: 'EV transition shifts value from mechanical to software — OEMs are structurally behind on software.', action: 'Back EV software stack and OTA update platform companies supplying multiple OEMs.' },
    trend:           { title: 'Automotive: AV Sensor Supply Chain Opportunity',        why: 'Autonomous vehicle programmes are scaling sensor procurement with no dominant supplier.', action: 'Invest in lidar and sensor fusion software companies with Tier-1 automotive design wins.' },
    whyThisMatters:  'The automotive software stack is now worth more than the chassis — yet most OEMs remain dependent on fragmented Tier-1 supplier ecosystems. The OEM that controls its own software layer controls margins, data, and the consumer relationship. This creates a durable platform opportunity.',
    watchNext:       ['OTA update platform adoption rates', 'lidar cost curve trajectory', 'SDV standardisation consortia', 'in-vehicle compute architecture consolidation'],
    threats:         'EV demand cycle volatility is creating capex hesitancy among OEMs. Tesla\'s vertical integration makes it difficult for pure-play software vendors to compete on the same value proposition. AV liability frameworks remain unresolved in major markets.',
    timeHorizon:     { label: 'Structural', type: 'structural', note: '3–7 year platform consolidation' },
    narrative:       'SDV Platform Consolidation',
    narrativeCluster: 'Industrial Automation Wave'
  },
  Healthcare: {
    structural:      { title: 'Healthcare: Surgical Robotics Margins Compounding',     why: 'Surgical robotics command 70%+ gross margins with 10-year hospital lock-in contracts.', action: 'Focus on minimally invasive surgical robotics with CE/FDA clearance and recurring consumables.' },
    trend:           { title: 'Healthcare: AI Diagnostics Replacing Manual Reads',     why: 'AI radiology and pathology tools are achieving specialist-level accuracy at 10% of cost.', action: 'Back AI diagnostic platforms with peer-reviewed validation and payer reimbursement pathways.' },
    whyThisMatters:  'AI diagnostics do not just augment clinicians — they structurally alter the economics of healthcare delivery. At scale, AI pathology and radiology reduce diagnostic cost by 60–80%, enabling healthcare systems to address chronic physician shortages without expanding headcount.',
    watchNext:       ['FDA clearance pipeline for AI diagnostic tools', 'payer reimbursement code expansion', 'surgical robot training hospital partnerships', 'remote robotic surgery 5G infrastructure'],
    threats:         'Regulatory approval timelines for AI diagnostics remain 24–36 months in most jurisdictions. Liability frameworks for AI-assisted diagnosis are unresolved. Hospital capex cycles are long and resistant to rapid technology replacement.',
    timeHorizon:     { label: 'Medium-Term', type: 'medium', note: '2–4 year regulatory and adoption cycle' },
    narrative:       'AI-Augmented Care Delivery',
    narrativeCluster: 'Human-Augmentation Systems'
  },
  Space: {
    structural:      { title: 'Space: Systems Integration Layer Structurally Absent',  why: 'Commercial launches growing past 100/year with zero multi-mission orchestration infrastructure.', action: 'Invest in mission control and systems integration software for commercial space robotics.' },
    trend:           { title: 'Space: On-Orbit Servicing Demand Emerging',             why: 'Satellite fleet operators need refuelling and repair services as orbital congestion grows.', action: 'Back on-orbit servicing startups with anchor contracts from satellite fleet operators.' },
    whyThisMatters:  'Orbital infrastructure is the next utility layer. Satellites underpin GPS, communications, financial clearing, weather and defence — yet no servicing ecosystem exists. The first credible on-orbit servicing platform creates infrastructure-level lock-in with zero competitive substitutes.',
    watchNext:       ['ITU spectrum allocation decisions', 'debris removal regulation enforcement', 'in-space manufacturing commercial pilots', 'lunar logistics contract awards'],
    threats:         'Kessler Syndrome risk from debris proliferation could trigger regulatory moratoria on launches. Geopolitical fragmentation of space access is creating parallel ecosystems that fragment addressable markets. Capital intensity is extreme with long payback periods.',
    timeHorizon:     { label: 'Long-Term Secular', type: 'secular', note: '7–15 year infrastructure buildout' },
    narrative:       'Commercial Space Infrastructure',
    narrativeCluster: 'Strategic & Security Autonomy'
  },
  Consumer: {
    structural:      { title: 'Consumer: Home Robots Crossing Mass-Market Threshold',  why: 'Price-performance of home robots has hit the consumer adoption curve tipping point.', action: 'Target consumer robotics platforms with app ecosystems and subscription revenue models.' },
    trend:           { title: 'Consumer: AI Agents Entering Daily Workflows',          why: 'AI assistants are moving from chat to task execution — sticky engagement and high LTV.', action: 'Back AI agent platforms with workflow integrations and demonstrated retention metrics.' },
    whyThisMatters:  'Consumer robotics is approaching the smartphone moment — where hardware becomes the access device for a recurring software and services revenue stream. The platform that wins home robot adoption controls ambient data, AI personalisation, and a defensible subscription moat.',
    watchNext:       ['humanoid robot commercial pricing benchmarks', 'home robot insurance product launches', 'AI agent enterprise vs consumer revenue split', 'ambient computing regulatory frameworks'],
    threats:         'Consumer privacy regulation could restrict the data collection models that make home robots economically viable. Hype cycles in humanoid robotics are attracting speculative capital without near-term revenue visibility. Distribution and after-sales service remain unsolved at scale.',
    timeHorizon:     { label: 'Short-Term', type: 'short', note: '1–3 year early adoption curve' },
    narrative:       'Consumer Robotics Platform Race',
    narrativeCluster: 'Human-Augmentation Systems'
  },
  Semiconductor: {
    structural:      { title: 'Semiconductor: AI Chip Demand Structurally Undersupplied', why: 'AI inference demand is growing 10× faster than fab capacity additions.', action: 'Invest in AI chip designers and advanced packaging companies with hyperscaler supply agreements.' },
    trend:           { title: 'Semiconductor: Edge AI Chips Opening New Markets',      why: 'On-device AI processing removes cloud dependency — enabling robotics in connectivity-poor environments.', action: 'Back edge AI semiconductor companies targeting robotics, automotive and industrial IoT.' },
    whyThisMatters:  'AI chip undersupply is not a 2-year problem — it is structural. Advanced packaging and DRAM bandwidth have become the binding constraint for AI compute scaling. Companies that control advanced packaging capacity and HBM supply chains hold disproportionate pricing power for 12–18 months minimum.',
    watchNext:       ['advanced packaging capacity additions at OSAT players', 'HBM supply contract announcements', 'CHIPS Act subsidy deployment timelines', 'AI chip export control expansion'],
    threats:         'US-China tech decoupling is fragmenting the global semiconductor supply chain in ways that increase costs and reduce scale economies. NVIDIA\'s dominance in AI training creates a winner-take-most dynamic that limits TAM for challengers. Geopolitical risk around Taiwan fab concentration remains the single largest systemic risk.',
    timeHorizon:     { label: 'Structural', type: 'structural', note: '3–7 year supply-demand rebalancing' },
    narrative:       'AI Compute Infrastructure Bottleneck',
    narrativeCluster: 'AI Compute Infrastructure'
  },
  Manufacturing: {
    structural:      { title: 'Manufacturing: Cobot Penetration Still Under 5%',       why: 'Only 5% of global manufacturing tasks are automated — runway is enormous at current adoption rates.', action: 'Target cobot and flexible automation platform companies with SME-focused pricing models.' },
    trend:           { title: 'Manufacturing: AI Quality Control Replacing Vision Systems', why: 'AI-powered defect detection outperforms traditional machine vision at a fraction of integration cost.', action: 'Back AI quality inspection platforms with proven production line deployments and quick payback.' },
    whyThisMatters:  'Manufacturing automation is at an inflection point driven by converging forces: China+1 reshoring, labour cost inflation, and cobot price-performance breakthroughs. The companies that deploy automation infrastructure now will achieve 30–40% structural cost advantages that are nearly impossible to close post-deployment.',
    watchNext:       ['China+1 supply chain relocation capex commitments', 'cobot leasing model adoption rates', 'industrial AI quality inspection contract pipeline', 'digital twin factory deployment timelines'],
    threats:         'Reshoring narratives can reverse with commodity cycle turns. SME capex constraints limit adoption pace outside enterprise accounts. Integration complexity and skilled technician shortages create deployment bottlenecks that erode headline ROI claims.',
    timeHorizon:     { label: 'Structural', type: 'structural', note: '3–7 year reshoring and automation cycle' },
    narrative:       'Industrial Automation Wave',
    narrativeCluster: 'Industrial Automation Wave'
  },
  'AI & Software': {
    structural:      { title: 'AI Platforms: Horizontal Automation Stack Emerging',    why: 'Foundation models are enabling cross-industry automation platforms with winner-take-most dynamics.', action: 'Back horizontal AI automation platforms with strong developer ecosystems and API revenue.' },
    trend:           { title: 'AI Agents: Autonomous Task Execution Going Mainstream', why: 'AI agents are moving from demos to production — enterprise spend on agentic workflows is accelerating.', action: 'Invest in enterprise AI agent platforms with measurable productivity gains and Fortune 500 pilots.' },
    whyThisMatters:  'Foundation models have compressed the cost of intelligence by orders of magnitude. This creates a platform opportunity analogous to cloud infrastructure — horizontal enabling layers that capture value across every vertical simultaneously. The winner in agentic workflow infrastructure will be the AWS of the intelligence economy.',
    watchNext:       ['enterprise AI agent contract TCV disclosure', 'foundation model inference cost curve', 'AI regulation in the EU and India', 'sovereign AI infrastructure procurement'],
    threats:         'Rapid commoditisation of foundation model capabilities is eroding moats for pure-play LLM companies. Open-source models are compressing the willingness-to-pay for proprietary AI. Regulatory uncertainty around AI liability and data provenance is creating enterprise adoption hesitancy.',
    timeHorizon:     { label: 'Immediate', type: 'immediate', note: 'Active enterprise deployment now' },
    narrative:       'Agentic AI Infrastructure Race',
    narrativeCluster: 'AI Compute Infrastructure'
  },
  General: {
    structural:      { title: 'Cross-Sector: AI Automation Convergence Signal',        why: 'Multiple industries simultaneously adopting AI automation signals a platform-level shift in progress.', action: 'Identify cross-sector AI automation infrastructure plays with horizontal applicability.' },
    trend:           { title: 'General: Automation Adoption Accelerating This Cycle',  why: 'Volume of automation news signals market is past early adopter phase and entering mainstream deployment.', action: 'Look for automation enablement platforms — integration tools, training data and workflow APIs.' },
    whyThisMatters:  'Simultaneous acceleration across multiple sectors is not coincidence — it signals platform-level infrastructure maturity. When agriculture, defence, logistics and healthcare all move at once, the enabling layers (compute, sensors, connectivity, software) become the real opportunity.',
    watchNext:       ['cross-sector AI infrastructure procurement', 'edge computing deployment timelines', 'automation skills gap training market', 'regulation convergence across sectors'],
    threats:         'Broad market narratives can mask individual sector divergence. Cross-sector generalisation dilutes capital allocation precision. Macro rate environment continues to compress multiples for long-duration automation bets.',
    timeHorizon:     { label: 'Structural', type: 'structural', note: 'Multi-year platform adoption cycle' },
    narrative:       'Cross-Sector Automation Convergence',
    narrativeCluster: 'Industrial Automation Wave'
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// NARRATIVE CLUSTERS — thematic groupings of sectors
// ─────────────────────────────────────────────────────────────────────────────
const NARRATIVE_CLUSTERS = {
  'AI Compute Infrastructure': {
    sectors:     ['Semiconductor', 'AI & Software'],
    description: 'AI inference demand is structurally outpacing compute supply. Advanced packaging, memory bandwidth, and edge silicon are becoming the binding constraints of the intelligence economy.',
    signal:      'invest',
    momentum:    'high'
  },
  'Industrial Automation Wave': {
    sectors:     ['Manufacturing', 'Logistics', 'Automotive', 'General'],
    description: 'Converging labour economics, reshoring policy and robotics price-performance are driving the broadest industrial automation cycle in history. China+1, PLI schemes and e-commerce density are simultaneous accelerants.',
    signal:      'invest',
    momentum:    'high'
  },
  'Strategic & Security Autonomy': {
    sectors:     ['Defence', 'Space'],
    description: 'Geopolitical fragmentation is permanently structuring autonomous defence and space infrastructure into national security budgets. Procurement cycles are accelerating and are largely insensitive to macro conditions.',
    signal:      'invest',
    momentum:    'high'
  },
  'Human-Augmentation Systems': {
    sectors:     ['Healthcare', 'Consumer', 'Agriculture'],
    description: 'Robotics and AI are entering intimate human domains — caregiving, food production and the home. Adoption is slower but lock-in is deep. The platform opportunity emerges once data flywheels activate.',
    signal:      'watch',
    momentum:    'medium'
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPANY → TICKER MAP — global robotics / AI / semiconductor companies
// ─────────────────────────────────────────────────────────────────────────────
const COMPANY_TICKER_MAP = [
  // Semiconductor
  { aliases: ['nvidia'],                             ticker: 'NVDA',         name: 'NVIDIA'             },
  { aliases: ['amd', 'advanced micro devices'],      ticker: 'AMD',          name: 'AMD'                },
  { aliases: ['intel'],                              ticker: 'INTC',         name: 'Intel'              },
  { aliases: ['tsmc', 'taiwan semiconductor'],       ticker: 'TSM',          name: 'TSMC'               },
  { aliases: ['asml'],                               ticker: 'ASML',         name: 'ASML'               },
  { aliases: ['qualcomm'],                           ticker: 'QCOM',         name: 'Qualcomm'           },
  { aliases: ['broadcom'],                           ticker: 'AVGO',         name: 'Broadcom'           },
  { aliases: ['micron'],                             ticker: 'MU',           name: 'Micron'             },
  { aliases: ['arm holdings', 'arm chips', 'arm ipo'], ticker: 'ARM',        name: 'Arm Holdings'       },
  { aliases: ['marvell'],                            ticker: 'MRVL',         name: 'Marvell'            },
  { aliases: ['tokyo electron', ' tel '],            ticker: '8035.T',       name: 'Tokyo Electron'     },
  { aliases: ['renesas'],                            ticker: '6723.T',       name: 'Renesas'            },
  { aliases: ['samsung'],                            ticker: '005930.KS',    name: 'Samsung'            },
  { aliases: ['sk hynix', 'hynix'],                  ticker: '000660.KS',    name: 'SK Hynix'           },
  { aliases: ['lam research'],                       ticker: 'LRCX',         name: 'Lam Research'       },
  { aliases: ['applied materials'],                  ticker: 'AMAT',         name: 'Applied Materials'  },
  { aliases: ['kla corporation', ' kla '],           ticker: 'KLAC',         name: 'KLA'                },
  // AI & Software
  { aliases: ['microsoft'],                          ticker: 'MSFT',         name: 'Microsoft'          },
  { aliases: ['alphabet', 'google', 'deepmind'],     ticker: 'GOOGL',        name: 'Alphabet'           },
  { aliases: ['meta', 'facebook'],                   ticker: 'META',         name: 'Meta'               },
  { aliases: ['palantir'],                           ticker: 'PLTR',         name: 'Palantir'           },
  { aliases: ['uipath'],                             ticker: 'PATH',         name: 'UiPath'             },
  { aliases: ['c3.ai', 'c3 ai'],                     ticker: 'AI',           name: 'C3.ai'              },
  { aliases: ['servicenow'],                         ticker: 'NOW',          name: 'ServiceNow'         },
  { aliases: ['salesforce'],                         ticker: 'CRM',          name: 'Salesforce'         },
  { aliases: ['snowflake'],                          ticker: 'SNOW',         name: 'Snowflake'          },
  { aliases: ['oracle'],                             ticker: 'ORCL',         name: 'Oracle'             },
  // Manufacturing / Industrial
  { aliases: ['fanuc'],                              ticker: '6954.T',       name: 'Fanuc'              },
  { aliases: ['yaskawa'],                            ticker: '6506.T',       name: 'Yaskawa'            },
  { aliases: ['keyence'],                            ticker: '6861.T',       name: 'Keyence'            },
  { aliases: [' abb '],                              ticker: 'ABB',          name: 'ABB'                },
  { aliases: ['rockwell automation', 'rockwell'],    ticker: 'ROK',          name: 'Rockwell Automation'},
  { aliases: ['cognex'],                             ticker: 'CGNX',         name: 'Cognex'             },
  { aliases: ['zebra technologies', 'zebra tech'],   ticker: 'ZBRA',         name: 'Zebra Technologies' },
  { aliases: ['siemens'],                            ticker: 'SIE.DE',       name: 'Siemens'            },
  { aliases: ['mitsubishi electric'],                ticker: '6503.T',       name: 'Mitsubishi Electric'},
  { aliases: ['omron'],                              ticker: '6645.T',       name: 'Omron'              },
  { aliases: ['emerson electric', 'emerson'],        ticker: 'EMR',          name: 'Emerson Electric'   },
  { aliases: ['parker hannifin'],                    ticker: 'PH',           name: 'Parker Hannifin'    },
  // Logistics
  { aliases: ['honeywell'],                          ticker: 'HON',          name: 'Honeywell'          },
  { aliases: ['kion'],                               ticker: 'KGX.DE',       name: 'KION Group'         },
  { aliases: ['symbotic'],                           ticker: 'SYM',          name: 'Symbotic'           },
  { aliases: ['autostore'],                          ticker: 'AUTO.OL',      name: 'Autostore'          },
  { aliases: ['manhattan associates'],               ticker: 'MANH',         name: 'Manhattan Associates'},
  // Automotive
  { aliases: ['tesla'],                              ticker: 'TSLA',         name: 'Tesla'              },
  { aliases: ['mobileye'],                           ticker: 'MBLY',         name: 'Mobileye'           },
  { aliases: ['aptiv'],                              ticker: 'APTV',         name: 'Aptiv'              },
  { aliases: ['luminar'],                            ticker: 'LAZR',         name: 'Luminar'            },
  { aliases: ['ouster', 'velodyne lidar'],           ticker: 'OUST',         name: 'Ouster'             },
  { aliases: ['toyota'],                             ticker: '7203.T',       name: 'Toyota'             },
  { aliases: ['hyundai'],                            ticker: '005380.KS',    name: 'Hyundai'            },
  { aliases: [' byd '],                              ticker: 'BYDDY',        name: 'BYD'                },
  { aliases: [' nio '],                              ticker: 'NIO',          name: 'NIO'                },
  { aliases: ['aurora innovation'],                  ticker: 'AUR',          name: 'Aurora Innovation'  },
  // Defence
  { aliases: ['lockheed martin', 'lockheed'],        ticker: 'LMT',          name: 'Lockheed Martin'    },
  { aliases: ['raytheon', ' rtx '],                  ticker: 'RTX',          name: 'Raytheon'           },
  { aliases: ['northrop grumman', 'northrop'],       ticker: 'NOC',          name: 'Northrop Grumman'   },
  { aliases: ['l3harris'],                           ticker: 'LHX',          name: 'L3Harris'           },
  { aliases: ['aerovironment'],                      ticker: 'AVAV',         name: 'AeroVironment'      },
  { aliases: ['kratos defense', 'kratos'],           ticker: 'KTOS',         name: 'Kratos Defense'     },
  { aliases: ['textron'],                            ticker: 'TXT',          name: 'Textron'            },
  { aliases: ['ideaforge'],                          ticker: 'IDEAFORGE.NS', name: 'ideaForge'          },
  // Healthcare
  { aliases: ['intuitive surgical', 'intuitive'],    ticker: 'ISRG',         name: 'Intuitive Surgical' },
  { aliases: ['stryker'],                            ticker: 'SYK',          name: 'Stryker'            },
  { aliases: ['medtronic'],                          ticker: 'MDT',          name: 'Medtronic'          },
  { aliases: ['dexcom'],                             ticker: 'DXCM',         name: 'DexCom'             },
  // Space
  { aliases: ['planet labs', ' planet '],            ticker: 'PL',           name: 'Planet Labs'        },
  { aliases: ['rocket lab', 'rocketlab'],            ticker: 'RKLB',         name: 'Rocket Lab'         },
  { aliases: ['iridium'],                            ticker: 'IRDM',         name: 'Iridium'            },
  { aliases: ['spire global'],                       ticker: 'SPIR',         name: 'Spire Global'       },
  // Agriculture
  { aliases: ['john deere', 'deere'],                ticker: 'DE',           name: 'John Deere'         },
  { aliases: ['cnh industrial', ' cnh '],            ticker: 'CNHI',         name: 'CNH Industrial'     },
  { aliases: ['trimble'],                            ticker: 'TRMB',         name: 'Trimble'            },
  { aliases: [' agco '],                             ticker: 'AGCO',         name: 'AGCO'               },
];

// Sector fallback tickers — used when no company is named in article text
const SECTOR_FALLBACK_TICKERS = {
  'AI & Software':  ['NVDA', 'MSFT', 'GOOGL'],
  'Semiconductor':  ['NVDA', 'TSM', 'ASML'],
  'Manufacturing':  ['6954.T', 'ROK', 'ABB'],
  'Logistics':      ['HON', 'ZBRA', 'SYM'],
  'Automotive':     ['TSLA', 'MBLY', 'APTV'],
  'Defence':        ['LMT', 'RTX', 'NOC'],
  'Healthcare':     ['ISRG', 'SYK', 'MDT'],
  'Space':          ['RKLB', 'PL', 'IRDM'],
  'Agriculture':    ['DE', 'TRMB', 'AGCO'],
  'Consumer':       ['NVDA', 'MSFT', '005930.KS'],
  'General':        ['NVDA', 'MSFT', 'ROK'],
};

function extractTickersFromText(text) {
  const t = ' ' + text.toLowerCase() + ' ';   // pad so word-boundary aliases work
  const found = [];
  for (const company of COMPANY_TICKER_MAP) {
    for (const alias of company.aliases) {
      if (t.includes(alias)) { found.push(company.ticker); break; }
    }
  }
  return [...new Set(found)];
}

function getSectorTickers(sector, text) {
  const extracted = extractTickersFromText(text);
  if (extracted.length > 0) return extracted.slice(0, 5);
  return (SECTOR_FALLBACK_TICKERS[sector] || SECTOR_FALLBACK_TICKERS.General).slice(0, 3);
}

// ─────────────────────────────────────────────────────────────────────────────
// YAHOO FINANCE — unofficial chart API, no key required (Node 20 native fetch)
// ─────────────────────────────────────────────────────────────────────────────
async function fetchStockData(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=35d`;
    const res = await fetch(url, {
      signal:  AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept':     'application/json'
      }
    });
    if (!res.ok) throw new Error(`Yahoo ${res.status}`);
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('Empty Yahoo result');

    const meta       = result.meta;
    const timestamps = result.timestamp || [];
    const closes     = result.indicators?.quote?.[0]?.close || [];
    const current    = meta.regularMarketPrice;
    const currency   = meta.currency || 'USD';

    // Scan backwards to find the last close at or before 7d/30d ago
    const now = Date.now() / 1000;
    let price7d = null, price30d = null;
    for (let i = timestamps.length - 1; i >= 0; i--) {
      const close = closes[i];
      if (!close) continue;
      if (price7d  === null && timestamps[i] <= now - 7  * 86400) price7d  = close;
      if (price30d === null && timestamps[i] <= now - 30 * 86400) price30d = close;
    }

    return {
      ticker,
      name:      meta.shortName || meta.longName || ticker,
      price:     current,
      currency,
      change7d:  price7d  && current ? +((current - price7d)  / price7d  * 100).toFixed(2) : null,
      change30d: price30d && current ? +((current - price30d) / price30d * 100).toFixed(2) : null,
      exchange:  meta.exchangeName || meta.exchange || '',
      updatedAt: Date.now()
    };
  } catch (e) {
    console.error(`  ✗ Stock ${ticker}: ${e.message}`);
    return { ticker, price: null, error: e.message };
  }
}

async function fetchMultipleStocks(tickers) {
  const results = await Promise.all(tickers.map(t => fetchStockData(t)));
  return results.reduce((acc, r) => { acc[r.ticker] = r; return acc; }, {});
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL HISTORY — in-memory snapshots (MongoDB Atlas will persist in Phase 2)
// ─────────────────────────────────────────────────────────────────────────────
let signalHistory = [];  // newest first, max 30 snapshots

async function captureSignalSnapshot(insights) {
  if (!insights || insights.length === 0) return;

  // Unique tickers across all insights (cap at 15 to limit API calls)
  const allTickers = [...new Set(insights.flatMap(i => i.relevantTickers || []))].slice(0, 15);

  let capturedPrices = {};
  if (allTickers.length > 0) {
    try {
      console.log(`  → Capturing baseline prices for ${allTickers.length} global stocks…`);
      capturedPrices = await fetchMultipleStocks(allTickers);
      const ok = Object.values(capturedPrices).filter(p => p.price).length;
      console.log(`  ✓ Stock baseline captured: ${ok}/${allTickers.length} tickers`);
    } catch (e) {
      console.error('  ✗ Stock capture failed:', e.message);
    }
  }

  const snapshot = {
    snapshotId:   Date.now(),
    capturedAt:   Date.now(),
    articleCount: (cache.articles || []).length,
    signals: insights.map(i => ({
      sector:     i.sector,
      title:      i.title,
      tag:        i.tag,
      confidence: i.confidenceScore,
      momentum:   i.momentum,
      tickers:    i.relevantTickers || [],
      prices:     Object.fromEntries(
        (i.relevantTickers || [])
          .filter(t => capturedPrices[t]?.price)
          .map(t => [t, {
            price:    capturedPrices[t].price,
            currency: capturedPrices[t].currency || 'USD',
            name:     capturedPrices[t].name     || t
          }])
      )
    }))
  };

  // ── Persist to MongoDB Atlas ──────────────────────────────────────────────
  if (mongoDb) {
    try {
      await mongoDb.collection('signalHistory').insertOne({
        ...snapshot,
        capturedAt: new Date(snapshot.capturedAt)   // store as BSON Date for TTL index
      });
      console.log('  ✓ Snapshot saved to MongoDB Atlas');
    } catch (e) {
      console.error('  ✗ MongoDB save failed:', e.message, '— snapshot kept in memory');
    }
  }

  // ── Keep in-memory list (newest first, max 30) ────────────────────────────
  signalHistory.unshift(snapshot);
  if (signalHistory.length > 30) signalHistory = signalHistory.slice(0, 30);
  console.log(`  ✓ Signal snapshot #${signalHistory.length} saved (${snapshot.signals.length} signals)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// WEAK SIGNAL DETECTION KEYWORDS
// ─────────────────────────────────────────────────────────────────────────────
const WEAK_SIGNAL_PATTERNS = [
  { pattern: /patent|filing|ip.portfolio|granted.patent/,               label: 'Patent Activity',        type: 'ip' },
  { pattern: /seed.fund|pre.series|angel.invest|stealth|incubat/,       label: 'Early-Stage Funding',    type: 'funding' },
  { pattern: /shortage|bottleneck|supply.crunch|component.scarc/,       label: 'Supply Constraint',      type: 'supply' },
  { pattern: /academic|university|research.grant|phd|lab.develop/,      label: 'Research Signal',        type: 'research' },
  { pattern: /hiring|talent.shortage|engineer.demand|recruit/,          label: 'Talent Signal',          type: 'talent' },
  { pattern: /regulatory.draft|policy.consult|legislation.propos/,      label: 'Regulatory Pre-Signal',  type: 'regulatory' },
  { pattern: /pilot.program|prototype|proof.of.concept|early.trial/,    label: 'Prototype Stage',        type: 'prototype' },
  { pattern: /executive.*appoint|cto.*join|vp.*robotics|chief.*robot/,  label: 'Leadership Signal',      type: 'leadership' },
];

// ─────────────────────────────────────────────────────────────────────────────
// CONFIDENCE SCORING — 0–100 evidence-weighted
// ─────────────────────────────────────────────────────────────────────────────
function calcConfidenceScore(count, sourceCount, momentum, tag) {
  let score = 0;
  score += Math.min(count * 7, 35);          // article count: up to 35
  score += Math.min(sourceCount * 12, 36);   // source diversity: up to 36 (3 diverse sources = 36)
  score += momentum === 'high' ? 20 : momentum === 'medium' ? 12 : 5;  // momentum
  score += tag === 'invest' ? 9 : tag === 'watch' ? 5 : 3;             // signal strength
  return Math.min(Math.max(Math.round(score), 8), 97);
}

function confidenceLabel(score) {
  if (score >= 75) return 'Very High';
  if (score >= 55) return 'High';
  if (score >= 35) return 'Medium';
  return 'Low';
}

// ─────────────────────────────────────────────────────────────────────────────
// INTELLIGENCE PRIORITY SCORES — 0–100 per dimension
// ─────────────────────────────────────────────────────────────────────────────
const SECTOR_STRATEGIC_BASE = {
  Semiconductor: 95, 'AI & Software': 92, Defence: 90, Manufacturing: 82,
  Logistics: 78, Automotive: 75, Healthcare: 72, Space: 70,
  Agriculture: 65, Consumer: 60, General: 50
};
const INDIA_RELEVANCE_BASE = {
  Defence: 95, Semiconductor: 92, Manufacturing: 90, Logistics: 88, 'AI & Software': 85,
  Space: 82, Automotive: 78, Agriculture: 75, Healthcare: 70, Consumer: 58, General: 55
};

function calcPriorityScores(sector, count, momentum, tag, text) {
  const base     = SECTOR_STRATEGIC_BASE[sector]  || 50;
  const indBase  = INDIA_RELEVANCE_BASE[sector]   || 50;
  const momBoost = momentum === 'high' ? 8 : momentum === 'medium' ? 4 : 0;
  const tagBoost = tag === 'invest' ? 6 : tag === 'watch' ? 3 : 0;
  const countAdj = Math.min(count * 2, 10);

  const saturationKeywords = /commodit|too many|margin pressure|legacy|decline|overinvest|crowded|bubble/;
  const saturationRisk = saturationKeywords.test(text)
    ? Math.min(80, 30 + count * 8)
    : tag === 'saturated' ? 70
    : tag === 'invest' && count >= 8 ? 40
    : Math.max(10, 30 - count * 3);

  return {
    strategicScore:   Math.min(Math.round(base + momBoost + countAdj), 99),
    indiaScore:       Math.min(Math.round(indBase + tagBoost + countAdj), 99),
    investmentScore:  Math.min(Math.round(calcConfidenceScore(count, 3, momentum, tag) * 0.9 + tagBoost * 2), 99),
    saturationRisk:   Math.round(saturationRisk)
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TIME HORIZON — 5-level system
// ─────────────────────────────────────────────────────────────────────────────
function deriveTimeHorizon(text, sector) {
  const ctx = SECTOR_CTX[sector] || SECTOR_CTX.General;
  // Article text can override sector default for current cycle
  if (/launch|deploy|announc|signed|awarded|today|this week|just released|unveiled|now/.test(text))
    return { label: 'Immediate', type: 'immediate', note: '0–3 months' };
  if (/next.quarter|q[1-4]|within.months|this.year|6.month|12.month|near.term/.test(text))
    return { label: 'Short-Term', type: 'short', note: '3–12 months' };
  if (/next.year|2026|2027|medium.term|3.year|roadmap/.test(text))
    return { label: 'Medium-Term', type: 'medium', note: '1–3 years' };
  if (/2028|2029|2030|structural|fundamental|decade/.test(text))
    return { label: 'Structural', type: 'structural', note: '3–7 years' };
  // Fall back to sector default
  return ctx.timeHorizon || { label: 'Structural', type: 'structural', note: '3–7 years' };
}

// ─────────────────────────────────────────────────────────────────────────────
// SIGNAL EVOLUTION MEMORY — track changes across refresh cycles
// ─────────────────────────────────────────────────────────────────────────────
function updateSignalMemory(sector, signalType, tag, confidenceScore, momentum, articleCount) {
  const key = `${sector}-${signalType}`;
  const now = Date.now();
  const snap = { ts: now, tag, confidenceScore, momentum, articleCount };

  if (!signalMemory[key]) {
    signalMemory[key] = { firstSeen: now, history: [snap] };
  } else {
    signalMemory[key].history.push(snap);
    // Keep last 20 snapshots
    if (signalMemory[key].history.length > 20) {
      signalMemory[key].history = signalMemory[key].history.slice(-20);
    }
  }
  return signalMemory[key];
}

function getEvolution(sector, signalType, currentTag, currentScore) {
  const key     = `${sector}-${signalType}`;
  const mem     = signalMemory[key];
  if (!mem || mem.history.length < 2) return null;

  const history    = mem.history;
  const prev       = history[history.length - 2];
  const first      = history[0];
  const ageHours   = Math.round((Date.now() - mem.firstSeen) / 3600000);
  const ageDays    = Math.round(ageHours / 24);
  const tagChanged = prev.tag !== currentTag;
  const scoreDelta = currentScore - prev.confidenceScore;
  const countDelta = history[history.length - 1].articleCount - prev.articleCount;

  return {
    firstSeen:   mem.firstSeen,
    ageHours,
    ageDays:     ageDays || 0,
    prevTag:     prev.tag,
    currentTag,
    tagChanged,
    scoreDelta:  Math.round(scoreDelta),
    countDelta,
    trend:       scoreDelta >= 5 ? 'accelerating' : scoreDelta <= -5 ? 'weakening' : 'stable',
    cycles:      history.length
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// WEAK SIGNAL DETECTOR
// ─────────────────────────────────────────────────────────────────────────────
function detectWeakSignals(articles) {
  const weakArticles = [];
  articles.forEach(a => {
    const text = (a.title + ' ' + (a.summary || '')).toLowerCase();
    for (const wp of WEAK_SIGNAL_PATTERNS) {
      if (wp.pattern.test(text)) {
        weakArticles.push({ ...a, weakType: wp.type, weakLabel: wp.label });
        break;
      }
    }
  });

  // Group by sector
  const byIndustry = {};
  weakArticles.forEach(a => {
    if (!byIndustry[a.industry]) byIndustry[a.industry] = [];
    byIndustry[a.industry].push(a);
  });

  const signals = [];
  for (const [sector, arts] of Object.entries(byIndustry)) {
    const types   = [...new Set(arts.map(a => a.weakLabel))];
    const topArt  = arts[0];
    const ctx     = SECTOR_CTX[sector] || SECTOR_CTX.General;
    const india   = INDIA_CTX[sector]  || INDIA_CTX.General;
    signals.push({
      type:        'weak',
      sector,
      signalTypes: types,
      title:       `${sector}: Early Reconnaissance Signal`,
      description: `${types.join(', ')} detected across ${arts.length} source${arts.length > 1 ? 's' : ''} — below mainstream momentum threshold.`,
      headline:    topArt.title.slice(0, 100),
      source:      topArt.source,
      confidence:  'Low',
      confidenceScore: Math.min(15 + arts.length * 5, 35),
      narrative:   ctx.narrative || sector,
      indiaImpact: india.indiaImpact,
      watchNext:   (ctx.watchNext || []).slice(0, 2)
    });
  }
  return signals;
}

// ─────────────────────────────────────────────────────────────────────────────
// NARRATIVE CLUSTER BUILDER
// ─────────────────────────────────────────────────────────────────────────────
function buildNarrativeClusters(insights) {
  const activeSectors = new Set(insights.map(i => i.sector));
  const result = [];

  for (const [clusterName, cluster] of Object.entries(NARRATIVE_CLUSTERS)) {
    const activeClusSectors = cluster.sectors.filter(s => activeSectors.has(s));
    if (activeClusSectors.length === 0) continue;

    const clusterInsights = insights.filter(i => activeClusSectors.includes(i.sector));
    const avgConf = clusterInsights.length
      ? Math.round(clusterInsights.reduce((s, i) => s + (i.confidenceScore || 50), 0) / clusterInsights.length)
      : 50;
    const investCount = clusterInsights.filter(i => i.tag === 'invest').length;
    const totalCount  = clusterInsights.reduce((s, i) => s + (i.articleCount || 1), 0);
    const narrativeStrength = investCount >= activeClusSectors.length ? 'Strong'
      : investCount > 0 ? 'Building'
      : 'Emerging';

    result.push({
      name:             clusterName,
      description:      cluster.description,
      activeSectors:    activeClusSectors,
      totalSectors:     cluster.sectors.length,
      signal:           cluster.signal,
      momentum:         totalCount >= 10 ? 'high' : totalCount >= 4 ? 'medium' : 'low',
      confidenceScore:  avgConf,
      narrativeStrength,
      investSignals:    investCount,
      totalSignals:     clusterInsights.length
    });
  }

  return result.sort((a, b) => b.confidenceScore - a.confidenceScore);
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE INSIGHT BUILDER — 2 per sector + full strategic intelligence fields
// ─────────────────────────────────────────────────────────────────────────────
function deriveTag(text, count) {
  if (/\bfund|\binvest|deal signed|contract award|billion|\bmillion|raise|ipo|acqui|partner/.test(text)) return 'invest';
  if (/saturated|too many|margin pressure|commodit|legacy player|decline/.test(text))                    return 'saturated';
  return count >= 3 ? 'invest' : 'watch';
}

function buildInsightsLocally(articles) {
  const sectors = {};
  articles.forEach(a => {
    if (!sectors[a.industry]) sectors[a.industry] = [];
    sectors[a.industry].push(a);
  });

  const insights = [];

  for (const [sector, arts] of Object.entries(sectors)) {
    const count       = arts.length;
    const text        = arts.map(a => (a.title + ' ' + (a.summary || ''))).join(' ').toLowerCase();
    const sources     = [...new Set(arts.map(a => a.source))];
    const sourceCount = sources.length;
    const topArt      = arts[0];
    const secArt      = arts[1] || arts[0];
    const ctx         = SECTOR_CTX[sector] || SECTOR_CTX.General;
    const india       = INDIA_CTX[sector]  || INDIA_CTX.General;

    const tag            = deriveTag(text, count);
    const momentum       = count >= 5 ? 'high' : count >= 2 ? 'medium' : 'low';
    const timeHorizon    = deriveTimeHorizon(text, sector);
    const confScore      = calcConfidenceScore(count, sourceCount, momentum, tag);
    const confLabel      = confidenceLabel(confScore);
    const priority       = calcPriorityScores(sector, count, momentum, tag, text);
    const vcl            = VCL_MAP[sector] || 'Software & AI';

    // ── Insight 1 — Structural gap / opportunity ───────────────────────────
    const mem1 = updateSignalMemory(sector, 'structural', tag, confScore, momentum, count);
    const evo1 = getEvolution(sector, 'structural', tag, confScore);

    insights.push({
      tag,
      title:           ctx.structural.title,
      sector,
      vcl,
      narrativeCluster: ctx.narrativeCluster,
      narrative:       ctx.narrative,
      what:            `${count} signal${count > 1 ? 's' : ''} this cycle — top story: "${topArt.title.slice(0, 85)}"`,
      why:             ctx.structural.why,
      whyMatters:      `${count} corroborating source${count > 1 ? 's' : ''} confirm ${momentum} momentum in ${sector} — structural gap remains open.`,
      whyThisMatters:  ctx.whyThisMatters,
      action:          ctx.structural.action,
      watchNext:       ctx.watchNext || [],
      threats:         ctx.threats,
      // Confidence
      confidence:      confLabel,
      confidenceScore: confScore,
      // Time horizon
      timeSensitivity: timeHorizon.label,
      timeHorizon,
      // Momentum
      momentum,
      articleCount:    count,
      // Data
      dataBasis:       `${count} article${count > 1 ? 's' : ''} from ${sources.slice(0, 3).join(', ')}.`,
      // Priority scores
      ...priority,
      // India
      indiaImpact:      india.indiaImpact,
      indiaWhy:         india.indiaWhy,
      indianCompanies:  india.indianCompanies,
      // Global stock tickers relevant to this signal
      relevantTickers:  getSectorTickers(sector, text),
      // Evolution
      evolution:       evo1,
      firstSeen:       mem1.firstSeen
    });

    // ── Insight 2 — Trend / current cycle signal ───────────────────────────
    const confScore2 = calcConfidenceScore(count, sourceCount, momentum, tag === 'invest' ? 'watch' : tag);
    const mem2 = updateSignalMemory(sector, 'trend', tag === 'invest' ? 'watch' : tag, confScore2, momentum, count);
    const evo2 = getEvolution(sector, 'trend', tag === 'invest' ? 'watch' : tag, confScore2);

    insights.push({
      tag:             tag === 'invest' ? 'watch' : tag,
      title:           ctx.trend.title,
      sector,
      vcl,
      narrativeCluster: ctx.narrativeCluster,
      narrative:       ctx.narrative,
      what:            `Trend signal: "${secArt.title.slice(0, 85)}"`,
      why:             ctx.trend.why,
      whyMatters:      `Current news cycle reinforces ${sector} as an active investment theme — timing window is ${timeHorizon.label.toLowerCase()}.`,
      whyThisMatters:  ctx.whyThisMatters,
      action:          ctx.trend.action,
      watchNext:       ctx.watchNext || [],
      threats:         ctx.threats,
      // Confidence
      confidence:      confidenceLabel(confScore2),
      confidenceScore: confScore2,
      // Time horizon
      timeSensitivity: timeHorizon.label,
      timeHorizon,
      // Momentum
      momentum,
      articleCount:    count,
      // Data
      dataBasis:       `Trend derived from ${count} article${count > 1 ? 's' : ''} across ${sources.slice(0, 3).join(', ')}.`,
      // Priority scores
      ...priority,
      // India
      indiaImpact:      india.indiaImpact,
      indiaWhy:         india.indiaWhy,
      indianCompanies:  india.indianCompanies,
      // Global stock tickers relevant to this signal
      relevantTickers:  getSectorTickers(sector, text),
      // Evolution
      evolution:       evo2,
      firstSeen:       mem2.firstSeen
    });
  }

  const order = { invest: 0, watch: 1, saturated: 2 };
  return insights.sort((a, b) => order[a.tag] - order[b.tag]);
}

// ─────────────────────────────────────────────────────────────────────────────
// GEMINI — India context enrichment (rule-based already populated as fallback)
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

async function enrichIndiaContext(insights) {
  if (!GEMINI_KEY && !GROQ_KEY) {
    console.log('  → India context: rule-based only (no AI key)');
    return insights;
  }
  if (insights.length === 0) return insights;

  const sectors = [...new Set(insights.map(i => i.sector))];
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
      console.log('  → India context via Gemini…');
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

    return insights.map(ins => {
      const match = aiData.find(d => d.sector === ins.sector);
      if (!match) return ins;
      return {
        ...ins,
        indiaImpact:     match.indiaImpact     || ins.indiaImpact,
        indiaWhy:        match.indiaWhy        || ins.indiaWhy,
        indianCompanies: (match.indianCompanies && match.indianCompanies.length)
                           ? match.indianCompanies : ins.indianCompanies
      };
    });
  } catch (e) {
    console.error('  ✗ India enrichment failed — keeping rule-based data:', e.message);
    return insights;
  }
}

async function generateInsights(articles) {
  if (articles.length === 0) return { insights: [], weakSignals: [], narratives: [] };
  console.log('  → Building strategic intelligence (2 insights/sector + weak signals + narratives)…');
  const base       = buildInsightsLocally(articles);
  console.log(`  ✓ ${base.length} base insights across ${Math.round(base.length / 2)} sectors`);
  const enriched   = await enrichIndiaContext(base);
  const weakSigs   = detectWeakSignals(articles);
  const narratives = buildNarrativeClusters(enriched);
  console.log(`  ✓ ${weakSigs.length} weak signals detected | ${narratives.length} narrative clusters`);
  return { insights: enriched, weakSignals: weakSigs, narratives };
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

  const { insights, weakSignals, narratives } = await generateInsights(articles);

  cache = { articles, insights, weakSignals, narratives, momentum: buildMomentum(articles), generatedAt: Date.now() };

  // Non-blocking: capture stock baseline prices for the new insight set
  captureSignalSnapshot(insights).catch(e => console.error('Snapshot error:', e.message));

  return cache;
}

// ─────────────────────────────────────────────────────────────────────────────
// API ROUTES
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/refresh', async (req, res) => {
  try   { res.json(await refresh()); }
  catch (e) { console.error('Refresh error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/cache',         (req, res) => res.json(cache));
app.get('/api/narratives',    (req, res) => res.json({ narratives: cache.narratives || [], weakSignals: cache.weakSignals || [] }));
app.post('/api/auto-refresh', (req, res) => res.json({ ok: true }));

// ── Stock prices — live fetch from Yahoo Finance ──────────────────────────────
app.get('/api/stock-prices', async (req, res) => {
  const tickerParam = (req.query.tickers || '').trim();
  if (!tickerParam) return res.json({ stocks: {}, error: 'No tickers provided' });
  const tickers = tickerParam.split(',').map(t => t.trim()).filter(Boolean).slice(0, 12);
  try {
    const stocks = await fetchMultipleStocks(tickers);
    res.json({ stocks, updatedAt: Date.now() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Signal history ────────────────────────────────────────────────────────────
app.get('/api/signal-history', async (req, res) => {
  // Serve from MongoDB for full history (survives restarts), fallback to in-memory
  if (mongoDb) {
    try {
      const docs = await mongoDb.collection('signalHistory')
        .find({})
        .sort({ capturedAt: -1 })
        .limit(50)
        .toArray();
      return res.json({ history: docs, count: docs.length, source: 'mongodb' });
    } catch (e) {
      console.error('  ✗ MongoDB history fetch failed:', e.message, '— falling back to memory');
    }
  }
  res.json({ history: signalHistory, count: signalHistory.length, source: 'memory' });
});

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
app.listen(PORT, async () => {
  console.log(`\n🚀 Robotics Intelligence Engine v3.0 — Strategic Intelligence Edition`);
  console.log(`   Port       : ${PORT}`);
  console.log(`   GNews      : ${GNEWS_KEY    ? '✓' : '✗'}`);
  console.log(`   NewsData   : ${NEWSDATA_KEY ? '✓' : '✗'}`);
  console.log(`   Currents   : ${CURRENTS_KEY ? '✓' : '✗'}`);
  console.log(`   Guardian   : ✓ (no key needed)`);
  console.log(`   Gemini     : ${GEMINI_KEY   ? '✓' : '✗'}`);
  console.log(`   Groq backup: ${GROQ_KEY     ? '✓' : '✗'}`);
  console.log(`   MongoDB    : ${MONGODB_URI  ? '⏳ connecting…' : '✗ not set'}`);
  console.log(`   Upgrades   : Confidence Engine | Signal Memory | Weak Signals | Narratives | Why This Matters | Next To Watch | Threat Intel | Priority Scores | Time Horizon`);
  console.log(`   Stock Intel: Yahoo Finance API | ~70-company ticker map | Signal History snapshots`);

  // Connect to MongoDB Atlas (non-blocking — server already accepting requests)
  await connectMongo();
});
