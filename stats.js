// ─── PLAYER STATS ────────────────────────────────────────────────

let currentKey = null;

function computePlayerStats(matches, key, nameStats) {
  let wins = 0, losses = 0, draws = 0;
  let legsFor = 0, legsAgainst = 0;
  let avgs = [];
  let form = [];
  const oppStats = new Map();
  const playerMatches = [];

  matches.forEach(m => {
    if (m.aKey !== key && m.bKey !== key) return;
    playerMatches.push(m);

    const isA = m.aKey === key;
    const lf = isA ? m.legsA : m.legsB;
    const la = isA ? m.legsB : m.legsA;
    legsFor += lf;
    legsAgainst += la;

    let res = "R";
    if (lf > la) { wins++; res = "V"; }
    else if (la > lf) { losses++; res = "P"; }
    else draws++;

    form.push(res);

    const avg = isA ? m.avgA : m.avgB;
    if (avg != null) avgs.push(avg);

    const oppKey = isA ? m.bKey : m.aKey;
    if (!oppStats.has(oppKey)) oppStats.set(oppKey, { w: 0, d: 0, l: 0, n: 0 });
    const o = oppStats.get(oppKey);
    o.n++;
    if (res === "V") o.w++;
    if (res === "R") o.d++;
    if (res === "P") o.l++;
  });

  const matchesCount = wins + losses + draws;
  const avgTotal = avgs.length ? avgs.reduce((a,b)=>a+b,0)/avgs.length : null;
  const avgBest = avgs.length ? Math.max(...avgs) : null;
  const avgWorst = avgs.length ? Math.min(...avgs) : null;
  const winRate = matchesCount ? (wins / matchesCount) * 100 : 0;
  const legDiff = legsFor - legsAgainst;

  const oppArray = Array.from(oppStats.entries()).map(([oppKey, s]) => ({
    key: oppKey,
    name: nameStats.get(oppKey)?.displayName || oppKey,
    ...s,
    winRate: s.n ? (s.w / s.n) * 100 : 0
  }));

  const topOpponents = oppArray.slice().sort((a,b) => b.n - a.n).slice(0, 3);
  const filtered = oppArray.filter(o => o.n >= MIN_OPP_MATCHES);
  const favorites = filtered.slice().sort((a,b) => b.winRate - a.winRate).slice(0, 3);
  const nemeses = filtered.slice().sort((a,b) => a.winRate - b.winRate).slice(0, 3);

  return {
    matches: matchesCount,
    wins, losses, draws,
    legsFor, legsAgainst,
    avgTotal, avgBest, avgWorst,
    winRate, legDiff,
    form: form.slice(-FORM_N),
    topOpponents, favorites, nemeses,
    playerMatches
  };
}

function avgForPeriod(playerMatches, days) {
  const cutoff = Date.now() - days * 86400000;
  const avgs = playerMatches
    .filter(m => m.tDate && m.tDate * 1000 >= cutoff)
    .map(m => m.aKey === currentKey ? m.avgA : m.avgB)
    .filter(a => a != null);
  return avgs.length ? avgs.reduce((a,b)=>a+b,0)/avgs.length : null;
}

function renderFormBoxes(form) {
  if (!form.length) return `<div class="box unk">?</div>`;
  return form.map(r => {
    const cls = r === "V" ? "win" : r === "R" ? "draw" : "loss";
    return `<div class="box ${cls}">${r}</div>`;
  }).join("");
}

function renderOpponents(list, showWR) {
  if (!list.length) {
    return `<div class="opp-card"><span class="opp-name">-</span><span class="opp-count">0 zápasov</span></div>`;
  }
  return list.map(o => `
    <div class="opp-card">
      <span class="opp-name">${o.name}</span>
      <span class="opp-count">Zápasy: ${o.n}${showWR ? ` | WR: <span class="${wrClass(o.winRate)}">${fmt(o.winRate)}%</span>` : ""}</span>
      <div class="opp-wpr">
        <div class="wpr win">W${o.w}</div>
        <div class="wpr loss">P${o.l}</div>
        <div class="wpr draw">R${o.d}</div>
      </div>
    </div>
  `).join("");
}

function renderStatsGrid(stats) {
  const periodOptions = PERIODS.map(p => `<option value="${p.days}">${p.label}</option>`).join("");

  return `
    <div class="grid-2">
      <div class="stat-box">
        <div class="label">Skóre (legy)</div>
        <div class="value" style="font-size:17px">${stats.legsFor}:${stats.legsAgainst} (${stats.legDiff >= 0 ? "+" : ""}${stats.legDiff})</div>
      </div>
      <div class="stat-box">
        <div class="label">Win rate</div>
        <div class="value"><span class="${wrClass(stats.winRate)}">${fmt(stats.winRate)}%</span></div>
      </div>
    </div>

    <div class="grid-3">
      <div class="stat-box">
        <div class="label">Celkový priemer</div>
        <div class="value">${fmt(stats.avgTotal)}</div>
      </div>
      <div class="stat-box">
        <div class="label">Najvyšší</div>
        <div class="value">${fmt(stats.avgBest)}</div>
      </div>
      <div class="stat-box">
        <div class="label">Najnižší</div>
        <div class="value">${fmt(stats.avgWorst)}</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:10px">
      <div class="card-title">Najčastejší súperi (Top 3)</div>
      <div class="opps-wrap">${renderOpponents(stats.topOpponents, false)}</div>
    </div>

    <div class="card" style="margin-bottom:10px">
      <div class="card-title">Najobľúbenejší súperi (min. ${MIN_OPP_MATCHES} zápasov)</div>
      <div class="opps-wrap">${renderOpponents(stats.favorites, true)}</div>
    </div>

    <div class="card" style="margin-bottom:10px">
      <div class="card-title">Najmenej obľúbení súperi (min. ${MIN_OPP_MATCHES} zápasov)</div>
      <div class="opps-wrap">${renderOpponents(stats.nemeses, true)}</div>
    </div>

    <div class="card" style="margin-bottom:10px">
      <div class="card-title">Forma (posledných ${FORM_N})</div>
      <div class="form-boxes">${renderFormBoxes(stats.form)}</div>
    </div>

    <div class="card">
      <div class="card-title">Priemer za obdobie</div>
      <div class="period-row">
        <label>Obdobie:</label>
        <select id="periodSelect">${periodOptions}</select>
      </div>
      <div class="avg-bar"><div id="avgFill" class="avg-fill"></div></div>
      <div id="avgValue" class="avg-value">-</div>
    </div>
  `;
}

/* ── Player hero card ── */
function updatePlayerHero(name, stats) {
  const heroEl = document.getElementById('player-hero');
  if (!heroEl) return;

  // Avatar initials
  const avatarEl = document.getElementById('player-hero-avatar');
  if (avatarEl) {
    avatarEl.textContent = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  }

  // Name
  const nameEl = document.getElementById('player-hero-name');
  if (nameEl) nameEl.textContent = name;

  // Meta: matches count + avg
  const metaEl = document.getElementById('player-hero-meta');
  if (metaEl) {
    const avgStr = stats.avgTotal != null ? ` · Priemer: ${stats.avgTotal.toFixed(2)}` : '';
    metaEl.textContent = `${stats.matches} zápasov${avgStr}`;
  }

  // WR ring animation
  const wrValue = document.getElementById('player-hero-wr');
  const wrRing = document.getElementById('wr-ring-fill');
  const wr = Math.round(stats.winRate);
  if (wrValue) wrValue.textContent = wr + '%';
  if (wrRing) {
    // circumference = 2 * π * r = 2 * π * 32 ≈ 201
    const circumference = 201;
    const offset = circumference - (wr / 100) * circumference;
    // Reset first for re-animation
    wrRing.style.transition = 'none';
    wrRing.style.strokeDashoffset = circumference;
    // Force reflow then animate
    wrRing.getBoundingClientRect();
    wrRing.style.transition = 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)';
    wrRing.style.strokeDashoffset = offset;
  }

  heroEl.style.display = 'flex';
}

const LEAGUE_SOURCES = {
  open:  { label: "Open liga", getData: () => getStatsData()         },
  prva:  { label: "Prvá liga", getData: () => getSharedData()        },
  vsetko:{ label: "Všetko",   getData: () => getCombinedStatsData() }
};

let currentSource = "open";
let currentSeasonFiles = null; // null = všetky sezóny

async function loadCurrent() {
  if (currentSeasonFiles) return getSeasonData(currentSeasonFiles);
  return LEAGUE_SOURCES[currentSource].getData();
}

function currentMinMatches() {
  return currentSeasonFiles ? 1 : MIN_PLAYER_MATCHES;
}

async function initStats() {
  try {
    const sel        = document.getElementById("player");
    const toggleWrap = document.getElementById("stats-toggle");
    const seasonWrap = document.getElementById("stats-season-toggle");

    // ── Liga prepínač ──
    Object.entries(LEAGUE_SOURCES).forEach(([key, src]) => {
      const btn = document.createElement("button");
      btn.className = "toggle-btn" + (key === currentSource ? " active" : "");
      btn.textContent = src.label;
      btn.onclick = async () => {
        currentSource = key;
        currentSeasonFiles = null;
        toggleWrap.querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        renderSeasonToggle();
        await switchSource();
      };
      toggleWrap.appendChild(btn);
    });

    // ── Sezóna prepínač ──
    function renderSeasonToggle() {
      seasonWrap.innerHTML = "";
      const defs = SEASON_DEFS[currentSource];
      if (!defs) return;

      const allBtn = document.createElement("button");
      allBtn.className = "toggle-btn active";
      allBtn.textContent = "Všetky sezóny";
      allBtn.onclick = async () => {
        currentSeasonFiles = null;
        seasonWrap.querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
        allBtn.classList.add("active");
        await switchSource();
      };
      seasonWrap.appendChild(allBtn);

      defs.forEach(({ label, files }) => {
        const btn = document.createElement("button");
        btn.className = "toggle-btn";
        btn.textContent = label;
        btn.onclick = async () => {
          currentSeasonFiles = files;
          seasonWrap.querySelectorAll(".toggle-btn").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          await switchSource();
        };
        seasonWrap.appendChild(btn);
      });
    }

    renderSeasonToggle();

    // ── Načítanie hráčov ──
    async function switchSource() {
      const prevKey = sel.value;
      sel.innerHTML = "";
      const { matches, nameStats, keys } = await loadCurrent();
      const minM = currentMinMatches();
      keys.forEach(key => {
        const stats = computePlayerStats(matches, key, nameStats);
        if (stats.matches >= minM) {
          sel.add(new Option(nameStats.get(key).displayName, key));
        }
      });
      if (prevKey && [...sel.options].some(o => o.value === prevKey)) {
        sel.value = prevKey;
      } else if (sel.options.length >= 1) {
        sel.value = sel.options[0].value;
      }
      if (sel.value) update();
    }

    function update() {
      const k = sel.value;
      if (!k) return;
      currentKey = k;

      loadCurrent().then(({ matches, nameStats }) => {
        const stats = computePlayerStats(matches, k, nameStats);
        const playerName = nameStats.get(k).displayName;

        // Update player hero card
        updatePlayerHero(playerName, stats);

        document.getElementById("stats-pills").innerHTML = `
          <div class="pill">Zápasy: ${stats.matches}</div>
          <div class="pill">Výhry: ${stats.wins}</div>
          <div class="pill">Prehry: ${stats.losses}</div>
          <div class="pill">Remízy: ${stats.draws}</div>
        `;

        document.getElementById("stats-grid").innerHTML = renderStatsGrid(stats);

        const periodSelect = document.getElementById("periodSelect");
        const avgFill = document.getElementById("avgFill");
        const avgValue = document.getElementById("avgValue");

        function updateAvg() {
          const avg = avgForPeriod(stats.playerMatches, Number(periodSelect.value));
          if (avg == null) {
            avgFill.style.width = "0%";
            avgValue.textContent = "Žiadne zápasy v období";
            return;
          }
          avgFill.style.width = Math.min(100, avg) + "%";
          avgValue.textContent = `Priemer: ${avg.toFixed(2)}`;
        }

        periodSelect.addEventListener("change", updateAvg);
        updateAvg();
      });
    }

    sel.addEventListener("change", update);

    document.getElementById("stats-loading").style.display = "none";
    document.getElementById("stats-content").style.display = "block";

    await switchSource();
  } catch (err) {
    document.getElementById("stats-loading").style.display = "none";
    document.getElementById("stats-error").textContent =
      "Nepodarilo sa načítať dáta: " + err.message;
  }
}

initStats();
