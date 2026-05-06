// ─── LIGA OOM STANDINGS (Prvá liga + Ženská liga) ────────────────

const OOM_PLACEMENT_PRVA  = { 1: 34, 2: 26, 3: 18, 4: 18, 5: 10, 6: 10, 7: 10, 8: 10 };
const OOM_PLACEMENT_ZENSKA = { 1: 30, 2: 20, 3: 10, 4: 10 };
const OOM_ENTRY_PT  = 2;
const OOM_KO_WIN_PT = 2;
const OOM_RR_W = 2;
const OOM_RR_D = 1;

// ─── SHARED HELPERS ──────────────────────────────────────────────

function oomIterStages(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') return Object.values(val);
  return [];
}

function oomGetPlacement(tpid, tTable) {
  if (!tTable || tTable.length < 2) return null;
  const n = tTable.length;
  if (tTable[n - 1].includes(tpid)) return 1;
  if (tTable[n - 2].includes(tpid)) return 2;
  if (n >= 3 && tTable[n - 3].includes(tpid) && !tTable[n - 2].includes(tpid)) return 3;
  if (tTable[0].includes(tpid) && !tTable[1].includes(tpid)) return 5;
  return null;
}

function oomScoreRound(data, placementPts, koWinPt = OOM_KO_WIN_PT) {
  const scores = new Map();
  function get(tpid) {
    if (!scores.has(tpid)) scores.set(tpid, {
      name: '', pts: 0, rounds: 0,
      matchesWon: 0, legsFor: 0, legsAgainst: 0,
      p1: 0, p2: 0, p3: 0, p5: 0
    });
    return scores.get(tpid);
  }

  (data.entry_list || []).forEach(p => {
    if (!p.tpid) return;
    const s = get(p.tpid);
    s.name = p.name || '';
    s.pts += OOM_ENTRY_PT;
    s.rounds = 1;
  });

  for (const stage of oomIterStages(data.rr_result)) {
    for (const [pid, opps] of Object.entries(stage || {})) {
      for (const [oid, stats] of Object.entries(opps || {})) {
        if (pid >= oid) continue;
        const rA = stats?.r ?? 0;
        const rB = stage?.[oid]?.[pid]?.r ?? 0;
        get(pid).legsFor     += rA;
        get(pid).legsAgainst += rB;
        get(oid).legsFor     += rB;
        get(oid).legsAgainst += rA;
        if (rA > rB)      { get(pid).pts += OOM_RR_W; get(pid).matchesWon++; }
        else if (rB > rA) { get(oid).pts += OOM_RR_W; get(oid).matchesWon++; }
        else              { get(pid).pts += OOM_RR_D; get(oid).pts += OOM_RR_D; }
      }
    }
  }

  for (const stage of oomIterStages(data.t_result)) {
    for (const [pid, opps] of Object.entries(stage || {})) {
      for (const [oid, stats] of Object.entries(opps || {})) {
        if (pid >= oid) continue;
        const rA = stats?.r ?? 0;
        const rB = stage?.[oid]?.[pid]?.r ?? 0;
        get(pid).legsFor     += rA;
        get(pid).legsAgainst += rB;
        get(oid).legsFor     += rB;
        get(oid).legsAgainst += rA;
        if (rA > rB)      { get(pid).pts += koWinPt; get(pid).matchesWon++; }
        else if (rB > rA) { get(oid).pts += koWinPt; get(oid).matchesWon++; }
      }
    }
  }

  const tTable = data.t_table;
  if (tTable && tTable.length >= 2) {
    for (const [tpid, s] of scores) {
      const pl = oomGetPlacement(tpid, tTable);
      if (pl !== null) {
        s.pts += placementPts[pl] || 0;
        if (pl === 1)      s.p1++;
        else if (pl === 2) s.p2++;
        else if (pl === 3) s.p3++;
        else               s.p5++;
      }
    }
  }

  return scores;
}

async function oomFetchRound(tdid) {
  const url = `https://api.n01darts.com/n01/tournament/n01_tournament.php?cmd=get_data&tdid=${tdid}`;
  return fetchWithTimeout(CORS_PROXY + encodeURIComponent(url), 10000);
}

// whitelist = Set of normKeys, null = všetci hráči
// koWinPt = body za výhru v KO (0 pre ženskú ligu)
async function loadLigaRankData(lgid, whitelist, placementPts, koWinPt = OOM_KO_WIN_PT) {
  const listUrl = `https://tk2-228-23746.vs.sakura.ne.jp/n01/league/n01_stats_l.php?cmd=t_list&lgid=${lgid}`;
  const listData = await fetchWithTimeout(CORS_PROXY + encodeURIComponent(listUrl), 10000);
  if (!listData) throw new Error('Nepodarilo sa načítať zoznam kôl');

  const rounds = Object.entries(listData)
    .map(([tdid, t]) => ({ tdid, title: t.title || tdid }))
    .filter(r => /\d+\.\s*[Kk]olo/.test(r.title))
    .sort((a, b) => {
      const na = parseInt((a.title.match(/(\d+)/) || [0, 0])[1]);
      const nb = parseInt((b.title.match(/(\d+)/) || [0, 0])[1]);
      return na - nb;
    });

  const allScores = new Map();
  let completedRounds = 0;

  const BATCH = 4;
  for (let i = 0; i < rounds.length; i += BATCH) {
    const batch = rounds.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(r => oomFetchRound(r.tdid)));

    results.forEach(res => {
      if (res.status !== 'fulfilled' || !res.value) return;
      completedRounds++;
      const roundScores = oomScoreRound(res.value, placementPts, koWinPt);

      for (const [, s] of roundScores) {
        if (!s.name || !s.rounds) continue;
        const displayName = preferredDisplayName(s.name);
        const normKey = normalizeName(displayName);
        if (whitelist && !whitelist.has(normKey)) continue;
        if (!allScores.has(normKey)) {
          allScores.set(normKey, {
            name: displayName, pts: 0, rounds: 0,
            matchesWon: 0, legsFor: 0, legsAgainst: 0,
            p1: 0, p2: 0, p3: 0, p5: 0
          });
        }
        const agg = allScores.get(normKey);
        agg.pts         += s.pts;
        agg.rounds      += s.rounds;
        agg.matchesWon  += s.matchesWon;
        agg.legsFor     += s.legsFor;
        agg.legsAgainst += s.legsAgainst;
        agg.p1          += s.p1;
        agg.p2          += s.p2;
        agg.p3          += s.p3;
        agg.p5          += s.p5;
      }
    });
  }

  const players = Array.from(allScores.values())
    .filter(p => p.rounds > 0)
    .sort((a, b) => b.pts - a.pts || b.matchesWon - a.matchesWon || (b.legsFor - b.legsAgainst) - (a.legsFor - a.legsAgainst));

  return { players, totalRounds: rounds.length, completedRounds };
}

// ─── ROW RENDERING ───────────────────────────────────────────────

const TROPHY_ICONS = [
  `<svg viewBox="0 0 24 24" class="rnk-trophy" fill="none" stroke="#f59e0b" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 3h12v8a6 6 0 0 1-12 0V3z"/>
    <path d="M4 3H2v4a4 4 0 0 0 4 4M20 3h2v4a4 4 0 0 1-4 4"/>
    <line x1="12" y1="17" x2="12" y2="21"/>
    <path d="M8 21h8"/>
  </svg>`,
  `<svg viewBox="0 0 24 24" class="rnk-trophy" fill="none" stroke="#94a3b8" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="10" r="6"/>
    <path d="M8 22h8M12 16v6"/>
    <circle cx="12" cy="10" r="3" fill="rgba(148,163,184,0.15)"/>
  </svg>`,
  `<svg viewBox="0 0 24 24" class="rnk-trophy" fill="none" stroke="#cd7c40" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="10" r="6"/>
    <path d="M8 22h8M12 16v6"/>
    <circle cx="12" cy="10" r="3" fill="rgba(205,124,64,0.15)"/>
  </svg>`
];

function renderRankRow(p, i, total, relegationZone) {
  const isRelegate = relegationZone > 0 && i >= total - relegationZone;
  const legDiff = p.legsFor - p.legsAgainst;
  const legDiffStr = legDiff >= 0 ? `+${legDiff}` : `${legDiff}`;

  let rowCls = '';
  if (i === 0)         rowCls = 'rank-gold';
  else if (i === 1)    rowCls = 'rank-silver';
  else if (i === 2)    rowCls = 'rank-bronze';
  else if (isRelegate) rowCls = 'rank-relegate';

  const posCell = i < 3
    ? `<td class="rnk-pos">${TROPHY_ICONS[i]}</td>`
    : `<td class="rnk-pos">${i + 1}</td>`;

  const separator = (relegationZone > 0 && i === total - relegationZone)
    ? `<tr class="relegate-separator"><td colspan="7"><span>ZOSTUP</span></td></tr>`
    : '';

  return `${separator}<tr class="${rowCls}">
    ${posCell}
    <td class="rnk-name">${p.name}</td>
    <td class="rnk-num">${p.p1}</td>
    <td class="rnk-num">${p.matchesWon}</td>
    <td class="rnk-num ${legDiff >= 0 ? 'rnk-pos-diff' : 'rnk-neg-diff'}">${legDiffStr}</td>
    <td class="rnk-num">${p.legsFor}</td>
    <td class="rnk-pts">${p.pts}</td>
  </tr>`;
}

function renderRankTable(players, relegationZone, bodyId, metaId, loadingId, contentId, errorId) {
  return async function() {
    try {
      document.getElementById(metaId).innerHTML = `
        <span class="pill">${players.completedRounds} / ${players.totalRounds} kôl</span>
        <span class="pill">${players.players.length} hráčov</span>
      `;
      document.getElementById(bodyId).innerHTML =
        players.players.map((p, i) => renderRankRow(p, i, players.players.length, relegationZone)).join('');
      document.getElementById(loadingId).style.display = 'none';
      document.getElementById(contentId).style.display = 'block';
    } catch (err) {
      document.getElementById(loadingId).style.display = 'none';
      document.getElementById(errorId).textContent = 'Nepodarilo sa načítať dáta: ' + err.message;
    }
  };
}

// ─── PRVÁ LIGA ───────────────────────────────────────────────────

let _prvaRankDone = false;
let _prvaLigaLgid = null;
let _prvoligistiKeys = null;

async function getPrvaLigaId() {
  if (_prvaLigaLgid) return _prvaLigaLgid;
  const res = await fetch('aktualnesezony.json?t=' + Date.now());
  const cfg = await res.json();
  const url = cfg.prva || cfg._prva;
  const m = url?.match(/lgid=(lg_[^&]+)/);
  if (!m) throw new Error('Prvá liga ID sa nenašlo v aktualnesezony.json');
  _prvaLigaLgid = m[1];
  return _prvaLigaLgid;
}

async function loadPrvoligisti() {
  if (_prvoligistiKeys) return _prvoligistiKeys;
  const res = await fetch('prvoligisti.json?t=' + Date.now());
  const names = await res.json();
  _prvoligistiKeys = new Set(names.map(n => normalizeName(n)));
  return _prvoligistiKeys;
}

async function initPrvaRank() {
  if (_prvaRankDone) return;
  _prvaRankDone = true;
  try {
    const [lgid, whitelist] = await Promise.all([getPrvaLigaId(), loadPrvoligisti()]);
    const data = await loadLigaRankData(lgid, whitelist, OOM_PLACEMENT_PRVA);
    document.getElementById('prvrank-meta').innerHTML = `
      <span class="pill">${data.completedRounds} / ${data.totalRounds} kôl</span>
      <span class="pill">${data.players.length} hráčov</span>
    `;
    document.getElementById('prvrank-body').innerHTML =
      data.players.map((p, i) => renderRankRow(p, i, data.players.length, 2)).join('');
    document.getElementById('prvrank-loading').style.display = 'none';
    document.getElementById('prvrank-content').style.display = 'block';
  } catch (err) {
    document.getElementById('prvrank-loading').style.display = 'none';
    document.getElementById('prvrank-error').textContent = 'Nepodarilo sa načítať dáta: ' + err.message;
  }
}

// ─── ŽENSKÁ LIGA ─────────────────────────────────────────────────

let _zenskaRankDone = false;
let _zenskaLigaLgid = null;

async function getZenskaLigaId() {
  if (_zenskaLigaLgid) return _zenskaLigaLgid;
  const res = await fetch('aktualnesezony.json?t=' + Date.now());
  const cfg = await res.json();
  const url = cfg.zenska || cfg._zenska;
  const m = url?.match(/lgid=(lg_[^&]+)/);
  if (!m) throw new Error('Ženská liga ID sa nenašlo v aktualnesezony.json');
  _zenskaLigaLgid = m[1];
  return _zenskaLigaLgid;
}

async function initZenskaRank() {
  if (_zenskaRankDone) return;
  _zenskaRankDone = true;
  try {
    const lgid = await getZenskaLigaId();
    const data = await loadLigaRankData(lgid, null, OOM_PLACEMENT_ZENSKA, 0);
    document.getElementById('zenrank-meta').innerHTML = `
      <span class="pill">${data.completedRounds} / ${data.totalRounds} kôl</span>
      <span class="pill">${data.players.length} hráčok</span>
    `;
    document.getElementById('zenrank-body').innerHTML =
      data.players.map((p, i) => renderRankRow(p, i, data.players.length, 0)).join('');
    document.getElementById('zenrank-loading').style.display = 'none';
    document.getElementById('zenrank-content').style.display = 'block';
  } catch (err) {
    document.getElementById('zenrank-loading').style.display = 'none';
    document.getElementById('zenrank-error').textContent = 'Nepodarilo sa načítať dáta: ' + err.message;
  }
}
