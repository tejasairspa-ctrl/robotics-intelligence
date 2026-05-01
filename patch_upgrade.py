import re

with open('robotics-intelligence-platform.html', 'r', encoding='utf-8') as f:
    content = f.read()

# ── 1. Add selectedSector state variable ─────────────────────────────────────
old_state = "let currentTab = 'opportunity';\nlet companyFilter = 'All';\nlet companySearch = '';"
new_state = "let currentTab = 'opportunity';\nlet companyFilter = 'All';\nlet companySearch = '';\nlet selectedSector = 'All';"
content = content.replace(old_state, new_state, 1)

# ── 2. Replace renderOpportunity + renderLiveInsightsInOpportunity ────────────
OLD_OPP_START = "// ===================== OPPORTUNITY ENGINE =====================\nfunction renderOpportunity() {"
OLD_OPP_END   = "\n\n// ===================== MARKET STRUCTURE ====================="

start = content.index(OLD_OPP_START)
end   = content.index(OLD_OPP_END, start)

NEW_OPP = r"""// ===================== OPPORTUNITY ENGINE =====================
function changeSector(sector) {
  selectedSector = sector;
  renderOpportunity();
}

async function loadDebugPanel() {
  const panel = document.getElementById('debug-panel');
  if (!panel) return;
  try {
    const res = await fetch(`${API_BASE}/api/status`);
    if (!res.ok) throw new Error('offline');
    const d = await res.json();
    panel.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><span style="color:var(--text);font-weight:700">News API Endpoint</span><br>${d.newsEndpoint}</div>
        <div><span style="color:var(--text);font-weight:700">API Key</span><br>${d.apiKey}</div>
        <div><span style="color:var(--text);font-weight:700">Articles Fetched</span><br>${d.articlesFetched}</div>
        <div><span style="color:var(--text);font-weight:700">Last Fetch</span><br>${d.lastFetch || 'Never — click Refresh'}</div>
        <div><span style="color:var(--text);font-weight:700">Data Source</span><br>${d.source}</div>
        <div><span style="color:var(--text);font-weight:700">RSS Feeds</span><br>${d.feedCount} configured</div>
      </div>`;
  } catch(e) {
    panel.innerHTML = `<span style="color:var(--red)">&#9888; Server offline — run: node server.js</span>`;
  }
}

function renderOpportunity() {
  const c = document.getElementById('content');
  const FREE_LIMIT = 5;
  const SECTORS = ['All','Agriculture','Automotive','Consumer','Defence','Healthcare','Logistics','Space'];

  const filteredInsights = selectedSector === 'All'
    ? AUTO_INSIGHTS
    : AUTO_INSIGHTS.filter(i => i.sector === selectedSector);

  const totalFiltered = filteredInsights.length;
  const whiteSpaces = INDUSTRIES.reduce((s,ind)=>s+VCL.filter(v=>MATRIX[ind][v]===0).length,0);
  const sectorLabel = selectedSector === 'All' ? '' : ` ${selectedSector}`;

  c.innerHTML = `
  <div class="grid grid-4" style="margin-bottom:16px">
    <div class="card card-sm">
      <div class="card-title">Invest Signals</div>
      <div class="card-value" style="color:#34d399">${filteredInsights.filter(i=>i.tag==='invest').length}</div>
      <div class="card-delta">High-conviction opportunities</div>
    </div>
    <div class="card card-sm">
      <div class="card-title">Watch Signals</div>
      <div class="card-value" style="color:#fbbf24">${filteredInsights.filter(i=>i.tag==='watch').length}</div>
      <div class="card-delta">Emerging trends to monitor</div>
    </div>
    <div class="card card-sm">
      <div class="card-title">Saturated Zones</div>
      <div class="card-value" style="color:#f87171">${filteredInsights.filter(i=>i.tag==='saturated').length}</div>
      <div class="card-delta">Avoid — low upside</div>
    </div>
    <div class="card card-sm">
      <div class="card-title">White Spaces</div>
      <div class="card-value" style="color:#818cf8">${whiteSpaces}</div>
      <div class="card-delta">Uncovered sector &times; layer cells</div>
    </div>
  </div>

  <div class="filter-row" style="margin-bottom:16px">
    ${SECTORS.map(s => `<button class="filter-btn${selectedSector===s?' active':''}" onclick="changeSector('${s}')">${s==='All'?'All Sectors':s}</button>`).join('')}
  </div>

  <div class="insight-counter-bar">
    <div class="insight-counter-left">
      <div class="insight-free-pills">
        ${Array.from({length:totalFiltered},(_,i)=>`<div class="insight-pip${i>=FREE_LIMIT?' locked':''}"></div>`).join('')}
      </div>
      <div>
        <div class="insight-counter-text">Showing ${Math.min(FREE_LIMIT, totalFiltered)} of ${totalFiltered}${sectorLabel} insights</div>
        <div class="insight-counter-sub">${Math.max(0, totalFiltered-FREE_LIMIT)} premium insights locked — unlock to see all</div>
      </div>
    </div>
    <div class="insight-counter-cta" onclick="showToast('Upgrade to access all insights + company recommendations + India impact analysis')">Unlock All \u2192</div>
  </div>

  <div class="section">
    <div class="section-title" style="margin-bottom:4px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
      ${sectorLabel ? sectorLabel.trim() + ' Investment Signals' : 'Structural Investment Signals'}
    </div>
    <div class="section-sub">Every insight: opportunity &middot; confidence &middot; data basis &middot; where to invest &middot; India impact</div>
    <div id="insight-grid" style="display:flex;flex-direction:column;gap:14px"></div>
  </div>

  <div class="section" id="live-section">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <div class="section-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        Live AI Intelligence
        <span id="live-count-badge" style="font-size:10px;color:var(--muted);font-weight:400"></span>
      </div>
      <button class="refresh-btn" style="font-size:11px;padding:5px 12px" onclick="refreshIntelligence()">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
        Refresh
      </button>
    </div>
    <div class="section-sub">Claude-powered insights from live news — click Refresh Intelligence to fetch</div>
    <div id="live-insight-grid" class="live-insights-panel"></div>
  </div>

  <div class="section">
    <div class="section-title" style="margin-bottom:8px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M22 12h-2M4 12H2M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 3.93"/></svg>
      API Debug
    </div>
    <div id="debug-panel" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px;font-size:11px;font-family:monospace;color:var(--muted);line-height:2">Loading...</div>
  </div>`;

  // ── Render structural insights ──────────────────────────────────────────────
  const grid = document.getElementById('insight-grid');

  if (filteredInsights.length === 0) {
    grid.innerHTML = `<div class="empty">No ${selectedSector} insights found. Select "All Sectors" or a different sector.</div>`;
  } else {
    filteredInsights.forEach((ins, idx) => {
      const el = document.createElement('div');
      el.className = `insight-card ${ins.tag}`;
      const isPremium = idx >= FREE_LIMIT;

      const confBars = (level) => {
        const lit = level==='High'?3:level==='Medium'?2:1;
        const barColor = level==='High'?'lit-green':level==='Medium'?'lit-yellow':'lit-gray';
        return `<div class="conf-indicator">${[1,2,3].map(i=>`<div class="conf-bar${i<=lit?' '+barColor:''}"></div>`).join('')}</div>`;
      };
      const confClass = l => l==='High'?'conf-high':l==='Medium'?'conf-medium':'conf-low';
      const timeClass = t => t==='Immediate'?'time-immediate':t==='Emerging'?'time-emerging':'time-longterm';
      const timeIcon  = t => t==='Immediate'?'\u26a1':t==='Emerging'?'\u{1F4C8}':'\u{1F52D}';
      const recTagClass = t => t==='Leader'?'rec-leader':t==='Emerging'?'rec-emerging':'rec-enabler';
      const indiaClass  = l => l==='High'?'india-high':l==='Medium'?'india-medium':'india-low';

      const scoreRow = `
        <div class="insight-scorerow">
          <span class="score-pill ${confClass(ins.confidence)}">${confBars(ins.confidence)} Confidence: ${ins.confidence}</span>
          <div class="score-divider"></div>
          <span class="score-pill ${timeClass(ins.timeSensitivity)}">${timeIcon(ins.timeSensitivity)} ${ins.timeSensitivity}</span>
          <div class="score-divider"></div>
          <span style="font-size:10px;color:var(--muted);font-weight:600">${ins.sector} \u00b7 ${ins.vcl}</span>
        </div>`;

      const companyRecsHtml = ins.companyRecs ? `
        <div class="company-recs">
          <div class="company-recs-label">Where to Invest</div>
          <div class="company-recs-grid">
            ${ins.companyRecs.map(r=>`
            <div class="company-rec-card">
              <span class="company-rec-tag ${recTagClass(r.tag)}">${r.tag}</span>
              <div>
                <div class="company-rec-name">${r.name}</div>
                <div class="company-rec-reason">${r.reason}</div>
              </div>
            </div>`).join('')}
          </div>
        </div>` : '';

      const indiaPanelHtml = ins.indiaImpact ? `
        <div class="india-panel">
          <div class="india-panel-header">
            <div class="india-panel-title">\u{1F1EE}\u{1F1F3} India Impact</div>
            <span class="india-impact-badge ${indiaClass(ins.indiaImpact.level)}">${ins.indiaImpact.level}</span>
          </div>
          <div class="india-panel-body">
            <div class="india-why">${ins.indiaImpact.why}</div>
            <div class="india-cos">
              ${ins.indiaImpact.companies.map(co=>`<span class="india-co-chip" title="${co.reason}">${co.name}</span>`).join('')}
            </div>
          </div>
        </div>` : '';

      const dataBasisHtml = `
        <div class="databasis-block">
          <strong>\u{1F4CA} Data Basis \u2014</strong> ${ins.dataBasis}
        </div>`;

      const whyMattersHtml = `
        <div class="why-matters">
          <div class="why-matters-icon">\u{1F4A1}</div>
          <div class="why-matters-text">${ins.whyMatters}</div>
        </div>`;

      if (!isPremium) {
        el.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span class="tag tag-${ins.tag}">${ins.tagLabel}</span>
          </div>
          <div class="insight-title">${ins.icon} ${ins.title}</div>
          ${whyMattersHtml}
          <div class="insight-reason">${ins.reason}</div>
          ${scoreRow}
          <div class="insight-meta" style="margin-top:10px">
            <div class="insight-meta-item">
              <div class="insight-meta-label">Implication</div>
              <div class="insight-meta-text">${ins.implication}</div>
            </div>
            <div class="insight-meta-item">
              <div class="insight-meta-label">Sector \u00d7 Layer</div>
              <div class="insight-meta-text">${ins.sector} / ${ins.vcl}</div>
            </div>
          </div>
          <div class="insight-action">
            <div class="insight-action-label">\u2192 Recommended Action</div>
            <div class="insight-action-text">${ins.action}</div>
          </div>
          ${dataBasisHtml}
          ${companyRecsHtml}
          ${indiaPanelHtml}`;
      } else {
        el.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span class="tag tag-${ins.tag}">${ins.tagLabel}</span>
            <span class="tag tag-premium">\u{1F512} Premium</span>
          </div>
          <div class="insight-title">${ins.icon} ${ins.title}</div>
          ${whyMattersHtml}
          <div class="insight-reason">${ins.reason}</div>
          ${scoreRow}
          <div class="premium-gate">
            <div class="premium-gate-blur">
              <div class="insight-meta" style="margin-top:10px">
                <div class="insight-meta-item">
                  <div class="insight-meta-label">Implication</div>
                  <div class="insight-meta-text">${ins.implication}</div>
                </div>
                <div class="insight-meta-item">
                  <div class="insight-meta-label">Recommended Action</div>
                  <div class="insight-meta-text">${ins.action}</div>
                </div>
              </div>
              ${dataBasisHtml}
              ${companyRecsHtml}
              ${indiaPanelHtml}
            </div>
            <div class="premium-gate-overlay">
              <div class="price-anchor">Part of Investor Intelligence Plan</div>
              <button class="unlock-cta" onclick="showToast('Upgrade to unlock: full implication, company recommendations \u0026 India impact')">Unlock Full Insight \u2192</button>
            </div>
          </div>`;
      }
      grid.appendChild(el);
    });
  }

  loadDebugPanel();
  renderLiveInsightsInOpportunity();
}

function renderLiveInsightsInOpportunity() {
  const panel = document.getElementById('live-insight-grid');
  const badge = document.getElementById('live-count-badge');
  if (!panel) return;

  let insights = liveData.insights || [];
  if (selectedSector !== 'All') {
    insights = insights.filter(i => i.sector === selectedSector);
  }

  if (!insights.length) {
    const hasData = liveData.insights && liveData.insights.length > 0;
    const msg = hasData && selectedSector !== 'All'
      ? `No live signals for <strong style="color:var(--text)">${selectedSector}</strong> — try All Sectors or click Refresh`
      : 'No live signals yet \u2014 click <strong style="color:var(--teal);margin:0 4px">Refresh Intelligence</strong> in the top bar to fetch real-time AI insights.';
    panel.innerHTML = `<div class="live-insights-empty">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      <span>${msg}</span>
    </div>`;
    if (badge) badge.textContent = '';
    return;
  }
  if (badge) badge.textContent = `\u00b7 ${insights.length} signals \u00b7 Updated ${new Date(liveData.generatedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;
  panel.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px">
    ${insights.map(ins=>`
    <div class="signal-card ${ins.tag}" style="border-top:2px solid ${ins.tag==='invest'?'#10b981':ins.tag==='watch'?'#f59e0b':'#ef4444'}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span class="signal-badge ${ins.tag}">${ins.tag==='invest'?'\u{1F7E2} INVEST':ins.tag==='watch'?'\u{1F7E1} WATCH':'\u{1F534} SATURATED'}</span>
        <div style="display:flex;gap:6px">
          ${ins.sector?`<span class="signal-tag">${ins.sector}</span>`:''}
          ${ins.momentum?`<span class="signal-tag" style="background:rgba(6,182,212,.1);color:var(--teal)">${ins.momentum} momentum</span>`:''}
        </div>
      </div>
      <div class="signal-title">${ins.title}</div>
      <div class="signal-body" style="margin-top:4px">${ins.what||''}</div>
      ${ins.why?`<div class="signal-body" style="margin-top:3px;color:#94a3b8">${ins.why}</div>`:''}
      <div class="signal-action">\u2192 ${ins.action||''}</div>
    </div>`).join('')}
  </div>`;
}"""

content = content[:start] + NEW_OPP + content[end:]

with open('robotics-intelligence-platform.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("HTML patched OK — lines:", content.count('\n'))
