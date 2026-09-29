/* =========================================================
   Student Performance Dashboard — frontend logic
   Plain JavaScript. No frameworks, no build step.
   ========================================================= */
'use strict';

// =========================================================
// CONFIGURATION  —  the only thing you need to change
// =========================================================
// Paste your Google Apps Script Web App URL between the quotes.
// It looks like: https://script.google.com/macros/s/AKfycb..../exec
// Do NOT put passwords, keys or tokens in this file — it is public.
const API_URL = "https://script.google.com/a/macros/xylemlearning.com/s/AKfycbyy1Ggrgc-q8oi2PzRa4uDipDM3Ta2FslLoUeYscdwgQyedCP-9_3IpXhi2zLELSfbj/exec";

// Optional: how many rows each table page shows.
const PAGE_SIZE = 50;
// =========================================================


/* ---------- Column definitions (names must match Code.gs) ---------- */
const COLUMNS = [
  { key: 'Sl No', numeric: true },
  { key: 'Roll No' },
  { key: 'Name', cls: 'col-name' },
  { key: 'PHY', numeric: true },
  { key: 'CHE', numeric: true },
  { key: 'MATH/BIO', numeric: true },
  { key: 'Total', numeric: true },
  { key: 'Rank', numeric: true },
  { key: 'Exam Centre' },
  { key: 'Scholarship' },
  { key: 'JEE/NEET' },
  { key: 'District' },
  { key: 'School', cls: 'col-school' },
  { key: 'Code' }
];

/** Dashboard dropdown filters: element id → field */
const FILTERS = [
  { id: 'fDistrict', field: 'District' },
  { id: 'fSchool', field: 'School' },
  { id: 'fCentre', field: 'Exam Centre' },
  { id: 'fScholarship', field: 'Scholarship' },
  { id: 'fExam', field: 'JEE/NEET' },
  { id: 'fCode', field: 'Code' }
];

/** Summary tables: element id → field */
const SUMMARIES = [
  { id: 'sumDistrict', field: 'District' },
  { id: 'sumSchool', field: 'School' },
  { id: 'sumCentre', field: 'Exam Centre' },
  { id: 'sumScholarship', field: 'Scholarship' },
  { id: 'sumExam', field: 'JEE/NEET' }
];

const SEARCH_FIELDS = ['Roll No', 'Name', 'School', 'Code', 'District', 'Exam Centre'];
const EXPECTED_HEADERS = COLUMNS.map(c => c.key);
const DASH = '—';
const BLANK_KEY = '__blank__';
const SUMMARY_LIMIT = 8;          // rows shown before "Show all"
const MAX_SCHOOL_OPTIONS = 100;   // options rendered in the school dropdown at once
const NO_SCHOLARSHIP = new Set(['', 'no', 'nil', 'none', 'n/a', 'na', '-', '—', '0', '0%', 'not eligible']);
const SHEET_ERRORS = /^#(N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|ERROR!)$/i;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/* ---------- App state (everything lives in memory) ---------- */
const state = {
  loaded: false,
  rows: [],              // all student rows from the Sheet
  filtered: [],          // rows after dashboard filters + search
  filters: {},           // field → selected key
  search: '',
  schools: [],           // [{ key, label, count, loose, compact }]
  selectedSchool: '',    // key of the selected school
  lastUpdated: null
};

let dashTable, schoolTable;
let isLoading = false;
const expandedSummaries = new Set();

/* =========================================================
   Small helpers
   ========================================================= */
const $ = id => document.getElementById(id);

/** Turns any cell value into a clean string ('' for missing). */
function clean(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  if (s === 'undefined' || s === 'null' || s === 'NaN' || SHEET_ERRORS.test(s)) return '';
  return s;
}
/** Comparison key: trimmed, single spaces, lower case. */
function keyOf(v) { return clean(v).replace(/\s+/g, ' ').toLowerCase(); }
/** Search form: lower case, apostrophes removed, other punctuation → space. */
function loose(v) {
  return clean(v).toLowerCase().replace(/['’`]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
/** Search form with no spaces at all (so "SCH001" finds "SCH-001"). */
function compact(v) { return loose(v).replace(/ /g, ''); }
/** Number or null (blank stays null — never 0). */
function toNumber(v) {
  const s = clean(v).replace(/,/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function display(v) { const s = clean(v); return s === '' ? DASH : s; }
function fmt(n) { return Number(n).toLocaleString('en-IN'); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function isJee(r) { return /\bJEE\b/i.test(r['JEE/NEET']); }
function isNeet(r) { return /\bNEET\b/i.test(r['JEE/NEET']); }
function hasScholarship(r) { return !NO_SCHOLARSHIP.has(r['Scholarship'].toLowerCase()); }
function formatDateTime(d) {
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
}
function announce(msg) { const a = $('announcer'); a.textContent = ''; setTimeout(() => { a.textContent = msg; }, 50); }
function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }

class ApiError extends Error {
  constructor(title, message) { super(message); this.title = title; }
}

/* =========================================================
   Loading data from Google Apps Script
   ========================================================= */
function apiUrlMissing() {
  return !API_URL || API_URL.indexOf('PASTE_YOUR') !== -1 || !/^https:\/\//i.test(API_URL.trim());
}

async function fetchData(fresh) {
  const base = API_URL.trim();
  const url = base + (base.includes('?') ? '&' : '?') + 'action=data' +
              (fresh ? '&fresh=1' : '') + '&_=' + Date.now();

  const controller = ('AbortController' in window) ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 45000) : null;
  let res;
  try {
    // A plain GET with no custom headers — this is what Apps Script allows cross-origin.
    res = await fetch(url, { method: 'GET', signal: controller ? controller.signal : undefined });
  } catch (e) {
    if (e && e.name === 'AbortError') {
      throw new ApiError('Unable to connect to the database.', 'The request took too long. Please try again.');
    }
    throw new ApiError('Unable to connect to the database.',
      'Please try again. If this keeps happening, check your internet connection, the API_URL in script.js, ' +
      'and that the Apps Script Web App is deployed with "Who has access: Anyone".');
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!res.ok) {
    throw new ApiError('Unable to connect to the database.', `The server responded with HTTP ${res.status}. Please try again.`);
  }
  const text = await res.text();
  if (!text || !text.trim()) {
    throw new ApiError('Google Sheet data is unavailable.', 'The API returned an empty response.');
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    const looksLikeHtml = /^\s*</.test(text);
    throw new ApiError('Google Sheet data is unavailable.', looksLikeHtml
      ? 'The API returned a web page instead of data. Usually this means the Web App access is not "Anyone", or API_URL is not the /exec deployment URL.'
      : 'The API response was not valid JSON.');
  }
  if (!json || typeof json !== 'object') {
    throw new ApiError('Google Sheet data is unavailable.', 'The API response was not in the expected format.');
  }
  if (json.success === false) {
    throw new ApiError('Google Sheet data is unavailable.', json.error || 'The API reported an error.');
  }
  if (!Array.isArray(json.data)) {
    throw new ApiError('Google Sheet data is unavailable.', 'The API response did not contain a "data" list. Check that API_URL points to this project\'s Apps Script.');
  }
  return json;
}

async function loadData(fresh) {
  if (isLoading) return;
  const firstLoad = !state.loaded;

  if (apiUrlMissing()) {
    showError('Setup needed', 'Open script.js and paste your Google Apps Script Web App URL into API_URL (near the top of the file). It must start with https:// and end with /exec.');
    return;
  }

  isLoading = true;
  setRefreshing(true);
  if (firstLoad) showLoading();
  $('errorBanner').hidden = true;

  try {
    const json = await fetchData(fresh);
    applyDataset(json);
    if (!firstLoad) announce('Data refreshed.');
  } catch (err) {
    const title = err.title || 'Unable to connect to the database.';
    const msg = err.message || 'Please try again.';
    if (firstLoad) {
      showError(title, msg);
    } else {
      // Keep showing the data we already have.
      const banner = $('errorBanner');
      banner.innerHTML = `<strong>Refresh failed.</strong> ${escapeHtml(msg)} Still showing data from ${escapeHtml(formatDateTime(state.lastUpdated))}.`;
      banner.hidden = false;
    }
  } finally {
    isLoading = false;
    setRefreshing(false);
  }
}

/** Replaces the in-memory dataset and rebuilds everything. */
function applyDataset(json) {
  state.rows = json.data
    .filter(r => r && typeof r === 'object')
    .map(prepareRow)
    .filter(r => r['Name'] || r['Roll No']);

  const d = json.lastUpdated ? new Date(json.lastUpdated) : null;
  state.lastUpdated = (d && !isNaN(d.getTime())) ? d : new Date();
  $('lastUpdated').textContent = 'Last Updated: ' + formatDateTime(state.lastUpdated);

  renderWarnings(json);
  state.schools = buildSchoolList(state.rows);
  buildFilterOptions();
  state.loaded = true;

  hideStates();
  updateDashboard();
  refreshSchoolPicker();
  showView();
}

/** Normalises one row from the API. */
function prepareRow(raw) {
  const r = {};
  COLUMNS.forEach(c => { r[c.key] = clean(raw[c.key]); });
  // Use the first District column; fall back to the second one only if the first is blank.
  if (!r['District']) r['District'] = clean(raw['District 2']);

  r._num = {};
  COLUMNS.forEach(c => { if (c.numeric) r._num[c.key] = toNumber(r[c.key]); });
  r._key = {};
  FILTERS.forEach(f => { r._key[f.field] = keyOf(r[f.field]) || BLANK_KEY; });
  r._loose = SEARCH_FIELDS.map(f => loose(r[f])).join(' | ');
  r._compact = SEARCH_FIELDS.map(f => compact(r[f])).join('|');
  return r;
}

function renderWarnings(json) {
  const list = Array.isArray(json.warnings) ? json.warnings.filter(w => typeof w === 'string' && w) : [];
  if (Array.isArray(json.headers) && json.headers.length) {
    const missing = EXPECTED_HEADERS.filter(h => !json.headers.includes(h));
    if (missing.length && !list.some(w => w.startsWith('Missing columns'))) {
      list.push('Missing columns in the sheet: ' + missing.join(', ') + '.');
    }
  }
  if (!state.rows.length) list.push('No students found in the Google Sheet.');
  const box = $('warningBox');
  if (!list.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.innerHTML = '<strong>Please check the Google Sheet:</strong><ul>' +
    list.map(w => `<li>${escapeHtml(w)}</li>`).join('') + '</ul>';
  box.hidden = false;
}

/* =========================================================
   Page states & navigation
   ========================================================= */
function showLoading() {
  $('loadingState').hidden = false;
  $('errorState').hidden = true;
  document.querySelectorAll('.view').forEach(v => { v.hidden = true; });
}
function showError(title, message) {
  $('loadingState').hidden = true;
  $('errorTitle').textContent = title;
  $('errorMessage').textContent = message;
  $('errorState').hidden = false;
  document.querySelectorAll('.view').forEach(v => { v.hidden = true; });
}
function hideStates() {
  $('loadingState').hidden = true;
  $('errorState').hidden = true;
}
function setRefreshing(on) {
  const btn = $('refreshBtn');
  btn.disabled = on;
  btn.textContent = on ? 'Refreshing…' : 'Refresh Data';
  $('refreshStatus').textContent = on && state.loaded ? 'Fetching latest data…' : '';
}

function currentView() { return location.hash === '#schools' ? 'schools' : 'dashboard'; }

function showView() {
  const view = currentView();
  document.querySelectorAll('.tab').forEach(t => {
    if (t.dataset.view === view) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  if (!state.loaded) return;
  $('view-dashboard').hidden = view !== 'dashboard';
  $('view-schools').hidden = view !== 'schools';
}

/* =========================================================
   Dashboard: filters, search, KPIs, summaries
   ========================================================= */
/** Unique values of a field: [{ key, label, count }], sorted A→Z. */
function uniqueValues(rows, field) {
  const map = new Map();
  let blanks = 0;
  rows.forEach(r => {
    const k = r._key[field];
    if (k === BLANK_KEY) { blanks++; return; }
    if (!map.has(k)) map.set(k, { key: k, label: r[field], count: 0 });
    map.get(k).count++;
  });
  const list = [...map.values()].sort((a, b) => collator.compare(a.label, b.label));
  return { list, blanks };
}

function buildFilterOptions() {
  FILTERS.forEach(f => {
    const sel = $(f.id);
    const { list, blanks } = uniqueValues(state.rows, f.field);
    let html = `<option value="">All (${fmt(list.length)})</option>`;
    html += list.map(o => `<option value="${escapeHtml(o.key)}">${escapeHtml(o.label)}</option>`).join('');
    if (blanks) html += `<option value="${BLANK_KEY}">(Blank)</option>`;
    sel.innerHTML = html;

    // Keep the previous choice after a refresh if it still exists.
    const prev = state.filters[f.field];
    if (prev && (prev === BLANK_KEY ? blanks : list.some(o => o.key === prev))) {
      sel.value = prev;
    } else {
      delete state.filters[f.field];
      sel.value = '';
    }
    sel.classList.toggle('is-active', !!sel.value);
  });
}

function getFilteredRows() {
  const active = FILTERS.filter(f => state.filters[f.field]);
  const ql = loose(state.search);
  const qc = compact(state.search);
  return state.rows.filter(r => {
    for (const f of active) {
      if (r._key[f.field] !== state.filters[f.field]) return false;
    }
    if (ql && !(r._loose.includes(ql) || (qc && r._compact.includes(qc)))) return false;
    return true;
  });
}

function updateDashboard() {
  state.filtered = getFilteredRows();
  renderKpis(state.filtered);
  renderSummaries(state.filtered);
  dashTable.setRows(state.filtered);

  const activeCount = Object.keys(state.filters).length + (loose(state.search) ? 1 : 0);
  $('filterStatus').textContent = activeCount
    ? `${fmt(state.filtered.length)} of ${fmt(state.rows.length)} students · ${activeCount} active`
    : `All ${fmt(state.rows.length)} students`;
}

function countUnique(rows, field) {
  const s = new Set();
  rows.forEach(r => { if (r._key[field] !== BLANK_KEY) s.add(r._key[field]); });
  return s.size;
}

function renderKpis(rows) {
  const jee = rows.filter(isJee).length;
  const neet = rows.filter(isNeet).length;
  const either = rows.filter(r => isJee(r) || isNeet(r)).length;
  const filtered = rows.length !== state.rows.length;

  $('kpiStudents').textContent = fmt(rows.length);
  $('kpiStudentsSub').textContent = filtered ? `of ${fmt(state.rows.length)} total` : 'All records';
  $('kpiSchools').textContent = fmt(countUnique(rows, 'School'));
  $('kpiDistricts').textContent = fmt(countUnique(rows, 'District'));
  $('kpiCentres').textContent = fmt(countUnique(rows, 'Exam Centre'));
  $('kpiExam').textContent = fmt(either);
  $('kpiExamSub').textContent = `JEE ${fmt(jee)} · NEET ${fmt(neet)}`;
}

/** Counts per value, sorted by count (high → low). */
function countBy(rows, field) {
  const map = new Map();
  rows.forEach(r => {
    const k = r._key[field];
    if (!map.has(k)) map.set(k, { label: k === BLANK_KEY ? '(Not specified)' : r[field], blank: k === BLANK_KEY, count: 0 });
    map.get(k).count++;
  });
  return [...map.values()].sort((a, b) => b.count - a.count || collator.compare(a.label, b.label));
}

function renderSummaries(rows) {
  SUMMARIES.forEach(s => renderSummary(s, rows));
}

function renderSummary(s, rows) {
  const body = $(s.id).querySelector('.summary-body');
  const counts = countBy(rows, s.field);
  if (!counts.length) { body.innerHTML = '<p class="empty-note">No students found.</p>'; return; }

  const open = expandedSummaries.has(s.id);
  const shown = open ? counts : counts.slice(0, SUMMARY_LIMIT);
  const max = counts[0].count || 1;
  body.innerHTML =
    `<div class="summary-scroll${open ? ' open' : ''}"><table class="summary-table">
      <thead><tr><th scope="col">${escapeHtml(s.field)}</th><th scope="col" class="num">Student Count</th></tr></thead>
      <tbody>${shown.map(c => `
        <tr>
          <td><div class="bar-label${c.blank ? ' muted' : ''}">${escapeHtml(c.label)}</div>
              <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${Math.max(2, Math.round(c.count / max * 100))}%"></div></div></td>
          <td class="num">${fmt(c.count)}</td>
        </tr>`).join('')}
      </tbody></table></div>` +
    (counts.length > SUMMARY_LIMIT
      ? `<button type="button" class="link-btn" data-summary="${s.id}" aria-expanded="${open}">${open ? 'Show less' : `Show all ${fmt(counts.length)}`}</button>`
      : '');
}

/* =========================================================
   Reusable table with sorting + pagination
   ========================================================= */
function createTableView({ tableId, infoId, pagerId, emptyText }) {
  const table = $(tableId);
  const info = $(infoId);
  const pager = $(pagerId);
  const wrap = table.parentElement;
  const v = { rows: [], sorted: [], sortKey: null, sortDir: 1, page: 1 };

  table.innerHTML =
    '<thead><tr>' + COLUMNS.map(c =>
      `<th scope="col" class="${c.numeric ? 'num' : ''}" aria-sort="none">
         <button type="button" class="sort-btn" data-key="${escapeHtml(c.key)}">${escapeHtml(c.key)}<span class="sort-icon" aria-hidden="true"></span></button>
       </th>`).join('') +
    '</tr></thead><tbody></tbody>';
  const tbody = table.querySelector('tbody');

  table.querySelector('thead').addEventListener('click', e => {
    const btn = e.target.closest('button[data-key]');
    if (!btn) return;
    const k = btn.dataset.key;
    // Click cycle: ascending → descending → original sheet order
    if (v.sortKey !== k) { v.sortKey = k; v.sortDir = 1; }
    else if (v.sortDir === 1) { v.sortDir = -1; }
    else { v.sortKey = null; v.sortDir = 1; }
    v.page = 1;
    applySort();
    render();
  });

  pager.addEventListener('click', e => {
    const btn = e.target.closest('button[data-page]');
    if (!btn || btn.disabled) return;
    v.page = Number(btn.dataset.page);
    render();
    wrap.scrollTop = 0;
    const top = wrap.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight) wrap.scrollIntoView({ block: 'start' });
  });

  function applySort() {
    if (!v.sortKey) { v.sorted = v.rows; return; }
    const col = COLUMNS.find(c => c.key === v.sortKey);
    const k = col.key, dir = v.sortDir;
    // Numbers first, then text, blanks always last.
    const tier = r => col.numeric
      ? (r._num[k] !== null ? 0 : (r[k] ? 1 : 2))
      : (r[k] ? 1 : 2);
    v.sorted = v.rows.slice().sort((a, b) => {
      const ta = tier(a), tb = tier(b);
      if (ta !== tb) return ta - tb;
      if (ta === 0) return (a._num[k] - b._num[k]) * dir;
      if (ta === 1) return collator.compare(a[k], b[k]) * dir;
      return 0;
    });
  }

  function render() {
    const total = v.sorted.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    v.page = Math.min(Math.max(1, v.page), pages);
    const start = (v.page - 1) * PAGE_SIZE;
    const slice = v.sorted.slice(start, start + PAGE_SIZE);

    if (!total) {
      tbody.innerHTML = `<tr><td class="empty-cell" colspan="${COLUMNS.length}">${escapeHtml(emptyText)}</td></tr>`;
    } else {
      tbody.innerHTML = slice.map(r => '<tr>' + COLUMNS.map(c => {
        const val = r[c.key];
        const cls = [c.numeric ? 'num' : '', c.cls || '', val ? '' : 'is-blank'].filter(Boolean).join(' ');
        return `<td${cls ? ` class="${cls}"` : ''}>${escapeHtml(display(val))}</td>`;
      }).join('') + '</tr>').join('');
    }

    info.textContent = total
      ? `Showing ${fmt(start + 1)}–${fmt(start + slice.length)} of ${fmt(total)} students`
      : 'No students found.';

    // Header sort indicators
    table.querySelectorAll('thead th').forEach((th, i) => {
      const k = COLUMNS[i].key;
      const sorted = v.sortKey === k;
      th.setAttribute('aria-sort', sorted ? (v.sortDir === 1 ? 'ascending' : 'descending') : 'none');
      th.querySelector('.sort-icon').textContent = sorted ? (v.sortDir === 1 ? '▲' : '▼') : '';
    });

    renderPager(pages);
  }

  function renderPager(pages) {
    if (pages <= 1) { pager.innerHTML = ''; return; }
    const cur = v.page;
    let html = `<button type="button" data-page="${cur - 1}" ${cur === 1 ? 'disabled' : ''}>Previous</button>`;
    pageList(cur, pages).forEach(p => {
      html += p === '…'
        ? '<span class="gap" aria-hidden="true">…</span>'
        : `<button type="button" data-page="${p}" ${p === cur ? 'aria-current="page"' : ''} aria-label="Page ${p}">${p}</button>`;
    });
    html += `<button type="button" data-page="${cur + 1}" ${cur === pages ? 'disabled' : ''}>Next</button>`;
    pager.innerHTML = html;
  }

  return {
    setRows(rows) { v.rows = rows; v.page = 1; applySort(); render(); },
    getRows() { return v.sorted; }   // all rows (every page) in the current sort order
  };
}

/** Page numbers with gaps, e.g. 1 … 4 5 6 … 20 */
function pageList(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  let s = Math.max(2, cur - 1), e = Math.min(total - 1, cur + 1);
  if (cur <= 3) { s = 2; e = 4; }
  if (cur >= total - 2) { s = total - 3; e = total - 1; }
  const out = [1];
  if (s > 2) out.push('…');
  for (let i = s; i <= e; i++) out.push(i);
  if (e < total - 1) out.push('…');
  out.push(total);
  return out;
}

/* =========================================================
   Schools page
   ========================================================= */
function buildSchoolList(rows) {
  const map = new Map();
  rows.forEach(r => {
    const k = r._key['School'];
    if (k === BLANK_KEY) return;
    if (!map.has(k)) map.set(k, { key: k, label: r['School'], count: 0, loose: loose(r['School']), compact: compact(r['School']) });
    map.get(k).count++;
  });
  return [...map.values()].sort((a, b) => collator.compare(a.label, b.label));
}

function selectedSchoolObj() { return state.schools.find(s => s.key === state.selectedSchool) || null; }

function schoolMatches(query) {
  const ql = loose(query), qc = compact(query);
  if (!ql) return state.schools;
  const starts = [], contains = [];
  state.schools.forEach(s => {
    if (s.loose.startsWith(ql) || s.compact.startsWith(qc)) starts.push(s);
    else if (s.loose.includes(ql) || s.compact.includes(qc)) contains.push(s);
  });
  return starts.concat(contains);
}

/* ---- Searchable dropdown (combobox) ---- */
const combo = { active: -1, matches: [] };

function comboOpen() {
  if (!state.loaded) return;
  comboRender();
  $('schoolList').hidden = false;
  $('schoolInput').setAttribute('aria-expanded', 'true');
}
function comboClose() {
  $('schoolList').hidden = true;
  const input = $('schoolInput');
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
  combo.active = -1;
}
function comboRender() {
  const input = $('schoolInput');
  const list = $('schoolList');
  const sel = selectedSchoolObj();
  // When the box still shows the selected school, list every school.
  const query = sel && input.value === sel.label ? '' : input.value;
  combo.matches = schoolMatches(query);

  if (!state.schools.length) {
    list.innerHTML = '<li class="combo-note" role="presentation">No schools found.</li>';
    return;
  }
  if (!combo.matches.length) {
    list.innerHTML = '<li class="combo-note" role="presentation">No schools match your search.</li>';
    input.removeAttribute('aria-activedescendant');
    return;
  }
  const shown = combo.matches.slice(0, MAX_SCHOOL_OPTIONS);
  list.innerHTML = shown.map((s, i) =>
    `<li id="schoolOpt${i}" role="option" data-index="${i}"
         class="combo-option${i === combo.active ? ' active' : ''}"
         aria-selected="${s.key === state.selectedSchool}">
       <span>${escapeHtml(s.label)}</span><span class="combo-count">${fmt(s.count)} students</span>
     </li>`).join('') +
    (combo.matches.length > shown.length
      ? `<li class="combo-note" role="presentation">Showing ${shown.length} of ${fmt(combo.matches.length)} schools — keep typing to narrow down.</li>`
      : '');

  if (combo.active >= 0) {
    input.setAttribute('aria-activedescendant', 'schoolOpt' + combo.active);
    const el = $('schoolOpt' + combo.active);
    if (el) el.scrollIntoView({ block: 'nearest' });
  } else {
    input.removeAttribute('aria-activedescendant');
  }
}
function comboChoose(s) {
  if (!s) return;
  state.selectedSchool = s.key;
  $('schoolInput').value = s.label;
  $('schoolClear').hidden = false;
  comboClose();
  renderSchoolDetail();
  announce(`${s.label} selected, ${s.count} students.`);
}
function comboRestore() {
  const sel = selectedSchoolObj();
  if (sel) $('schoolInput').value = sel.label;
}

function initSchoolCombo() {
  const input = $('schoolInput');
  const list = $('schoolList');

  input.addEventListener('focus', comboOpen);
  input.addEventListener('click', comboOpen);
  input.addEventListener('input', () => {
    combo.active = input.value.trim() ? 0 : -1;
    comboOpen();
  });
  input.addEventListener('keydown', e => {
    const last = Math.min(combo.matches.length, MAX_SCHOOL_OPTIONS) - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (list.hidden) comboOpen();
      combo.active = Math.min(combo.active + 1, last);
      comboRender();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      combo.active = Math.max(combo.active - 1, 0);
      comboRender();
    } else if (e.key === 'Enter') {
      if (list.hidden) return;
      e.preventDefault();
      if (combo.active >= 0) comboChoose(combo.matches[combo.active]);
      else if (combo.matches.length === 1) comboChoose(combo.matches[0]);
    } else if (e.key === 'Escape') {
      if (!list.hidden) { e.preventDefault(); comboClose(); comboRestore(); }
    } else if (e.key === 'Tab') {
      comboClose();
    }
  });
  input.addEventListener('blur', () => setTimeout(() => {
    if (document.activeElement !== input) { comboClose(); comboRestore(); }
  }, 150));

  list.addEventListener('mousedown', e => e.preventDefault()); // keep focus in the input
  list.addEventListener('click', e => {
    const li = e.target.closest('[data-index]');
    if (li) comboChoose(combo.matches[Number(li.dataset.index)]);
  });

  $('schoolClear').addEventListener('click', () => {
    state.selectedSchool = '';
    input.value = '';
    $('schoolClear').hidden = true;
    renderSchoolDetail();
    input.focus();
  });
}

/** Called after every data load. */
function refreshSchoolPicker() {
  const note = $('schoolCountNote');
  note.textContent = state.schools.length
    ? `${fmt(state.schools.length)} schools available. Type part of a name, e.g. "St Mary".`
    : 'No schools found.';
  if (state.selectedSchool && !selectedSchoolObj()) {
    state.selectedSchool = '';
    $('schoolInput').value = '';
    $('schoolClear').hidden = true;
    announce('The selected school is no longer in the data.');
  }
  comboRestore();
  if (!$('schoolList').hidden) comboRender();
  renderSchoolDetail();
}

function renderSchoolDetail() {
  const sel = selectedSchoolObj();
  if (!sel) {
    $('schoolPlaceholder').hidden = false;
    $('schoolDetail').hidden = true;
    return;
  }
  const rows = state.rows.filter(r => r._key['School'] === sel.key);
  $('schoolPlaceholder').hidden = true;
  $('schoolDetail').hidden = false;

  $('schoolName').textContent = sel.label;
  $('schoolCount').textContent = fmt(rows.length);

  const codes = [...new Set(rows.map(r => r['Code']).filter(Boolean))];
  const districts = [...new Set(rows.map(r => r['District']).filter(Boolean))];
  const meta = [];
  if (codes.length) meta.push('Code: ' + codes.slice(0, 3).join(', ') + (codes.length > 3 ? '…' : ''));
  if (districts.length) meta.push('District: ' + districts.slice(0, 3).join(', ') + (districts.length > 3 ? '…' : ''));
  $('schoolMeta').textContent = meta.join('  ·  ');

  const totals = rows.map(r => r._num['Total']).filter(n => n !== null);
  const ranks = rows.map(r => r._num['Rank']).filter(n => n !== null);
  const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : null;

  $('statStudents').textContent = fmt(rows.length);
  $('statAvg').textContent = avg === null ? DASH : avg.toLocaleString('en-IN', { maximumFractionDigits: 1 });
  $('statTopRank').textContent = ranks.length ? fmt(Math.min(...ranks)) : DASH;
  $('statJee').textContent = fmt(rows.filter(isJee).length);
  $('statNeet').textContent = fmt(rows.filter(isNeet).length);
  $('statScholar').textContent = fmt(rows.filter(hasScholarship).length);

  schoolTable.setRows(rows);
}

/* =========================================================
   Copy to Excel (TAB-separated) and CSV export
   ========================================================= */
function rowsToTSV(rows) {
  const cell = v => clean(v).replace(/[\t\r\n]+/g, ' ');
  const lines = [COLUMNS.map(c => c.key).join('\t')];
  rows.forEach(r => lines.push(COLUMNS.map(c => cell(r[c.key])).join('\t')));
  return lines.join('\n');
}

function rowsToCSV(rows) {
  const q = v => {
    const s = clean(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [COLUMNS.map(c => q(c.key)).join(',')];
  rows.forEach(r => lines.push(COLUMNS.map(c => q(r[c.key])).join(',')));
  return '﻿' + lines.join('\r\n'); // BOM so Excel reads Malayalam/Unicode correctly
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
  }
  // Fallback for older browsers / non-https pages
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

async function handleCopy(btn, rows) {
  if (!rows.length) { flashButton(btn, 'Nothing to copy'); return; }
  const ok = await copyText(rowsToTSV(rows));
  flashButton(btn, ok ? 'Copied!' : 'Copy failed');
  announce(ok
    ? `Copied ${rows.length} rows. Paste into Excel or Google Sheets.`
    : 'Copy failed. Your browser blocked clipboard access — try Export CSV instead.');
}

function flashButton(btn, text) {
  const original = btn.dataset.label || btn.textContent;
  btn.dataset.label = original;
  btn.textContent = text;
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.textContent = original; }, 2000);
}

function downloadCSV(rows, name) {
  if (!rows.length) return;
  const blob = new Blob([rowsToCSV(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'students') + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* =========================================================
   Start-up
   ========================================================= */
function bindEvents() {
  $('refreshBtn').addEventListener('click', () => loadData(true));
  $('retryBtn').addEventListener('click', () => loadData(true));
  window.addEventListener('hashchange', showView);

  FILTERS.forEach(f => {
    $(f.id).addEventListener('change', e => {
      const val = e.target.value;
      if (val) state.filters[f.field] = val; else delete state.filters[f.field];
      e.target.classList.toggle('is-active', !!val);
      updateDashboard();
    });
  });

  $('searchInput').addEventListener('input', debounce(e => {
    state.search = e.target.value;
    updateDashboard();
  }, 150));

  $('resetBtn').addEventListener('click', () => {
    state.filters = {};
    state.search = '';
    $('searchInput').value = '';
    FILTERS.forEach(f => { $(f.id).value = ''; $(f.id).classList.remove('is-active'); });
    updateDashboard();
    announce('Filters reset.');
  });

  $('summaryGrid').addEventListener('click', e => {
    const btn = e.target.closest('button[data-summary]');
    if (!btn) return;
    const id = btn.dataset.summary;
    if (expandedSummaries.has(id)) expandedSummaries.delete(id); else expandedSummaries.add(id);
    renderSummary(SUMMARIES.find(s => s.id === id), state.filtered);
    const again = $(id).querySelector('button[data-summary]');
    if (again) again.focus();
  });

  $('dashCopyBtn').addEventListener('click', e => handleCopy(e.currentTarget, dashTable.getRows()));
  $('dashCsvBtn').addEventListener('click', () => downloadCSV(dashTable.getRows(), 'students'));
  $('schoolCopyBtn').addEventListener('click', e => handleCopy(e.currentTarget, schoolTable.getRows()));
  $('schoolCsvBtn').addEventListener('click', () => {
    const sel = selectedSchoolObj();
    downloadCSV(schoolTable.getRows(), sel ? sel.label : 'school');
  });
}

function init() {
  dashTable = createTableView({ tableId: 'dashTable', infoId: 'dashInfo', pagerId: 'dashPager', emptyText: 'No students found.' });
  schoolTable = createTableView({ tableId: 'schoolTable', infoId: 'schoolInfo', pagerId: 'schoolPager', emptyText: 'No students found for this school.' });
  bindEvents();
  initSchoolCombo();
  showView();
  loadData(false);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
