import { participants } from '/data/predictions.mjs';
import { teamToEnglish, teamToFinnish, toEnglish } from '/data/teams.mjs';
import { calculateScore, scoreBreakdown, tiebreaker, calculateMaxScore } from '/js/scoring.js';

const EMPTY_RESULTS = {
  groups: {}, top16: [], top8: [], top4: [], top2: [], winner: null,
  stagesComplete: { groups: false, top16: false, top8: false, top4: false, top2: false, final: false },
  lastUpdated: null,
};

async function fetchResults() {
  try {
    const r = await fetch('/api/get-results');
    if (!r.ok) throw new Error('API virhe');
    return await r.json();
  } catch {
    return EMPTY_RESULTS;
  }
}

async function fetchOracle() {
  try {
    const r = await fetch('/api/get-oracle');
    if (!r.ok) throw new Error('API virhe');
    return await r.json();
  } catch {
    return null;
  }
}

// ── Pääsivu (index.html) ──────────────────────────────
async function initIndex() {
  const [results, oracle] = await Promise.all([fetchResults(), fetchOracle()]);
  renderOracle(oracle, results);
  renderLeaderboard(results);
}

function renderOracle(oracle, results) {
  const leaderEl  = document.getElementById('oracle-leader');
  const subtitleEl = document.getElementById('oracle-subtitle');
  const barsEl    = document.getElementById('oracle-bars');
  const updatedEl = document.getElementById('oracle-updated');

  if (!oracle || !oracle.ranking || oracle.ranking.length === 0) {
    // Fallback: laske pisteet suoraan jos API ei vastaa
    const ranking = buildLocalRanking(results);
    renderOracleBars(barsEl, ranking);
    leaderEl.textContent = ranking[0]?.name ?? '–';
    subtitleEl.textContent = 'Todennäköinen kisaveikkauksen voittaja';
    updatedEl.textContent = results.lastUpdated
      ? 'Päivitetty ' + formatTime(results.lastUpdated)
      : 'Tuloksia ei vielä saatavilla – turnaus käynnissä';
    return;
  }

  leaderEl.textContent = oracle.ranking[0].name;
  subtitleEl.textContent = oracle.ranking[0].text || 'Todennäköinen kisaveikkauksen voittaja';
  renderOracleBars(barsEl, oracle.ranking);
  updatedEl.textContent = oracle.lastUpdated
    ? 'Päivitetty ' + formatTime(oracle.lastUpdated)
    : '';

  // Satunnaisen bottom-4 pelaajan naljailu
  const roast = oracle.roastTarget;
  if (roast?.name && roast?.text) {
    let roastEl = document.getElementById('oracle-roast');
    if (!roastEl) {
      roastEl = document.createElement('p');
      roastEl.id = 'oracle-roast';
      roastEl.className = 'oracle-roast';
      updatedEl.before(roastEl);
    }
    roastEl.textContent = `💬 ${roast.name}: "${roast.text}"`;
  }
}

function buildLocalRanking(results) {
  return [...participants]
    .map(p => ({ name: p.name, score: calculateScore(p, results) }))
    .sort((a, b) => b.score - a.score);
}

function renderOracleBars(container, ranking) {
  const max = Math.max(...ranking.map(r => r.normalizedScore ?? r.score ?? 1), 1);
  container.innerHTML = ranking.map(r => {
    const val = r.normalizedScore ?? r.score ?? 0;
    const pct = max > 0 ? Math.round((val / max) * 100) : 0;
    return `
      <div class="oracle-bar-item">
        <span class="oracle-bar-name">${r.name}</span>
        <div class="oracle-bar-track">
          <div class="oracle-bar-fill" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');
}

function renderLeaderboard(results) {
  const tbody = document.getElementById('leaderboard-body');
  const note  = document.getElementById('leaderboard-note');

  const scored = participants
    .map(p => ({ p, bd: scoreBreakdown(p, results) }))
    .sort((a, b) => b.bd.total - a.bd.total || tiebreaker(a.p, b.p, results));

  const anyPoints = scored.some(s => s.bd.total > 0);
  note.textContent = anyPoints
    ? ''
    : 'Turnaus käynnissä – pisteet päivittyvät ottelutulosten myötä.';

  let rank = 1;
  tbody.innerHTML = scored.map(({ p, bd }, i) => {
    if (i > 0) {
      const prev = scored[i - 1];
      if (bd.total < prev.bd.total) rank = i + 1;
    }
    const isFirst = rank === 1;
    const rankDisp = isFirst ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    return `
      <tr class="${isFirst ? 'rank-1' : ''}">
        <td class="rank ${isFirst ? 'rank-1-cell' : ''}">${rankDisp}</td>
        <td class="player-name">${p.name}</td>
        <td class="pts-total">${bd.total}</td>
        <td class="pts-sub">${bd.lohko}</td>
        <td class="pts-sub">${bd.t16}</td>
        <td class="pts-sub">${bd.t8}</td>
        <td class="pts-sub">${bd.t4}</td>
        <td class="pts-sub">${bd.t2}</td>
        <td class="pts-sub">${bd.win ? '✓' : '–'}</td>
      </tr>`;
  }).join('');
}

// ── Ennusteet-sivu (ennusteet.html) ──────────────────
async function initEnnusteet() {
  const results = await fetchResults();
  renderPredictions(results);
}

function renderPredictions(results) {
  const top16Set = new Set(results.top16 || []);
  const top8Set  = new Set(results.top8  || []);
  const top4Set  = new Set(results.top4  || []);
  const top2Set  = new Set(results.top2  || []);
  const winnerEn = results.winner;

  const eliminatedSet = new Set(results.eliminated || []);

  function teamStatus(finnishName) {
    const en = teamToEnglish(finnishName);
    if (winnerEn && en === winnerEn) return 'advancing';
    if (top2Set.has(en)) return 'advancing';
    if (top4Set.has(en)) return 'advancing';
    if (top8Set.has(en)) return 'advancing';
    if (top16Set.has(en)) return 'advancing';
    if (eliminatedSet.has(en)) return 'eliminated';
    return 'unknown';
  }

  function chip(name) {
    const status = teamStatus(name);
    return `<span class="team-chip ${status}">${name}</span>`;
  }

  const sections = [
    { label: 'Lohkovoittajat', key: 'groupWinners' },
    { label: 'Top 16', key: 'top16' },
    { label: 'Top 8',  key: 'top8'  },
    { label: 'Top 4',  key: 'top4'  },
    { label: 'Finalistit', key: 'top2' },
  ];

  const table = document.getElementById('predictions-table');
  const thead = table.querySelector('thead tr');
  const tbody = table.querySelector('tbody');

  // Header: pelaajat
  thead.innerHTML = `<th class="row-header">Vaihe</th>` +
    participants.map(p => `<th>${p.name}</th>`).join('');

  // Body
  const rows = [];

  // Maksimipisteet-rivi (ylin)
  const maxCells = participants.map(p => {
    const max = calculateMaxScore(p, results);
    return `<td class="max-pts-cell">${max}</td>`;
  }).join('');
  rows.push(`<tr class="max-pts-row"><td class="row-header max-pts-label">Maksimipisteet</td>${maxCells}</tr>`);

  sections.forEach(({ label, key }) => {
    // Otsikkorivi: nimi vasemmalla, pienellä pelaajan nimi per sarake
    rows.push(`<tr><td class="stage-header stage-label">${label}</td>` +
      participants.map(p => `<td class="stage-header player-mini">${p.name}</td>`).join('') +
    `</tr>`);

    const maxLen = Math.max(...participants.map(p => (p[key] || []).length));
    for (let i = 0; i < maxLen; i++) {
      const cells = participants.map(p => {
        const team = (p[key] || [])[i];
        return `<td>${team ? chip(team) : ''}</td>`;
      }).join('');
      rows.push(`<tr><td class="row-header">${i + 1}</td>${cells}</tr>`);
    }
  });

  // Voittaja-rivi
  rows.push(`<tr><td class="stage-header stage-label">Voittaja</td>` +
    participants.map(p => `<td class="stage-header player-mini">${p.name}</td>`).join('') +
  `</tr>`);
  const winnerCells = participants.map(p => {
    const isCorrect = winnerEn && teamToEnglish(p.winner) === winnerEn;
    return `<td><span class="${isCorrect ? 'winner-chip' : 'team-chip unknown'}">${p.winner} ${isCorrect ? '🏆' : ''}</span></td>`;
  }).join('');
  rows.push(`<tr><td class="row-header">🏆</td>${winnerCells}</tr>`);

  tbody.innerHTML = rows.join('');
}

// ── Admin-sivu (admin.html) ──────────────────────────
function initAdmin() {
  const btn     = document.getElementById('force-update-btn');
  const pwInput = document.getElementById('admin-password');
  const statusEl = document.getElementById('update-status');
  const lastEl  = document.getElementById('last-updated');

  // Näytä viimeisin päivitysaika
  fetchResults().then(r => {
    if (r.lastUpdated) {
      lastEl.textContent = 'Viimeisin datahaku: ' + formatTime(r.lastUpdated);
    }
  });

  // Eliminoitujen hallinta
  const elimInput  = document.getElementById('elim-input');
  const elimAddBtn = document.getElementById('elim-add-btn');

  if (elimAddBtn) {
    elimAddBtn.addEventListener('click', async () => {
      const fi = elimInput?.value.trim();
      if (!fi) return;
      const en = teamToEnglish(fi);
      if (!elimTeams.includes(en)) elimTeams.push(en);
      if (elimInput) elimInput.value = '';
      await saveEliminated();
    });
  }

  // Nimiopas
  const guide = document.getElementById('elim-name-guide');
  if (guide) {
    const primary = Object.entries(toEnglish).filter(([fi]) =>
      !['Equador', 'Alankomaat', 'Mexico', 'Croatia'].includes(fi)
    );
    guide.innerHTML = primary
      .sort(([a], [b]) => a.localeCompare(b, 'fi'))
      .map(([fi, en]) => `<span><b>${fi}</b> → ${en}</span>`)
      .join('');
  }

  loadEliminated();

  btn.addEventListener('click', async () => {
    const pw = pwInput.value.trim();
    if (!pw) { showStatus(statusEl, 'Syötä salasana.', 'error'); return; }

    btn.disabled = true;
    btn.textContent = '⏳ Haetaan...';
    showStatus(statusEl, 'Haetaan tuloksia football-data.org:sta...', 'info');

    try {
      const r = await fetch('/api/force-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': pw },
      });
      if (r.status === 401) { showStatus(statusEl, 'Väärä salasana.', 'error'); return; }
      if (!r.ok) throw new Error('Virhe: ' + r.status);
      const data = await r.json();
      showStatus(statusEl, `✓ Päivitetty! Lohkovaihe: ${Object.keys(data.groups || {}).length} ryhmää käsitelty.`, 'success');
      lastEl.textContent = 'Viimeisin datahaku: ' + formatTime(new Date().toISOString());
    } catch (e) {
      showStatus(statusEl, 'Virhe: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '🔄 Pakota päivitys nyt';
    }
  });
}

// ── Eliminoitujen hallinta (admin) ───────────────────
let elimTeams = [];

async function loadEliminated() {
  const r = await fetch('/api/eliminated-admin');
  elimTeams = r.ok ? await r.json() : [];
  renderElimList();

  const autoEl = document.getElementById('elim-auto-list');
  if (autoEl) {
    try {
      const res = await fetch('/api/get-results');
      const data = res.ok ? await res.json() : {};
      const autoOnly = (data.eliminated || []).filter(t => !elimTeams.includes(t));
      autoEl.innerHTML = autoOnly.length > 0
        ? autoOnly.map(t => `<span style="margin-right:10px">${t}</span>`).join('')
        : '<span>Ei havaittu automaattisesti.</span>';
    } catch {
      autoEl.textContent = 'Ei saatavilla.';
    }
  }
}

function renderElimList() {
  const elimList = document.getElementById('elim-list');
  if (!elimList) return;
  if (elimTeams.length === 0) {
    elimList.innerHTML = '<p style="font-size:.82rem;color:var(--text-muted)">Ei manuaalisesti lisättyjä.</p>';
    return;
  }
  elimList.innerHTML = elimTeams.map(t =>
    `<div style="display:flex;align-items:center;gap:8px;margin:4px 0">
      <span style="flex:1;font-size:.9rem">${t}</span>
      <button class="btn" style="padding:2px 8px;font-size:.8rem" onclick="removeElim('${t.replace(/'/g, "\\'")}')">✕</button>
    </div>`
  ).join('');
}

window.removeElim = async (team) => {
  elimTeams = elimTeams.filter(t => t !== team);
  await saveEliminated();
};

async function saveEliminated() {
  const pwInput = document.getElementById('admin-password');
  const elimStatus = document.getElementById('elim-status');
  const pw = pwInput?.value.trim();
  if (!pw) { showStatus(elimStatus, 'Anna salasana ensin.', 'error'); return; }
  const r = await fetch('/api/eliminated-admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Password': pw },
    body: JSON.stringify({ teams: elimTeams }),
  });
  if (r.ok) {
    showStatus(elimStatus, '✓ Tallennettu!', 'success');
    renderElimList();
  } else {
    showStatus(elimStatus, r.status === 401 ? 'Väärä salasana.' : 'Virhe tallennuksessa.', 'error');
  }
}

function showStatus(el, msg, type) {
  el.textContent = msg;
  el.className = 'status-msg ' + type;
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString('fi-FI', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

// ── Reititys ─────────────────────────────────────────
const page = document.body.dataset.page;
if (page === 'index')      initIndex();
if (page === 'ennusteet')  initEnnusteet();
if (page === 'admin')      initAdmin();
