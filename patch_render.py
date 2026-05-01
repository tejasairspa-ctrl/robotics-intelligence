NEW_RENDER = r"""function renderOpportunity() {
  const c = document.getElementById('content');
  const FREE_LIMIT = 5;
  const totalInsights = AUTO_INSIGHTS.length;
  const freeInsights = AUTO_INSIGHTS.filter(i=>!i.premium);
  const premInsights = AUTO_INSIGHTS.filter(i=>i.premium);
  const whiteSpaces = INDUSTRIES.reduce((s,ind)=>s+VCL.filter(v=>MATRIX[ind][v]===0).length,0);

  c.innerHTML = `
  <div class="grid grid-4" style="margin-bottom:16px">
    <div class="card card-sm">
      <div class="card-title">Invest Signals</div>
      <div class="card-value" style="color:#34d399">${AUTO_INSIGHTS.filter(i=>i.tag==='invest').length}</div>
      <div class="card-delta">High-conviction opportunities</div>
    </div>
    <div class="card card-sm">
      <div class="card-title">Watch Signals</div>
      <div class="card-value" style="color:#fbbf24">${AUTO_INSIGHTS.filter(i=>i.tag==='watch').length}</div>
      <div class="card-delta">Emerging trends to monitor</div>
    </div>
    <div class="card card-sm">
      <div class="card-title">Saturated Zones</div>
      <div class="card-value" style="color:#f87171">${AUTO_INSIGHTS.filter(i=>i.tag==='saturated').length}</div>
      <div class="card-delta">Avoid — low upside</div>
    </div>
    <div class="card card-sm">
      <div class="card-title">White Spaces</div>
      <div class="card-value" style="color:#818cf8">${whiteSpaces}</div>
      <div class="card-delta">Uncovered sector × layer cells</div>
    </div>
  </div>

  <div class="insight-counter-bar">
    <div class="insight-counter-left">
      <div class="insight-free-pills">
        ${Array.from({length:totalInsights},(_,i)=>`<div class="insight-pip${i>=FREE_LIMIT?' locked':''}"></div>`).join('')}
      </div>
      <div>
        <div class="insight-counter-text">Showing ${FREE_LIMIT} of ${totalInsights} insights</div>
        <div class="insight-counter-sub">${totalInsights - FREE_LIMIT} premium insights locked — unlock to see all opportunities</div>
      </div>
    </div>
    <div class="insight-counter-cta" onclick="showToast('Upgrade to access all ${totalInsights} insights + company recommendations + India impact analysis')">Unlock All ${totalInsights} Insights →</div>
  </div>

  <div class="section">
    <div class="section-title" style="margin-bottom:4px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
      Structural Investment Signals
    </div>
    <div class="section-sub">Every insight: opportunity · confidence · data basis · where to invest · India impact</div>
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
  </div>`;

  // ── Render structural insights ──────────────────────────────────────────────
  const grid = document.getElementById('insight-grid');
  AUTO_INSIGHTS.forEach((ins) => {
    const el = document.createElement('div');
    el.className = `insight-card ${ins.tag}`;
    const isPremium = ins.premium;

    const confBars = (level) => {
      const lit = level==='High'?3:level==='Medium'?2:1;
      const barColor = level==='High'?'lit-green':level==='Medium'?'lit-yellow':'lit-gray';
      return `<div class="conf-indicator">${[1,2,3].map(i=>`<div class="conf-bar${i<=lit?' '+barColor:''}"></div>`).join('')}</div>`;
    };
    const confClass = l => l==='High'?'conf-high':l==='Medium'?'conf-medium':'conf-low';
    const timeClass = t => t==='Immediate'?'time-immediate':t==='Emerging'?'time-emerging':'time-longterm';
    const timeIcon  = t => t==='Immediate'?'⚡':t==='Emerging'?'📈':'🔭';
    const recTagClass = t => t==='Leader'?'rec-leader':t==='Emerging'?'rec-emerging':'rec-enabler';
    const indiaClass  = l => l==='High'?'india-high':l==='Medium'?'india-medium':'india-low';

    const scoreRow = `
      <div class="insight-scorerow">
        <span class="score-pill ${confClass(ins.confidence)}">${confBars(ins.confidence)} Confidence: ${ins.confidence}</span>
        <div class="score-divider"></div>
        <span class="score-pill ${timeClass(ins.timeSensitivity)}">${timeIcon(ins.timeSensitivity)} ${ins.timeSensitivity}</span>
        <div class="score-divider"></div>
        <span style="font-size:10px;color:var(--muted);font-weight:600">${ins.sector} · ${ins.vcl}</span>
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
          <div class="india-panel-title">🇮🇳 India Impact</div>
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
        <strong>📊 Data Basis —</strong> ${ins.dataBasis}
      </div>`;

    const whyMattersHtml = `
      <div class="why-matters">
        <div class="why-matters-icon">💡</div>
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
            <div class="insight-meta-label">Sector × Layer</div>
            <div class="insight-meta-text">${ins.sector} / ${ins.vcl}</div>
          </div>
        </div>
        <div class="insight-action">
          <div class="insight-action-label">→ Recommended Action</div>
          <div class="insight-action-text">${ins.action}</div>
        </div>
        ${dataBasisHtml}
        ${companyRecsHtml}
        ${indiaPanelHtml}`;
    } else {
      // Premium — show tease, then gate the rest
      el.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span class="tag tag-${ins.tag}">${ins.tagLabel}</span>
          <span class="tag tag-premium">🔒 Premium Insight</span>
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
            <div class="price-anchor" style="text-align:center;margin-top:8px">Part of Investor Intelligence Plan · Used by investors to identify early-stage opportunities</div>
          </div>
          <div class="premium-gate-overlay">
            <div class="price-anchor">Part of Investor Intelligence Plan</div>
            <button class="unlock-cta" onclick="showToast('Upgrade to unlock: full implication, company recommendations & India impact')">Unlock Full Insight →</button>
          </div>
        </div>`;
    }
    grid.appendChild(el);
  });

  // ── Render live insights panel ──────────────────────────────────────────────
  renderLiveInsightsInOpportunity();
}

function renderLiveInsightsInOpportunity() {
  const panel = document.getElementById('live-insight-grid');
  const badge = document.getElementById('live-count-badge');
  if (!panel) return;
  if (!liveData.insights || !liveData.insights.length) {
    panel.innerHTML = `<div class="live-insights-empty">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      No live signals yet — click <strong style="color:var(--teal);margin:0 4px">Refresh Intelligence</strong> in the top bar to fetch real-time AI insights from the news.
    </div>`;
    if (badge) badge.textContent = '';
    return;
  }
  if (badge) badge.textContent = `· ${liveData.insights.length} signals · Updated ${new Date(liveData.generatedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;
  panel.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px">
    ${liveData.insights.map(ins=>`
    <div class="signal-card ${ins.tag}" style="border-top:2px solid ${ins.tag==='invest'?'#10b981':ins.tag==='watch'?'#f59e0b':'#ef4444'}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span class="signal-badge ${ins.tag}">${ins.tag==='invest'?'🟢 INVEST':ins.tag==='watch'?'🟡 WATCH':'🔴 SATURATED'}</span>
        <div style="display:flex;gap:6px">
          ${ins.sector?`<span class="signal-tag">${ins.sector}</span>`:''}
          ${ins.momentum?`<span class="signal-tag" style="background:rgba(6,182,212,.1);color:var(--teal)">${ins.momentum} momentum</span>`:''}
        </div>
      </div>
      <div class="signal-title">${ins.title}</div>
      <div class="signal-body" style="margin-top:4px">${ins.what||''}</div>
      ${ins.why?`<div class="signal-body" style="margin-top:3px;color:#94a3b8">${ins.why}</div>`:''}
      <div class="signal-action">→ ${ins.action||''}</div>
    </div>`).join('')}
  </div>`;
}

"""

content = open('C:/Users/prana/Desktop/Tejas Spire LLP/Robotics Intelligence/robotics-intelligence-platform.html', encoding='utf-8').read()
start = content.index('function renderOpportunity()')
end = content.index('\n// ===================== MARKET STRUCTURE', start)
new_content = content[:start] + NEW_RENDER + content[end:]
open('C:/Users/prana/Desktop/Tejas Spire LLP/Robotics Intelligence/robotics-intelligence-platform.html', 'w', encoding='utf-8').write(new_content)
print('Done. Total length:', len(new_content))
