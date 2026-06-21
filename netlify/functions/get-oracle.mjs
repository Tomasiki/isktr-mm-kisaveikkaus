import { getStore } from '@netlify/blobs';
import { participants } from '../../data/predictions.mjs';

const CACHE_TTL_MS = 60 * 60 * 1000; // 60 min
const ODDS_BASE = 'https://api.the-odds-api.com/v4';

const FUN_TEXTS_BY_RANK = [
  // Sija 1 — johtaja (täysin mahtipontiset)
  [
    'Jos tämä olisi elokuva, se olisi jo ohi. Rullataan lopputekstit. 👑',
    'Oraakkeli ei yleensä ihaile. Tällä kertaa se tekee poikkeuksen. Pienen. 🔮',
    'Kosminen tasapaino on puhunut. Muut taistelevat viidennestä sijasta. ⚡',
    'Oraakkeli harjoittelee onnittelupuheenvuoroa. Se on jo puhtaaksikirjoitettu. 🎤',
    'Muut pelaajat eivät tiedä, mutta oraakkeli tietää. Ja nyt sinäkin tiedät. 🌌',
    'Potti lähestyy. Oraakkeli suosittelee jo miettimään, mihin sen käyttää. 💰',
  ],
  // Sija 2
  [
    'Johtaja nukkuu, mestari herää — mutta ensin pitäisi löytää oikotie. Oraakkeli tietää sen. 🗺️',
    'Niin lähellä, että oraakkeli melkein myönsi olevansa väärässä. Melkein. 🎯',
    'Hopeamitali on tulos. Kultamitali on päämäärä. Eroa on yksi sijoitus. 🔥',
    'Oraakkeli kuiskaa: kiinni on. Mutta se on kuiskannut ennenkin. Eikä aina oikeassa. 📈',
  ],
  // Sija 3
  [
    'Kolmas sija kuulostaa hyvältä. Ei kuitenkaan niin hyvältä kuin ensimmäinen. Oraakkeli muistuttaa. ✨',
    'Pronssista kultaan on lyhyempi matka kuin luulet. Mutta ei ole oikotietä. 🏟️',
    'Oraakkeli näkee potentiaalia. Paljon potentiaalia. Toistaiseksi vain potentiaalia. 📊',
    'Tilanne elää. Oraakkeli elää sen mukana. Jännittyneenä mutta neutraalina. 🧐',
  ],
  // Sija 4
  [
    'Neljäs sija: historiallinen saavutus siinä mielessä, että kukaan ei muista sitä. ⏳',
    'Oraakkeli katsoo sinua. Sitten katsoo taulukkoa. Sitten sinua uudelleen. Se ei sano mitään. 🤔',
    'Puolimatkan krouvissa pysähtyminen ei ole häviämistä. Se on kuitenkin aika lähellä sitä. 🛑',
    'Turnaus on auki. Oraakkeli on avoin. Todennäköisyydet eivät ole. 😬',
  ],
  // Sija 5
  [
    'Oraakkeli yrittää löytää jotain positiivista. Se on edelleen etsinnässä. 🔍',
    'Viides sija on aliarvostettua. Oraakkeli yrittää keksiä miksi. Se ei onnistu. 📚',
    'Rohkeutta tarvitaan. Rohkeutta ei kuitenkaan palkita aina. Tai usein. 🫡',
    'Älä anna periksi. Oraakkeli ei anna periksi sinunkaan puolesta. Syistä, joita se ei avaa. 💪',
  ],
  // Sija 6
  [
    'Oraakkeli katsoo tilannettasi. Sitten sulkee silmänsä. Sitten avaa ne uudelleen. Tilanne ei muutu. 🙏',
    'Kuusi on onnennumero jossain kulttuurissa. Oraakkeli ei muista missä. Ehkä Saturnuksella. 🌍',
    'Turnaus on vielä kesken. Tämä on ainoa positiivinen asia mitä oraakkeli löysi. Ainut. 📉',
    'Rohkea veikkaus. Todella rohkea. Absurdisti rohkea. Oraakkeli kunnioittaa sitä jollain tasolla. 🫣',
  ],
  // Sija 7+ — viimeinen
  [
    'Oraakkeli on laskenut 847 eri skenaariota. Yhdessäkään ei voiteta. 😶',
    'Häviäminen on opettavaista. Oraakkeli toivoo, että opit paljon. Todella paljon. 📖',
    'Ehkä seuraavissa kisoissa. Tai yliseuraavissa. Tai vuoden 2038 kisoissa. 😅',
    'Oraakkeli ei ole ikinä nähnyt tätä. Se kirjoittaa siitä tutkielman. 🔬',
    'Veikkauksesi on taiteellinen kokonaisuus. Väärässä oleminen on oma lajiaan. 🎨',
  ],
];

const ROAST_TEXTS_BY_RANK = [
  [], // Sija 1: ei naljailua
  // Sija 2
  [
    'Niin lähellä, niin kaukana. Kuin finaalissa maalin edessä — ilman palloa.',
    'Johtajan selkä on siinä. Juokse nopeammin tai katso kauempaa.',
    'Hopea on hieno. Mutta oraakkeli tietää mitä haluat oikeasti.',
  ],
  // Sija 3
  [
    'Pronssi on upeaa. Mutta se ei maksa laskuja yhtä hyvin kuin kulta.',
    'Oraakkeli näkee sinussa potentiaalia. Se vain ei tiedä mihin potentiaali johti.',
    'Kolmantena oleminen on aliarvostettua. Myös tässä kisassa.',
  ],
  // Sija 4
  [
    'Ei mitalille, ei hyvää selitystä. Oraakkeli odottaa molempia.',
    'Neljännellä sijalla istuessa on aikaa pohtia, missä meni pieleen. Oraakkeli ehdottaa: kaikkialla.',
    'Tulos on tulos. Tämä tulos ei juuri lohduta.',
  ],
  // Sija 5
  [
    'Viides. Viiden joukkueen joukossa olisi jo mitali. Oraakkeli laskee pelaajia: kymmenen.',
    'Oraakkeli yritti löytää jotain tsemppaavaa sanottavaa. Se löysi: turnaus on vielä kesken.',
    'Veikkauksesi oli rohkea. Rohkeus on yleensä hyvä asia. Yleensä.',
  ],
  // Sija 6
  [
    'Kuudennella sijalla on sentään nimi. Eikä se ole "voittaja". Oraakkeli pahoittelee.',
    'Oraakkeli analysoi veikkauksesi 12 minuuttia. Se ei tiedä mitä sanoa. Se ei yleensä vaikene.',
    'Lähellä häntää. Ei aivan hännällä. Oraakkeli ei tiedä onko se lohdullista vai ei.',
  ],
  // Sija 7+ — viimeinen
  [
    'Oraakkeli haluaa lähettää lohdun. Mutta se ei löydä sopivaa lausetta. Eikä sopivaa emojia.',
    'Historiallinen suoritus. Oraakkeli kirjaa sen ylös. Varoituksena tuleville sukupolville.',
    'Tämä ei ole häviämistä. Tämä on aktiivista osallistumista muiden voittoon.',
    'Oraakkeli on nähyt paljon. Tämä ylitti odotukset. Alaspäin.',
  ],
];

function pickText(rankIndex) {
  const options = FUN_TEXTS_BY_RANK[Math.min(rankIndex, FUN_TEXTS_BY_RANK.length - 1)];
  return options[Math.floor(Math.random() * options.length)];
}

function pickRoast(rankIndex) {
  const options = ROAST_TEXTS_BY_RANK[Math.min(rankIndex, ROAST_TEXTS_BY_RANK.length - 1)];
  if (!options || options.length === 0) return null;
  return options[Math.floor(Math.random() * options.length)];
}

export default async function handler(req, context) {
  try {
    const store = getStore('tournament-data');

    // Cache-tarkistus
    let cached;
    try { cached = await store.get('oracle', { type: 'json' }); } catch {}
    if (cached?.lastUpdated) {
      const age = Date.now() - new Date(cached.lastUpdated).getTime();
      if (age < CACHE_TTL_MS) return Response.json(cached, { headers: { 'Cache-Control': 'no-store' } });
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
        text: pickText(i),
        roastText: pickRoast(i),
      })),
      leader: ranking[0]?.name,
      lastUpdated: new Date().toISOString(),
      dataSource: Object.keys(teamStrengths).length > 0 ? 'live' : 'fallback',
    };

    try { await store.set('oracle', JSON.stringify(result)); } catch {}
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });

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

  add(participant.groupWinners || [], 0.5);
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
  "Etelä-Korea":"South Korea","Korea Republic":"South Korea","Egypti":"Egypt",
  "Bosnia-H":"Bosnia and Herzegovina","Bosnia-Herzegovina":"Bosnia and Herzegovina",
  "Usa":"United States",
};
function toEn(name) { return FI_TO_EN[name] || name; }
