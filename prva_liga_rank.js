// ─── PRVÁ LIGA – OOM STANDINGS ───────────────────────────────────

const PRVA_LIGA_LGID = 'lg_KQ1q_3231';

const OOM_PLACEMENT_PTS = { 1: 34, 2: 26, 3: 18, 4: 18, 5: 10, 6: 10, 7: 10, 8: 10 };
const OOM_ENTRY_PT  = 2;
const OOM_KO_WIN_PT = 2;
const OOM_RR_W = 2;
const OOM_RR_D = 1;

const RELEGATION_ZONE = 2; // posledných N hráčov

let _prvaRankDone = false;

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

function oomScoreRound(data) {
  const scores = new Map();
  function get(tpid) {
    if (!scores.has(tpid)) scores.set(tpid, {
      name: '', pts: 0, rounds: 0,
      matchesWon: 0, legsFor: 0, legsAgainst: 0,
      p1: 0, p2: 0, p3: 0, p5: 0
    });
    return scores.get(tpid);
  }

  // 1. Entry points
  (data.entry_list || []).forEach(p => {
    if (!p.tpid) return;
    const s = get(p.tpid);
    s.name = p.name || '';
    s.pts += OOM_ENTRY_PT;
    s.rounds = 1;
  });

  // 2. Round-robin points + legs
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

  // 3. KO win points + legs
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
        if (rA > rB)      { get(pid).pts += OOM_KO_WIN_PT; get(pid).matchesWon++; }
        else if (rB > rA) { get(oid).pts += OOM_KO_WIN_PT; get(oid).matchesWon++; }
      }
    }
  }

  // 4. Placement bonus
  const tTable = data.t_table;
  if (tTable && tTable.length >= 2) {
    for (const [tpid, s] of scores) {
      const pl = oomGetPlacement(tpid, tTable);
      if (pl !== null) {
        s.pts += OOM_PLACEMENT_PTS[pl] || 0;
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

async function loadPrvaRankData() {
  const listUrl = `https://tk2-228-23746.vs.sakura.ne.jp/n01/league/n01_stats_l.php?cmd=t_list&lgid=${PRVA_LIGA_LGID}`;
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
      const roundScores = oomScoreRound(res.value);

      for (const [, s] of roundScores) {
        if (!s.name || !s.rounds) continue;
        const displayName = preferredDisplayName(s.name);
        const normKey = normalizeName(displayName);
        if (!allScores.has(normKey)) {
          allScores.set(normKey, {
            name: displayName, pts: 0, rounds: 0,
            matchesWon: 0, legsFor: 0, legsAgainst: 0,
            p1: 0, p2: 0, p3: 0, p5: 0
          });
        }
        const agg = allScores.get(normKey);
        agg.pts          += s.pts;
        agg.rounds       += s.rounds;
        agg.matchesWon   += s.matchesWon;
        agg.legsFor      += s.legsFor;
        agg.legsAgainst  += s.legsAgainst;
        agg.p1           += s.p1;
        agg.p2           += s.p2;
        agg.p3           += s.p3;
        agg.p5           += s.p5;
      }
    });
  }

  const players = Array.from(allScores.values())
    .filter(p => p.rounds > 0)
    .sort((a, b) => b.pts - a.pts || b.matchesWon - a.matchesWon || (b.legsFor - b.legsAgainst) - (a.legsFor - a.legsAgainst));

  return { players, totalRounds: rounds.length, completedRounds };
}

function renderRankRow(p, i, total) {
  const isRelegate = i >= total - RELEGATION_ZONE;
  const legDiff = p.legsFor - p.legsAgainst;
  const legDiffStr = legDiff >= 0 ? `+${legDiff}` : `${legDiff}`;

  let rowCls = '';
  if (i === 0)        rowCls = 'rank-gold';
  else if (i === 1)   rowCls = 'rank-silver';
  else if (i === 2)   rowCls = 'rank-bronze';
  else if (isRelegate) rowCls = 'rank-relegate';

  const separator = (i === total - RELEGATION_ZONE)
    ? `<tr class="relegate-separator"><td colspan="7"><span>ZOSTUP</span></td></tr>`
    : '';

  return `${separator}<tr class="${rowCls}">
    <td class="rnk-pos">${i + 1}</td>
    <td class="rnk-name">${p.name}</td>
    <td class="rnk-num">${p.p1}</td>
    <td class="rnk-num">${p.matchesWon}</td>
    <td class="rnk-num ${legDiff >= 0 ? 'rnk-pos-diff' : 'rnk-neg-diff'}">${legDiffStr}</td>
    <td class="rnk-num">${p.legsFor}</td>
    <td class="rnk-pts">${p.pts}</td>
  </tr>`;
}

async function initPrvaRank() {
  if (_prvaRankDone) return;
  _prvaRankDone = true;

  try {
    const { players, totalRounds, completedRounds } = await loadPrvaRankData();

    document.getElementById('prvrank-meta').innerHTML = `
      <span class="pill">${completedRounds} / ${totalRounds} kôl</span>
      <span class="pill">${players.length} hráčov</span>
    `;

    document.getElementById('prvrank-body').innerHTML =
      players.map((p, i) => renderRankRow(p, i, players.length)).join('');

    document.getElementById('prvrank-loading').style.display = 'none';
    document.getElementById('prvrank-content').style.display = 'block';
  } catch (err) {
    document.getElementById('prvrank-loading').style.display = 'none';
    document.getElementById('prvrank-error').textContent = 'Nepodarilo sa načítať dáta: ' + err.message;
  }
}
