import { getStore } from '@netlify/blobs';
import { toFinnish, toEnglish } from '../../data/teams.mjs';

// Normaloi API:n joukkuenimi kanoniseen muotoon jota frontend käyttää.
// Esim. "Turkey" → toFinnish → "Turkki" → toEnglish → "Türkiye"
function canonicalize(apiName) {
  if (!apiName) return apiName;
  const fi = toFinnish[apiName];
  if (fi) {
    const canonical = toEnglish[fi];
    if (canonical) return canonical;
  }
  return apiName;
}

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

  const fresh = parseResults(standingsData, matchesData);

  // Yhdistä manuaalisesti lisätyt eliminoidut joukkueet
  try {
    const store = getStore('tournament-data');
    const manual = await store.get('manual-eliminated', { type: 'json' });
    if (Array.isArray(manual)) {
      for (const t of manual) {
        if (!fresh.eliminated.includes(t)) fresh.eliminated.push(t);
      }
    }
  } catch {}

  return fresh;
}

function parseResults(standings, matchesData) {
  const results = emptyResults();

  // 1. Lohkotaulukot + joukkueiden lohkovaiheen form-data
  // Käsitellään vain TOTAL-standings (football-data.org palauttaa myös HOME ja AWAY)
  for (const group of (standings.standings || [])) {
    if (group.type && group.type !== 'TOTAL') continue;
    const letter = (group.group || '').replace('GROUP_', '');
    if (!letter || !group.table?.length) continue;
    const allPlayed = group.table.every(r => r.playedGames >= 3);
    results.groups[letter] = {
      winner: allPlayed ? canonicalize(group.table[0].team.name) : null,
      complete: allPlayed,
    };
    for (const row of group.table) {
      if (!row.team?.name || row.playedGames === 0) continue;
      const cName = canonicalize(row.team.name);
      results.groupStandings[cName] = {
        points: row.points ?? 0,
        played: row.playedGames ?? 0,
        won: row.won ?? 0,
        goalDiff: row.goalDifference ?? 0,
        goalsFor: row.goalsFor ?? 0,
      };
      results.teamGroup[cName] = letter;
    }

    // Neljäs sija = varma eliminointi jos ei voi enää edetä
    if (group.table.length === 4) {
      const r4 = group.table[3];
      const r4name = r4?.team?.name ? canonicalize(r4.team.name) : null;
      // 3 peliä pelannut viimeinen → eliminoitu
      if (r4name && r4.playedGames >= 3) {
        if (!results.eliminated.includes(r4name)) results.eliminated.push(r4name);
      }
      // 0 pistettä 2 pelissä = 2 tappiota = ei voi edetä (max 3 pts ei riitä 2026 MM:ssa)
      if (r4name && r4.playedGames === 2 && r4.points === 0) {
        if (!results.eliminated.includes(r4name)) results.eliminated.push(r4name);
      }
    }
  }

  // 2. Karsinnat: käy kaikki ottelut läpi kerralla
  const knockoutParticipants = new Set();
  for (const match of (matchesData.matches || [])) {
    const round = match.stage;
    const isKnockout = STAGE_MAP[round] || round === 'ROUND_OF_32' || round === 'LAST_32';
    if (!isKnockout) continue;

    const homeName = canonicalize(match.homeTeam.name);
    const awayName = canonicalize(match.awayTeam.name);
    knockoutParticipants.add(homeName);
    knockoutParticipants.add(awayName);

    // Tulevat ottelut bracket-laskentaa varten
    if (match.status === 'SCHEDULED' || match.status === 'TIMED') {
      results.bracket.push({ round, team1: homeName, team2: awayName });
    }

    if (match.status !== 'FINISHED') continue;
    const target = STAGE_MAP[round];
    if (!target) continue;

    const scoreWinner = match.score?.winner;
    if (!scoreWinner || scoreWinner === 'DRAW') continue;

    const winnerName = scoreWinner === 'HOME_TEAM' ? homeName : awayName;
    const loserName  = scoreWinner === 'HOME_TEAM' ? awayName : homeName;

    if (target === 'final') {
      results.winner = winnerName;
      if (!results.top2.includes(homeName)) results.top2.push(homeName);
      if (!results.top2.includes(awayName)) results.top2.push(awayName);
    } else {
      if (!results[target].includes(winnerName)) results[target].push(winnerName);
    }

    // Pelin hävinnyt on eliminoitu
    if (!results.eliminated.includes(loserName)) results.eliminated.push(loserName);
  }

  // 3. Lohkovaiheesta karsiutuneet: pelasi lohkon mutta ei näy karsinnoissa
  for (const teamName of Object.keys(results.groupStandings)) {
    if (knockoutParticipants.has(teamName)) continue;
    const letter = results.teamGroup[teamName];
    if (letter && results.groups[letter]?.complete) {
      if (!results.eliminated.includes(teamName)) results.eliminated.push(teamName);
    }
  }

  // 4. Merkitse vaiheet valmiiksi
  const groupEntries = Object.values(results.groups);
  results.stagesComplete.groups = groupEntries.length > 0 && groupEntries.every(g => g.complete);
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
    groupStandings: {},
    teamGroup: {},
    top16: [], top8: [], top4: [], top2: [],
    winner: null,
    eliminated: [],
    bracket: [],
    stagesComplete: { groups: false, top16: false, top8: false, top4: false, top2: false, final: false },
    lastUpdated: null,
  };
}
