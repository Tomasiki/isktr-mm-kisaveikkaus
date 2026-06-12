import { getStore } from '@netlify/blobs';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const FD_BASE = 'https://api.football-data.org/v4';
const WC_CODE = 'WC';

// Mahdolliset vaiheenimet football-data.org:ssa 2026 WC:lle
const STAGE_MAP = {
  ROUND_OF_32: 'top16',     // 32→16, voittajat = top16
  LAST_32:     'top16',
  ROUND_OF_16: 'top8',      // 16→8, voittajat = top8
  LAST_16:     'top8',
  QUARTER_FINALS: 'top4',
  SEMI_FINALS:    'top2',
  FINAL:          'final',
};

export default async function handler(req, context) {
  try {
    const store = getStore('tournament-data');

    // Tarkista cache
    let cached;
    try { cached = await store.get('results', { type: 'json' }); } catch {}

    if (cached?.lastUpdated) {
      const age = Date.now() - new Date(cached.lastUpdated).getTime();
      if (age < CACHE_TTL_MS) {
        return Response.json(cached);
      }
    }

    const fresh = await fetchFromApi();
    try { await store.set('results', JSON.stringify(fresh)); } catch {}
    return Response.json(fresh);

  } catch (err) {
    console.error('get-results error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

async function fetchFromApi() {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) {
    // Ei API-avainta: palauta tyhjä data jotta sivu toimii
    return emptyResults();
  }

  const headers = { 'X-Auth-Token': key };

  const [standingsRes, matchesRes] = await Promise.all([
    fetch(`${FD_BASE}/competitions/${WC_CODE}/standings`, { headers }),
    fetch(`${FD_BASE}/competitions/${WC_CODE}/matches`, { headers }),
  ]);

  const standingsData = standingsRes.ok ? await standingsRes.json() : {};
  const matchesData   = matchesRes.ok  ? await matchesRes.json()   : {};

  return parseResults(standingsData, matchesData);
}

function parseResults(standings, matchesData) {
  const results = emptyResults();

  // Lohkotaulukot
  for (const group of (standings.standings || [])) {
    const letter = (group.group || '').replace('GROUP_', '');
    if (!letter || !group.table?.length) continue;
    const allPlayed = group.table.every(r => r.playedGames >= 3);
    if (allPlayed) {
      results.groups[letter] = {
        winner: group.table[0].team.name,
        complete: true,
      };
    } else {
      results.groups[letter] = { winner: null, complete: false };
    }
  }

  // Karsinnat
  for (const match of (matchesData.matches || [])) {
    if (match.status !== 'FINISHED') continue;
    const target = STAGE_MAP[match.stage];
    if (!target) continue;

    const scoreWinner = match.score?.winner;
    if (!scoreWinner || scoreWinner === 'DRAW') continue;

    const winnerName = scoreWinner === 'HOME_TEAM'
      ? match.homeTeam.name
      : match.awayTeam.name;

    if (target === 'final') {
      results.winner = winnerName;
      if (!results.top2.includes(match.homeTeam.name)) results.top2.push(match.homeTeam.name);
      if (!results.top2.includes(match.awayTeam.name)) results.top2.push(match.awayTeam.name);
    } else {
      if (!results[target].includes(winnerName)) results[target].push(winnerName);
    }
  }

  // Merkitse vaiheet valmiiksi
  results.stagesComplete.groups = Object.values(results.groups).every(g => g.complete);
  results.stagesComplete.top16  = results.top16.length >= 16;
  results.stagesComplete.top8   = results.top8.length  >= 8;
  results.stagesComplete.top4   = results.top4.length  >= 4;
  results.stagesComplete.top2   = results.top2.length  >= 2;
  results.stagesComplete.final  = !!results.winner;
  results.lastUpdated = new Date().toISOString();

  return results;
}

function emptyResults() {
  return {
    groups: {},
    top16: [], top8: [], top4: [], top2: [],
    winner: null,
    stagesComplete: { groups: false, top16: false, top8: false, top4: false, top2: false, final: false },
    lastUpdated: null,
  };
}
