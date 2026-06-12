import { getStore } from '@netlify/blobs';
import { participants } from '../../data/predictions.mjs';

const CACHE_TTL_MS = 60 * 60 * 1000; // 60 min
const ODDS_BASE = 'https://api.the-odds-api.com/v4';

const FUN_TEXTS = [
  'Oraakkeli näkee sinut jo palkintopöydässä 🏆',
  'Vahva haastaja johtopaikasta ⚡',
  'Turnauksen kulku suosii sinua 📈',
  'Mahdollisuuksia on vielä paljon 🎯',
  'Veikkauksessasi on potentiaalia ✨',
  'Oraakkeli seuraa tilannetta tarkasti 👀',
  'Ehkä seuraavissa kisoissa... 😅',
];

export default async function handler(req, context) {
  try {
    const store = getStore('tournament-data');

    // Cache-tarkistus
    let cached;
    try { cached = await store.get('oracle', { type: 'json' }); } catch {}
    if (cached?.lastUpdated) {
      const age = Date.now() - new Date(cached.lastUpdated).getTime();
      if (age < CACHE_TTL_MS) return Response.json(cached);
    }

    // Hae tulokset (sisäinen kutsu)
    const resultsRes = await fetch(new URL('/api/get-results', req.url));
    const results = resultsRes.ok ? await resultsRes.json() : {};

    // Hae joukkuevoimat
    const teamStrengths = await fetchTeamStrengths(results);

    // Laske oracle-pisteet per pelaaja
    const ranking = participants
      .map((p, i) => {
        const score = calcOracleScore(p, teamStrengths);
        return { name: p.name, score, idx: i };
      })
      .sort((a, b) => b.score - a.score);

    const maxScore = ranking[0]?.score || 1;
    const minScore = ranking[ranking.length - 1]?.score || 0;
    const scoreRange = maxScore - minScore || 1;
    const result = {
      ranking: ranking.map((r, i) => ({
        name: r.name,
        score: r.score,
        // Normalisoidaan välille 10–100 jotta kukaan ei ole 0% lohkovaiheen alussa
        normalizedScore: Math.round(10 + 90 * ((r.score - minScore) / scoreRange)),
        text: FUN_TEXTS[Math.min(i, FUN_TEXTS.length - 1)],
      })),
      leader: ranking[0]?.name,
      lastUpdated: new Date().toISOString(),
      dataSource: Object.keys(teamStrengths).length > 0 ? 'live' : 'fallback',
    };

    try { await store.set('oracle', JSON.stringify(result)); } catch {}
    return Response.json(result);

  } catch (err) {
    console.error('get-oracle error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

async function fetchTeamStrengths(results) {
  const strengths = {};

  // Laske lohkovaiheen form-pisteet
  const formScores = calcFormScores(results);

  // Yritä hakea vedonlyöntikertoimet
  const oddsKey = process.env.ODDS_API_KEY;
  if (oddsKey) {
    try {
      const r = await fetch(
        `${ODDS_BASE}/sports/soccer_fifa_world_cup/odds?apiKey=${oddsKey}&markets=h2h&oddsFormat=decimal`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (r.ok) {
        const data = await r.json();
        const oddsProbs = extractOutrightOdds(data);
        // Yhdistä: 60% kertoimet + 40% form
        const allTeams = new Set([...Object.keys(oddsProbs), ...Object.keys(formScores)]);
        for (const team of allTeams) {
          const odds = oddsProbs[team] ?? 0;
          const form = formScores[team] ?? 0;
          strengths[team] = 0.6 * odds + 0.4 * form;
        }
        return strengths;
      }
    } catch {}
  }

  // Fallback: pelkät form-pisteet tai tasajakauma
  if (Object.keys(formScores).length > 0) {
    return formScores;
  }

  // Täysin tyhjä: kaikki eliminoimattomat joukkueet saavat tasapainoitetun arvon
  // Käytetään pelaajien voittajavalintoja painotuksena
  const winnerCounts = {};
  for (const p of participants) {
    if (p.winner) winnerCounts[p.winner] = (winnerCounts[p.winner] || 0) + 1;
  }
  const total = participants.length;
  for (const [team, count] of Object.entries(winnerCounts)) {
    strengths[team] = count / total;
  }
  return strengths;
}

function calcFormScores(results) {
  const scores = {};

  // Lohkovaihe: normalisoi pisteet+maaliero → 0–0.4 per joukkue
  const gs = results.groupStandings || {};
  const allRows = Object.values(gs);
  if (allRows.length > 0) {
    const maxPts = Math.max(...allRows.map(r => r.points), 1);
    const maxGD  = Math.max(...allRows.map(r => r.goalDiff), 1);
    for (const [team, row] of Object.entries(gs)) {
      // Lohkovaiheen voima 0–0.4: pisteet (70%) + maaliero (30%)
      scores[team] = 0.4 * (0.7 * (row.points / maxPts) + 0.3 * (Math.max(row.goalDiff, 0) / maxGD));
    }
  }

  // Pudotuspelit lisäävät arvoa päälle (0.25–1.0)
  const stages = [
    { set: results.top16 || [], value: 0.25 },
    { set: results.top8  || [], value: 0.50 },
    { set: results.top4  || [], value: 0.75 },
    { set: results.top2  || [], value: 0.90 },
  ];
  if (results.winner) scores[results.winner] = 1.0;

  for (const { set, value } of stages) {
    for (const team of set) {
      // Ota suurempi: pudotuspelitieto ohittaa lohkovaiheen jos korkeampi
      if (!scores[team] || scores[team] < value) scores[team] = value;
    }
  }
  return scores;
}

function extractOutrightOdds(data) {
  // The Odds API outright-vastauksen parsinta
  const probs = {};
  if (!Array.isArray(data)) return probs;

  for (const event of data) {
    for (const bookmaker of (event.bookmakers || []).slice(0, 3)) {
      for (const market of (bookmaker.markets || [])) {
        if (market.key !== 'h2h' && market.key !== 'outrights') continue;
        for (const outcome of (market.outcomes || [])) {
          if (!probs[outcome.name] && outcome.price > 1) {
            probs[outcome.name] = 1 / outcome.price; // muunna todennäköisyydeksi
          }
        }
      }
    }
  }

  // Normalisoi summaksi 1
  const total = Object.values(probs).reduce((s, v) => s + v, 0);
  if (total > 0) {
    for (const k of Object.keys(probs)) probs[k] /= total;
  }
  return probs;
}

function calcOracleScore(participant, teamStrengths) {
  let score = 0;

  // Kerää kaikki joukkueet ja niiden paino pelaajan ennusteessa
  const weights = {};
  const add = (list, w) => {
    for (const team of (list || [])) weights[team] = (weights[team] || 0) + w;
  };

  add(participant.top16, 1);
  add(participant.top8,  2);
  add(participant.top4,  3);
  add(participant.top2,  4);
  if (participant.winner) weights[participant.winner] = (weights[participant.winner] || 0) + 5;

  for (const [team, weight] of Object.entries(weights)) {
    // Yritä löytää joukkue teamStrengths:ista (englanninkielisenä tai suomenkielisenä)
    const strength = teamStrengths[team]
      ?? teamStrengths[toEn(team)]
      ?? 0;
    score += strength * weight;
  }

  return score;
}

// Kevyt alias-kartta funktiolle (ei importata tiedostoa)
const FI_TO_EN = {
  "Argentiina":"Argentina","Belgia":"Belgium","Brasilia":"Brazil","Englanti":"England",
  "Espanja":"Spain","Hollanti":"Netherlands","Alankomaat":"Netherlands","Japani":"Japan",
  "Kanada":"Canada","Meksiko":"Mexico","Mexico":"Mexico","Norja":"Norway","Portugali":"Portugal",
  "Ranska":"France","Saksa":"Germany","Sveitsi":"Switzerland","Turkki":"Türkiye",
  "Kroatia":"Croatia","Kolumbia":"Colombia","Senegal":"Senegal",
  "Ruotsi":"Sweden","Skotlanti":"Scotland","Itävalta":"Austria","Uruguay":"Uruguay",
  "USA":"United States","Ecuador":"Ecuador","Equador":"Ecuador","Marokko":"Morocco",
  "Tsekki":"Czechia","Paraguay":"Paraguay",
  "Etelä-Korea":"South Korea","Korea Republic":"South Korea",
  "Bosnia-H":"Bosnia and Herzegovina","Bosnia-Herzegovina":"Bosnia and Herzegovina",
  "Usa":"United States",
};
function toEn(name) { return FI_TO_EN[name] || name; }
