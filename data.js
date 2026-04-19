// ─── KONFIGURÁCIA ───────────────────────────────────────────────
const CORS_PROXY = "https://h2h.dartssala.workers.dev/?url=";

const NAME_ALIASES = {
  "simon szedlar": "szedlar simon",
  "szedlar simon": "szedlar simon",
  "patrik vrabel": "патрик врабэл",
  "патрик врабэл": "патрик врабэл",
  "vyzyvatel": "патрик врабэл",
  "tamas somogzi": "tamas somogyi",
  "roman herencar": "roman herencar",
  "m. kosec": "maros kosec",
  "nathan": "nathan udvaros",
  "nathan udvaros": "nathan udvaros"
};

const DISPLAY_OVERRIDES = {
  "szedlar simon": "Szedlár Simon",
  "патрик врабэл": "Патрик Врабэл",
  "tamas somogyi": "Tamás Somogyi",
  "roman herencar": "Roman Herenčár",
  "maros kosec": "Maroš Košec",
  "nathan udvaros": "Nathan Udvaros",
  "gabriel kubovic": "Gábriel Kubovic",
  "peter kacska": "Péter Kacska"
};

const MIN_OPP_MATCHES = 5;
const MIN_PLAYER_MATCHES = 20;
const FORM_N = 15;

const PERIODS = [
  { label: "14 dní", days: 14 },
  { label: "1 mesiac", days: 30 },
  { label: "3 mesiace", days: 90 },
  { label: "6 mesiacov", days: 180 }
];

// ─── NAČÍTANIE DÁT ──────────────────────────────────────────────

// Lokálne JSON súbory pre H2H (1. liga)
const LOCAL_PRVA_LIGA_FILES = [
  "jsons/season14_prva liga_slim.json",
  "jsons/season15_prva liga_slim.json",
  "jsons/season16_prva liga_slim.json"
];

// Lokálne JSON súbory pre štatistiky hráčov (Open liga)
const LOCAL_SEASON_FILES = [
  "jsons/season8_raw.json",
  "jsons/season9_slim_no6.json",
  "jsons/season10_slim.json",
  "jsons/season11_slim.json",
  "jsons/season12_slim.json",
  "jsons/season13_slim.json",
  "jsons/season14_slim.json",
  "jsons/season15_slim.json",
  "jsons/season16_open liga_slim.json"
];

async function loadFilesFromList(files) {
  const results = await Promise.allSettled(
    files.map(async (path) => {
      const res = await fetch(path);
      if (!res.ok) throw new Error("Súbor sa nepodarilo načítať: " + path);
      const data = await res.json();
      return Array.isArray(data) ? data : [data];
    })
  );
  const ok = results.filter(r => r.status === "fulfilled").flatMap(r => r.value);
  if (!ok.length) throw new Error("Žiadne dáta sa nepodarilo načítať.");
  return ok;
}

// Cache pre H2H (1. liga – lokálne JSON súbory)
let _tournamentsCache = null;
async function loadTournaments() {
  if (_tournamentsCache) return _tournamentsCache;
  _tournamentsCache = await loadFilesFromList(LOCAL_PRVA_LIGA_FILES);
  return _tournamentsCache;
}

// Cache pre štatistiky hráčov (Open liga – lokálne JSON súbory)
let _localTournamentsCache = null;
async function loadLocalTournaments() {
  if (_localTournamentsCache) return _localTournamentsCache;
  _localTournamentsCache = await loadFilesFromList(LOCAL_SEASON_FILES);
  return _localTournamentsCache;
}

// ─── POMOCNÉ FUNKCIE ────────────────────────────────────────────
function normalizeName(name) {
  let base = name.toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ").trim();
  if (NAME_ALIASES[base]) base = NAME_ALIASES[base];
  return base;
}

function preferredDisplayName(rawName) {
  const base = rawName.toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ").trim();
  const key = NAME_ALIASES[base] || base;
  return DISPLAY_OVERRIDES[key] || rawName;
}

function buildIdToName(tournaments) {
  const idToName = new Map();
  const nameStats = new Map();

  tournaments.forEach(t => {
    (t.entry_list || []).forEach(p => {
      if (!p.tpid || !p.name) return;
      const display = preferredDisplayName(p.name.trim());
      const key = normalizeName(display);
      idToName.set(p.tpid, { name: display, key });

      const stat = nameStats.get(key) || { displayName: display, count: 0 };
      stat.count += 1;
      if (DISPLAY_OVERRIDES[key]) {
        stat.displayName = DISPLAY_OVERRIDES[key];
      } else if (display.length > stat.displayName.length) {
        stat.displayName = display;
      }
      nameStats.set(key, stat);
    });
  });

  return { idToName, nameStats };
}

function normalizeStages(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.values(value);
  return [];
}

function getResultStages(tournament) {
  const stages = [];
  Object.entries(tournament).forEach(([key, value]) => {
    if (key.endsWith("_result")) stages.push(...normalizeStages(value));
  });
  return stages;
}

function extractMatches(tournaments, idToName) {
  const matches = [];
  tournaments.forEach(t => {
    const sources = getResultStages(t);
    const tDate = t.t_date || t.s_date || null;

    sources.forEach(stage => {
      Object.entries(stage || {}).forEach(([pid, opps]) => {
        Object.entries(opps || {}).forEach(([oid, stats]) => {
          if (pid < oid) {
            const a = idToName.get(pid);
            const b = idToName.get(oid);
            if (!a || !b) return;

            const rA = stats?.r ?? 0;
            const aA = stats?.a ?? null;
            const rB = stage?.[oid]?.[pid]?.r ?? 0;
            const aB = stage?.[oid]?.[pid]?.a ?? null;

            matches.push({
              aKey: a.key, bKey: b.key,
              legsA: rA, legsB: rB,
              avgA: aA, avgB: aB,
              tDate
            });
          }
        });
      });
    });
  });
  return matches;
}

function fmt(v) {
  if (v == null) return "-";
  return Number(v).toFixed(2);
}

function wrClass(wr) {
  if (wr >= 60) return "wr-good";
  if (wr >= 40) return "wr-mid";
  return "wr-bad";
}

// ─── ZDIEĽANÝ STATE ─────────────────────────────────────────────

// H2H dáta (1. liga z Google Sheets)
let _sharedData = null;

async function getSharedData() {
  if (_sharedData) return _sharedData;
  const tournaments = await loadTournaments();
  const { idToName, nameStats } = buildIdToName(tournaments);
  const matches = extractMatches(tournaments, idToName);
  const keys = Array.from(nameStats.keys()).sort((a, b) =>
    nameStats.get(a).displayName.localeCompare(nameStats.get(b).displayName, "sk")
  );
  _sharedData = { tournaments, idToName, nameStats, matches, keys };
  return _sharedData;
}

// Štatistiky hráčov (lokálne JSON súbory - Open liga)
let _statsData = null;

async function getStatsData() {
  if (_statsData) return _statsData;
  const tournaments = await loadLocalTournaments();
  const { idToName, nameStats } = buildIdToName(tournaments);
  const matches = extractMatches(tournaments, idToName);
  const keys = Array.from(nameStats.keys()).sort((a, b) =>
    nameStats.get(a).displayName.localeCompare(nameStats.get(b).displayName, "sk")
  );
  _statsData = { tournaments, idToName, nameStats, matches, keys };
  return _statsData;
}
