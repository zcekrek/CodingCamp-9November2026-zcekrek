/* =============================================
   Expense & Budget Visualizer — app.js
   ============================================= */

// ── Category registry ──────────────────────────────────────────────────────
const DEFAULT_CATS = {
  Food:          { icon: '🍔', color: '#f59e0b' },
  Transport:     { icon: '🚗', color: '#6366f1' },
  Fun:           { icon: '🎮', color: '#ec4899' },
  Shopping:      { icon: '🛍️', color: '#14b8a6' },
  Bills:         { icon: '🧾', color: '#8b5cf6' },
  Health:        { icon: '💊', color: '#10b981' },
};

let categories = JSON.parse(localStorage.getItem('eb_categories') || 'null') || { ...DEFAULT_CATS };
let transactions = JSON.parse(localStorage.getItem('eb_transactions') || '[]');
let spendLimit    = parseFloat(localStorage.getItem('eb_limit') || '0');
let darkMode      = localStorage.getItem('eb_dark') === 'true';
let selectedCat   = Object.keys(categories)[0];
let sortMode      = 'date'; // 'date' | 'amount' | 'category'
let activeMonth   = '';
let chartInstance = null;

// ── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  buildCategoryTags();
  document.getElementById('limit-input').value = spendLimit || '';
  setActiveMonth();
  render();

  // Header date
  document.getElementById('hdr-date').textContent =
    new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  // Event: form submit
  document.getElementById('tx-form').addEventListener('submit', onAddTransaction);

  // Event: theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Event: custom category add
  document.getElementById('btn-add-cat').addEventListener('click', onAddCategory);
  document.getElementById('new-cat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); onAddCategory(); }
  });

  // Event: sort buttons
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sortMode = btn.dataset.sort;
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === sortMode));
      renderList();
    });
  });

  // Event: spending limit
  document.getElementById('limit-input').addEventListener('input', e => {
    spendLimit = parseFloat(e.target.value) || 0;
    localStorage.setItem('eb_limit', spendLimit);
    renderList();
  });

  // Event: month tab click (delegated)
  document.getElementById('month-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.m-tab');
    if (!tab) return;
    activeMonth = tab.dataset.month;
    document.querySelectorAll('.m-tab').forEach(t => t.classList.toggle('active', t.dataset.month === activeMonth));
    renderSummary();
  });
});

// ── Theme ──────────────────────────────────────────────────────────────────
function applyTheme() {
  document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  document.getElementById('theme-toggle').textContent = darkMode ? '☀️' : '🌙';
}
function toggleTheme() {
  darkMode = !darkMode;
  localStorage.setItem('eb_dark', darkMode);
  applyTheme();
}

// ── Category tags ──────────────────────────────────────────────────────────
function buildCategoryTags() {
  const wrap = document.getElementById('cat-tags');
  wrap.innerHTML = '';
  Object.keys(categories).forEach(name => {
    const tag = document.createElement('button');
    tag.className = 'cat-tag' + (name === selectedCat ? ' selected' : '');
    tag.textContent = categories[name].icon + ' ' + name;
    tag.type = 'button';
    tag.addEventListener('click', () => {
      selectedCat = name;
      document.querySelectorAll('.cat-tag').forEach(t => t.classList.remove('selected'));
      tag.classList.add('selected');
    });
    wrap.appendChild(tag);
  });
}

function onAddCategory() {
  const input = document.getElementById('new-cat-input');
  const name = input.value.trim();
  if (!name) { showToast('Enter a category name'); return; }
  if (categories[name]) { showToast('Category already exists'); return; }
  // Assign a colour from a rotation
  const palette = ['#f43f5e','#0ea5e9','#a3e635','#fb923c','#c084fc','#34d399'];
  const icons   = ['⭐','🏷️','💡','🎯','🔖','📦'];
  const idx = Object.keys(categories).length % palette.length;
  categories[name] = { icon: icons[idx], color: palette[idx] };
  localStorage.setItem('eb_categories', JSON.stringify(categories));
  selectedCat = name;
  input.value = '';
  buildCategoryTags();
  showToast('Category "' + name + '" added');
}

// ── Add transaction ────────────────────────────────────────────────────────
function onAddTransaction(e) {
  e.preventDefault();
  const name   = document.getElementById('f-name').value.trim();
  const amount = parseFloat(document.getElementById('f-amount').value);

  if (!name)              { showToast('Please enter an item name'); return; }
  if (!amount || amount <= 0) { showToast('Please enter a valid amount'); return; }

  const tx = {
    id:       Date.now(),
    name,
    amount,
    category: selectedCat,
    date:     new Date().toISOString(),
    dateStr:  new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }),
    monthKey: new Date().toISOString().slice(0, 7), // "YYYY-MM"
  };

  transactions.unshift(tx);
  save();
  document.getElementById('f-name').value   = '';
  document.getElementById('f-amount').value = '';
  render();
  showToast('Added: ' + name);
}

// ── Delete ─────────────────────────────────────────────────────────────────
function deleteTransaction(id) {
  transactions = transactions.filter(t => t.id !== id);
  save();
  render();
  showToast('Deleted');
}

// ── Save ───────────────────────────────────────────────────────────────────
function save() {
  localStorage.setItem('eb_transactions', JSON.stringify(transactions));
}

// ── Render (all) ───────────────────────────────────────────────────────────
function render() {
  renderBalance();
  renderList();
  renderChart();
  buildMonthTabs();
  renderSummary();
}

// ── Balance ────────────────────────────────────────────────────────────────
function renderBalance() {
  const total = transactions.reduce((s, t) => s + t.amount, 0);
  document.getElementById('balance-display').textContent = fmt(total);
  document.getElementById('total-spend').textContent     = fmt(total);
  document.getElementById('tx-count').textContent        = transactions.length + ' items';
}

// ── Transaction list ───────────────────────────────────────────────────────
function getSorted() {
  const list = [...transactions];
  if (sortMode === 'amount')   list.sort((a, b) => b.amount - a.amount);
  if (sortMode === 'category') list.sort((a, b) => a.category.localeCompare(b.category));
  // 'date' keeps insertion order (newest first by default)
  return list;
}

function renderList() {
  const wrap = document.getElementById('tx-list');
  if (!transactions.length) {
    wrap.innerHTML = '<div class="empty-msg">No transactions yet — add one above!</div>';
    return;
  }
  const list = getSorted();
  wrap.innerHTML = list.map(tx => {
    const cat  = categories[tx.category] || { icon:'📌', color:'#6b7280' };
    const over = spendLimit > 0 && tx.amount > spendLimit;
    return `
      <div class="tx-item${over ? ' over-limit' : ''}">
        <div class="cat-dot" style="background:${cat.color}22;">${cat.icon}</div>
        <div class="tx-info">
          <div class="tx-name">${escHtml(tx.name)}${over ? ' ⚠️' : ''}</div>
          <div class="tx-meta">${tx.category} · ${tx.dateStr}</div>
        </div>
        <div class="tx-amount neg">-${fmt(tx.amount)}</div>
        <button class="tx-del" onclick="deleteTransaction(${tx.id})" aria-label="Delete">✕</button>
      </div>
    `;
  }).join('');
}

// ── Chart (pie) ────────────────────────────────────────────────────────────
function renderChart() {
  const catSpend = {};
  transactions.forEach(t => {
    catSpend[t.category] = (catSpend[t.category] || 0) + t.amount;
  });
  const labels = Object.keys(catSpend);
  const data   = labels.map(l => catSpend[l]);
  const colors = labels.map(l => (categories[l] || { color: '#6b7280' }).color);

  const canvas = document.getElementById('chart');
  const wrap   = document.getElementById('chart-wrap');

  if (!labels.length) {
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    wrap.innerHTML = '<div class="empty-msg" style="padding-top:60px">No data yet</div>';
    return;
  }

  // Restore canvas if it was replaced by empty-msg
  if (!canvas || !document.getElementById('chart')) {
    wrap.innerHTML = '<div class="chart-container"><canvas id="chart"></canvas></div>';
  }

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(document.getElementById('chart'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 10,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 11 },
            padding: 14,
            boxWidth: 12, boxHeight: 12,
            color: darkMode ? '#94a3b8' : '#64748b',
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + fmt(ctx.raw)
          }
        }
      }
    }
  });
}

// ── Monthly summary ────────────────────────────────────────────────────────
function getMonthKeys() {
  const keys = [...new Set(transactions.map(t => t.monthKey))];
  keys.sort((a, b) => b.localeCompare(a));
  return keys;
}

function setActiveMonth() {
  const keys = getMonthKeys();
  activeMonth = keys[0] || new Date().toISOString().slice(0, 7);
}

function buildMonthTabs() {
  const keys = getMonthKeys();
  if (!keys.length) {
    activeMonth = new Date().toISOString().slice(0, 7);
    keys.push(activeMonth);
  }
  if (!keys.includes(activeMonth)) activeMonth = keys[0];

  const wrap = document.getElementById('month-tabs');
  wrap.innerHTML = keys.map(k => {
    const [y, m] = k.split('-');
    const label = new Date(+y, +m - 1, 1).toLocaleDateString('en-GB', { month:'short', year:'numeric' });
    return `<button class="m-tab${k === activeMonth ? ' active' : ''}" data-month="${k}">${label}</button>`;
  }).join('');
}

function renderSummary() {
  const list  = transactions.filter(t => t.monthKey === activeMonth);
  const total = list.reduce((s, t) => s + t.amount, 0);
  const count = list.length;

  // Per-category breakdown
  const catSpend = {};
  list.forEach(t => { catSpend[t.category] = (catSpend[t.category] || 0) + t.amount; });
  const topCat = Object.entries(catSpend).sort((a, b) => b[1] - a[1])[0];

  const grid = document.getElementById('summary-grid');
  grid.innerHTML = `
    <div class="summary-box">
      <div class="s-label">Total Spent</div>
      <div class="s-val red">${fmt(total)}</div>
    </div>
    <div class="summary-box">
      <div class="s-label">Transactions</div>
      <div class="s-val">${count}</div>
    </div>
    <div class="summary-box">
      <div class="s-label">Avg per Transaction</div>
      <div class="s-val">${count ? fmt(Math.round(total / count)) : '—'}</div>
    </div>
    <div class="summary-box">
      <div class="s-label">Top Category</div>
      <div class="s-val">${topCat ? topCat[0] : '—'}</div>
    </div>
  `;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(n) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}
