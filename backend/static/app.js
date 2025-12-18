// API base: override by setting `window.__API_BASE__` in hosting page, or
// when running the frontend from a dev server on :5500/:3000 default to :8000 backend.
const API_BASE = window.__API_BASE__ ?? ((location.hostname === '127.0.0.1' || location.hostname === 'localhost') && (location.port === '5500' || location.port === '3000') ? 'http://127.0.0.1:8000' : '');

function setLoadingSingle(loading){
  const btn = document.getElementById('predictBtn');
  const spinner = document.getElementById('singleSpinner');
  const out = document.getElementById('singleResult');
  btn.disabled = loading;
  if(loading){ spinner.style.display='inline-block'; out.textContent='Predicting...'; }
  else { spinner.style.display='none'; }
}

// store current displayed results so both batch and single predictions
// render in the same place and can be filtered by category.
let currentResults = [];
let selectedFile = null;

async function predictSingle() {
  const text = document.getElementById('singleText').value.trim();
  const out = document.getElementById('singleResult');
  out.textContent = '';
  if (!text) { out.textContent = 'Enter text to classify'; return; }
  setLoadingSingle(true);
  try {
    const resp = await fetch(`${API_BASE}/predict`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({text})
    });
    if (!resp.ok) throw new Error(await resp.text());
    const j = await resp.json();
    const label = j.label || j.predicted_label || j.category || '';
    const confidence = (j.probability||j.confidence||0);
    out.innerHTML = `<strong>Label:</strong> ${escapeHtml(label)} <span class="small">Confidence:</span> <span class="confidence">${confidence.toFixed(3)}</span>`;
    // also add this single prediction into the shared results panel so it
    // can be filtered and inspected alongside batch uploads
    const item = { text, predicted_label: label, confidence };
  // Replace the current results with the single prediction so it behaves
  // like a standalone classification (clears previous uploaded dataset view).
  currentResults = [item];
  // clear any staged file/upload UI so single predict behaves independently
  selectedFile = null;
  const statusEl = document.getElementById('uploadStatus'); if(statusEl) statusEl.textContent = '';
  const fileInput = document.getElementById('fileInput'); if(fileInput){ try{ fileInput.value = ''; }catch(_){}}
  const uploadBtn = document.getElementById('uploadBtn'); if(uploadBtn) uploadBtn.disabled = true;
  renderResults(currentResults);
  } catch (err) {
    out.textContent = 'Error: ' + err;
    console.error(err);
  } finally{
    setLoadingSingle(false);
  }
}

function setLoadingBatch(loading){
  const btn = document.getElementById('uploadBtn');
  const spinner = document.getElementById('uploadSpinner');
  const status = document.getElementById('uploadStatus');
  btn.disabled = loading;
  if(loading){ spinner.style.display='inline-block'; status.textContent='Uploading and predicting...'; }
  else { spinner.style.display='none'; }
}

// Support both clicking the file input and drag/drop
async function uploadAndPredict(file) {
  const status = document.getElementById('uploadStatus');
  status.textContent = '';
  let f = file;
  if (!f) {
    const el = document.getElementById('fileInput');
    f = el && el.files && el.files[0];
  }
  if (!f) { status.textContent = 'Choose a CSV/TSV file first'; showToast('Choose a CSV/TSV file'); return; }
  const fd = new FormData();
  fd.append('file', f, f.name);
  setLoadingBatch(true);
  // show skeleton placeholders while the backend processes the upload
  try{ showSkeletons(6); }catch(_){}
  try {
    const resp = await fetch(`${API_BASE}/predict_batch`, {method:'POST', body: fd});
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(txt || resp.statusText);
    }
    const data = await resp.json();
    status.textContent = `Got ${data.length} records`;
    showToast(`Received ${data.length} results`);
    // replace currentResults with batch results
    currentResults = data;
    renderResults(currentResults);
  } catch (err) {
    status.textContent = 'Error: ' + err;
    showToast('Upload failed — see console');
    console.error(err);
  } finally{
    setLoadingBatch(false);
  }
}

// render n skeleton cards into the results area while loading
function showSkeletons(n){
  const area = document.getElementById('resultsWrapper');
  if(!area) return;
  area.innerHTML = '';
  area.classList.add('cards');
  const wrapper = document.createElement('div'); wrapper.className = 'skeleton-wrapper';
  for(let i=0;i<(n||4);i++){
    const card = document.createElement('div'); card.className = 'skeleton-card';
    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="skeleton-num"></div>
          <div class="skeleton-badge"></div>
        </div>
        <div style="width:48px"></div>
      </div>
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px">
        <div class="skeleton-line long"></div>
        <div class="skeleton-line med"></div>
        <div class="skeleton-line short"></div>
      </div>
    `;
    wrapper.appendChild(card);
  }
  area.appendChild(wrapper);
}

function renderResults(data) {
  const area = document.getElementById('resultsWrapper');
  area.innerHTML = '';
  const countEl = document.getElementById('resultsCount');
  if (!data || !data.length) { if(countEl) countEl.textContent = 'Showing: 0'; area.textContent = 'No results'; return; }

  // build category list and map colors
  const cats = Array.from(new Set(data.map(r=>r.predicted_label || r.label))).sort();
  const sel = document.getElementById('categoryFilter');
  const dateSel = document.getElementById('dateFilter');
  // preserve previous selection so rebuilding options doesn't reset the user's choice
  const prevSel = sel ? sel.value : '';
  sel.innerHTML = '<option value="">(all)</option>' + cats.map(c=>`<option value="${c}">${c}</option>`).join('');
  if (prevSel) {
    const found = Array.from(sel.options).some(o => o.value === prevSel);
    sel.value = found ? prevSel : '';
  }

  // populate dates select (if available in uploaded data)
  if(dateSel){
    const prevDate = dateSel.value || '';
    const dates = Array.from(new Set(data.map(r=> (r.date || '').trim()).filter(Boolean))).sort((a,b)=> (a<b?1:-1));
    dateSel.innerHTML = '<option value="">(all dates)</option>' + dates.map(d=>`<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
    if(prevDate){
      const foundD = Array.from(dateSel.options).some(o => o.value === prevDate);
      dateSel.value = foundD ? prevDate : '';
    }
  }

  // generate consistent colors for categories
  const palette = ['#2563eb','#06b6d4','#f97316','#ef4444','#7c3aed','#059669','#eab308','#db2777'];
  const colors = {};
  cats.forEach((c,i)=> colors[c] = palette[i % palette.length]);

  // render as responsive cards
  area.classList.add('cards');
  const wrapper = document.createElement('div');
  wrapper.className = 'results-cards';

  const visible = getFilteredResults();
  visible.forEach((r, idx)=>{
    const text = r.text || r.content || '';
    const label = r.predicted_label || r.label || '';
    const conf = (r.confidence || r.probability || 0);
    const card = document.createElement('div');
    card.className = 'result-card';
    const badgeColor = colors[label] || 'var(--accent)';
    card.innerHTML = `
      <div class="meta-row">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="num">${idx+1}</div>
          <span class="badge" style="background:${badgeColor}">${escapeHtml(label)}</span>
        </div>
        <div class="small meta">${(conf && Number(conf).toFixed(3)) || ''}</div>
      </div>
      <div class="excerpt">${escapeHtml(text)}</div>
      <div class="actions"><button class="btn btn-secondary btn-preview" aria-label="Preview article" data-preview="${idx}">Preview</button><button class="btn btn-copy" aria-label="Copy article text" data-copy="${idx}">Copy</button></div>
    `;
  // events
  card.querySelector('[data-preview]').addEventListener('click', ()=> openPreview(text));
  card.querySelector('[data-copy]').addEventListener('click', ()=>{ navigator.clipboard && navigator.clipboard.writeText(text); showToast('Copied to clipboard'); });
  // make each card keyboard-focusable and openable via Enter
  card.tabIndex = 0;
  card.setAttribute('role','article');
  card.addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ openPreview(text); } });
  wrapper.appendChild(card);
  });
  area.appendChild(wrapper);

  // animate cards in with a slight stagger for a pleasant feel
  const cards = wrapper.querySelectorAll('.result-card');
  cards.forEach((c, i)=> setTimeout(()=> c.classList.add('show'), i * 40));

  // scroll results area to top when new data appears (mobile-friendly)
  try{ area.scrollTo({ top: 0, behavior: 'smooth' }); }catch(_){ area.scrollTop = 0; }

  if(countEl) countEl.textContent = `Showing: ${visible.length}`;

  // Update charts with filtered data (visible results)
  updateCharts(visible);

  // Update stats panel with filtered data
  const categoryCount = {};
  visible.forEach(item => {
    const label = item.predicted_label || item.label || 'Unknown';
    categoryCount[label] = (categoryCount[label] || 0) + 1;
  });
  updateStatsPanel(categoryCount, visible.length);

  // wire category filter and search to re-render
  sel.onchange = ()=> {
    renderResults(currentResults);
  };
  // wire date filter to re-render when changed
  if(dateSel) dateSel.onchange = ()=> renderResults(currentResults);
  const si = document.getElementById('searchInput'); if(si) si.oninput = ()=> renderResults(currentResults);
}

// toast helper
function showToast(msg, timeout=3500){
  let t = document.getElementById('toast');
  if(!t){
    t = document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t);
  }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._hide);
  t._hide = setTimeout(()=>{ t.classList.remove('show'); }, timeout);
}

function updateResultsCount(tbody){
  const countEl = document.getElementById('resultsCount');
  if(!countEl) return;
  if(!tbody) { countEl.textContent = 'Showing: 0'; return; }
  const visible = Array.from(tbody.children).filter(r=> r.style.display !== 'none').length;
  countEl.textContent = `Showing: ${visible}`;
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]); }

document.getElementById('predictBtn').onclick = predictSingle;
document.getElementById('uploadBtn').onclick = ()=>uploadAndPredict(selectedFile);

// drag/drop file support for batch uploads
const fileInput = document.getElementById('fileInput');
if(fileInput){
  const drop = document.createElement('div'); drop.className='dropzone'; drop.innerHTML='<div class="small">Drag & drop CSV/TSV here or click to choose a file</div>';
  fileInput.style.display='none';
  fileInput.parentNode.insertBefore(drop, fileInput);
  drop.appendChild(fileInput);
  // make dropzone keyboard accessible and clickable
  drop.tabIndex = 0;
  drop.setAttribute('role', 'button');
  drop.addEventListener('click', ()=>fileInput.click());
  drop.addEventListener('keydown', (e)=>{ if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  drop.addEventListener('dragover', (e)=>{ e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', ()=>{ drop.classList.remove('dragover'); });
  drop.addEventListener('drop', (e)=>{ e.preventDefault(); drop.classList.remove('dragover'); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if(f) uploadAndPredict(f); });
  // when user selects a file using the file chooser we DO NOT auto-upload;
  // store the file and enable the Upload button so the user can confirm.
  fileInput.addEventListener('change', ()=>{
    const f = fileInput.files && fileInput.files[0];
    selectedFile = f || null;
    const status = document.getElementById('uploadStatus');
    const uploadBtn = document.getElementById('uploadBtn');
    if(f){
      status.textContent = `Selected: ${f.name}`;
      if(uploadBtn) uploadBtn.disabled = false;
      // when choosing a file we should clear any single-text input/result
      const singleTextEl = document.getElementById('singleText');
      const singleResultEl = document.getElementById('singleResult');
      if(singleTextEl) singleTextEl.value = '';
      if(singleResultEl) singleResultEl.textContent = '';
      // also clear in-memory single results shown in the results panel
      currentResults = [];
      try{ renderResults(currentResults); }catch(_){ }
    } else {
      status.textContent = '';
      if(uploadBtn) uploadBtn.disabled = true;
    }
  });
}

// enable pressing Ctrl+Enter to submit single text
document.getElementById('singleText').addEventListener('keydown', (e)=>{ if(e.ctrlKey && e.key==='Enter') predictSingle(); });

// Preview modal
function openPreview(text){
  const backdrop = document.getElementById('modalBackdrop');
  const body = document.getElementById('modalBody');
  const title = document.getElementById('modalTitle');
  body.textContent = text;
  title.textContent = 'Article preview';
  backdrop.style.display = 'flex';
  backdrop.setAttribute('aria-hidden','false');
}
document.getElementById('modalClose').addEventListener('click', ()=>{document.getElementById('modalBackdrop').style.display='none';document.getElementById('modalBackdrop').setAttribute('aria-hidden','true');});
document.getElementById('modalBackdrop').addEventListener('click',(e)=>{ if(e.target.id==='modalBackdrop'){ document.getElementById('modalBackdrop').style.display='none'; document.getElementById('modalBackdrop').setAttribute('aria-hidden','true'); }});

function renumberRows(tbody){
  const rows = Array.from(tbody.children).filter(r=> r.style.display !== 'none');
  rows.forEach((tr, idx)=>{
    const cell = tr.querySelector('.rownum');
    if(cell) cell.textContent = String(idx+1);
  });
}

function getFilteredResults(){
  const sel = document.getElementById('categoryFilter');
  const dateSel = document.getElementById('dateFilter');
  const si = document.getElementById('searchInput');
  const category = sel ? (sel.value || '').toLowerCase() : '';
  const dateFilter = dateSel ? (dateSel.value || '') : '';
  const q = si && si.value ? si.value.trim().toLowerCase() : '';
  return currentResults.filter(r=>{
    const label = (r.predicted_label||r.label||'').toLowerCase();
    const text = (r.text||r.content||'').toLowerCase();
    if(category && label !== category) return false;
    if(dateFilter){
      // compare raw string equality (both originate from CSV strings)
      const d = (r.date || '').toString();
      if(d !== dateFilter) return false;
    }
    if(q && !(text.includes(q) || label.includes(q))) return false;
    return true;
  });
}

function updateResultsCount(){
  const countEl = document.getElementById('resultsCount');
  if(!countEl) return;
  const n = getFilteredResults().length;
  countEl.textContent = `Showing: ${n}`;
}

// wire clear button and ensure file input is reset so selection after clearing works
const cbtn = document.getElementById('clearBtn');
if(cbtn){
  cbtn.addEventListener('click', ()=>{
    currentResults = [];
    selectedFile = null;
    const rw = document.getElementById('resultsWrapper'); if(rw) rw.innerHTML = '';
    const status = document.getElementById('uploadStatus'); if(status) status.textContent = '';
    const si = document.getElementById('searchInput'); if(si) si.value = '';
    // also clear single-text input/result and any spinner
    const singleTextEl = document.getElementById('singleText'); if(singleTextEl) singleTextEl.value = '';
    const singleResultEl = document.getElementById('singleResult'); if(singleResultEl) singleResultEl.textContent = '';
    const singleSpinner = document.getElementById('singleSpinner'); if(singleSpinner) singleSpinner.style.display = 'none';
    const sel = document.getElementById('categoryFilter'); if(sel) sel.innerHTML = '<option value="">(all)</option>';
    const dsel = document.getElementById('dateFilter'); if(dsel) dsel.innerHTML = '<option value="">(all dates)</option>';
    // hide charts and stats
    document.getElementById('statsCard').style.display = 'none';
    document.getElementById('chartsCard').style.display = 'none';
    // reset the hidden file input so re-selecting the same file will fire change
    const fi = document.getElementById('fileInput');
    if(fi){
      try{ fi.value = ''; }catch(_){ /* ignore */ }
    }
    const uploadBtn = document.getElementById('uploadBtn'); if(uploadBtn) uploadBtn.disabled = true;
    updateResultsCount();
    showToast('Cleared results');
  });
}
// small initializations for better UX
(function(){
  const si = document.getElementById('searchInput'); if(si){ si.setAttribute('placeholder','Search results or labels...'); }
  const rc = document.getElementById('resultsCount'); if(rc && rc.textContent.trim()==='') rc.textContent = 'Showing: 0';
})();

// Per-letter title jump-and-spread animation on page load
function initTitleLetterAnimation(){
  try{
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const h1 = document.querySelector('.hero h1');
    if(!h1) return;
    const raw = h1.textContent || '';
    const chars = Array.from(raw);
    // clear and re-create letter spans
    h1.textContent = '';
    chars.forEach(ch => {
      const span = document.createElement('span');
      span.className = 'title-letter';
      span.textContent = ch === ' ' ? '\u00A0' : ch;
      h1.appendChild(span);
    });

    const letters = Array.from(h1.querySelectorAll('.title-letter'));
    const len = letters.length;
    if(len === 0) return;
    const centerIndex = (len - 1) / 2;

    // Use CSS animation-delay per-letter for a reliable stagger
    letters.forEach((el, i) => {
      el.style.animationDelay = `${i * 120}ms`;
      // add jump class so animation runs honoring the delay
      el.classList.add('jump');
      el.addEventListener('animationend', function handler(){
        el.removeEventListener('animationend', handler);
        // compute horizontal offset proportionally so letters spread toward edges
        const rect = h1.getBoundingClientRect();
        const pos = centerIndex === 0 ? 0 : ((i - centerIndex) / centerIndex);
        const maxOffset = Math.max(60, rect.width / 2 - 40);
        const offset = Math.round(pos * maxOffset);
        // apply final transform (translateX). keep translateY at 0.
        el.style.transition = 'transform 600ms cubic-bezier(.2,.9,.2,1)';
        el.style.transform = `translateX(${offset}px) translateY(0)`;
      });
    });
  }catch(err){ console.error('Title animation failed', err); }
}

// start animation shortly after load so CSS is applied
setTimeout(initTitleLetterAnimation, 220);

// ===============================
// CHARTS AND VISUALIZATION
// ===============================
let pieChartInstance = null;
let barChartInstance = null;

function updateCharts(data) {
  if (!data || data.length === 0) {
    // Hide charts if no data
    document.getElementById('statsCard').style.display = 'none';
    document.getElementById('chartsCard').style.display = 'none';
    return;
  }

  // Show chart cards
  document.getElementById('statsCard').style.display = 'block';
  document.getElementById('chartsCard').style.display = 'block';

  // Calculate category distribution
  const categoryCount = {};
  data.forEach(item => {
    const label = item.predicted_label || item.label || 'Unknown';
    categoryCount[label] = (categoryCount[label] || 0) + 1;
  });

  const categories = Object.keys(categoryCount).sort((a, b) => categoryCount[b] - categoryCount[a]);
  const counts = categories.map(cat => categoryCount[cat]);
  const total = data.length;
  const percentages = counts.map(count => ((count / total) * 100).toFixed(1));

  // Color palette
  const chartColors = [
    '#2563eb', '#06b6d4', '#f97316', '#ef4444', 
    '#7c3aed', '#059669', '#eab308', '#db2777',
    '#8b5cf6', '#10b981', '#f59e0b', '#ec4899'
  ];

  // Update statistics panel
  updateStatsPanel(categoryCount, total);

  // Destroy previous chart instances
  if (pieChartInstance) {
    pieChartInstance.destroy();
    pieChartInstance = null;
  }
  if (barChartInstance) {
    barChartInstance.destroy();
    barChartInstance = null;
  }

  // Create Pie Chart
  const pieCtx = document.getElementById('pieChart');
  if (pieCtx) {
    pieChartInstance = new Chart(pieCtx, {
      type: 'pie',
      data: {
        labels: categories,
        datasets: [{
          data: counts,
          backgroundColor: chartColors.slice(0, categories.length),
          borderColor: '#ffffff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 15,
              font: { size: 12, family: 'Inter' },
              generateLabels: function(chart) {
                const data = chart.data;
                return data.labels.map((label, i) => ({
                  text: `${label} (${percentages[i]}%)`,
                  fillStyle: data.datasets[0].backgroundColor[i],
                  hidden: false,
                  index: i
                }));
              }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.parsed || 0;
                const percentage = ((value / total) * 100).toFixed(1);
                return `${label}: ${value} articles (${percentage}%)`;
              }
            }
          }
        }
      }
    });
  }

  // Create Bar Chart
  const barCtx = document.getElementById('barChart');
  if (barCtx) {
    barChartInstance = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: categories,
        datasets: [{
          label: 'Number of Articles',
          data: counts,
          backgroundColor: chartColors.slice(0, categories.length).map(color => color + 'cc'),
          borderColor: chartColors.slice(0, categories.length),
          borderWidth: 2,
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              font: { size: 11, family: 'Inter' }
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.05)'
            }
          },
          x: {
            ticks: {
              font: { size: 11, family: 'Inter' }
            },
            grid: {
              display: false
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const value = context.parsed.y || 0;
                const percentage = ((value / total) * 100).toFixed(1);
                return `${value} articles (${percentage}%)`;
              }
            }
          }
        }
      }
    });
  }
}

function updateStatsPanel(categoryCount, total) {
  const statsPanel = document.getElementById('statsPanel');
  if (!statsPanel) return;

  const categories = Object.keys(categoryCount).sort((a, b) => categoryCount[b] - categoryCount[a]);
  
  // Get current filter selection
  const categoryFilter = document.getElementById('categoryFilter');
  const selectedCategory = categoryFilter ? categoryFilter.value : '';
  
  // Create stats HTML
  let statsHTML = `
    <div class="stat-item ${selectedCategory === '' ? 'highlighted' : ''}">
      <div class="stat-label">Total Articles</div>
      <div class="stat-value">${total}</div>
    </div>
  `;

  categories.forEach(category => {
    const count = categoryCount[category];
    const percentage = ((count / total) * 100).toFixed(1);
    const isSelected = selectedCategory === category;
    statsHTML += `
      <div class="stat-item category-stat ${isSelected ? 'highlighted' : ''}">
        <div class="stat-label">${escapeHtml(category)}</div>
        <div class="stat-value">${count}</div>
        <div class="stat-percentage">${percentage}%</div>
      </div>
    `;
  });

  statsPanel.innerHTML = statsHTML;
}

// Chart toggle functionality
function initChartToggle() {
  const pieBtn = document.getElementById('pieChartBtn');
  const barBtn = document.getElementById('barChartBtn');
  const pieContainer = document.getElementById('pieChartContainer');
  const barContainer = document.getElementById('barChartContainer');

  if (!pieBtn || !barBtn) return;

  pieBtn.addEventListener('click', () => {
    pieBtn.classList.add('active');
    barBtn.classList.remove('active');
    pieContainer.style.display = 'block';
    barContainer.style.display = 'none';
  });

  barBtn.addEventListener('click', () => {
    barBtn.classList.add('active');
    pieBtn.classList.remove('active');
    barContainer.style.display = 'block';
    pieContainer.style.display = 'none';
  });
}

// Initialize toggle on page load
initChartToggle();

