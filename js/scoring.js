import { teamToEnglish } from '/data/teams.mjs';

export function calculateScore(participant, results) {
  let pts = 0;

  // Lohkovoittajat: 1 piste per oikea
  const actualGroupWinners = new Set(
    Object.values(results.groups || {})
      .filter(g => g.complete && g.winner)
      .map(g => g.winner)
  );
  for (const team of (participant.groupWinners || [])) {
    if (actualGroupWinners.has(teamToEnglish(team))) pts += 1;
  }

  // Top16: 1 pt per oikea
  const top16 = new Set(results.top16 || []);
  for (const team of (participant.top16 || [])) {
    if (top16.has(teamToEnglish(team))) pts += 1;
  }

  // Top8: 2 pt per oikea
  const top8 = new Set(results.top8 || []);
  for (const team of (participant.top8 || [])) {
    if (top8.has(teamToEnglish(team))) pts += 2;
  }

  // Top4: 3 pt per oikea
  const top4 = new Set(results.top4 || []);
  for (const team of (participant.top4 || [])) {
    if (top4.has(teamToEnglish(team))) pts += 3;
  }

  // Top2: 4 pt per oikea
  const top2 = new Set(results.top2 || []);
  for (const team of (participant.top2 || [])) {
    if (top2.has(teamToEnglish(team))) pts += 4;
  }

  // Voittaja: 5 pt
  if (participant.winner && results.winner &&
      teamToEnglish(participant.winner) === results.winner) {
    pts += 5;
  }

  return pts;
}

export function scoreBreakdown(participant, results) {
  const actualGroupWinners = new Set(
    Object.values(results.groups || {})
      .filter(g => g.complete && g.winner)
      .map(g => g.winner)
  );
  const top16 = new Set(results.top16 || []);
  const top8  = new Set(results.top8  || []);
  const top4  = new Set(results.top4  || []);
  const top2  = new Set(results.top2  || []);

  const lohko = (participant.groupWinners || []).filter(t => actualGroupWinners.has(teamToEnglish(t))).length;
  const t16   = (participant.top16 || []).filter(t => top16.has(teamToEnglish(t))).length;
  const t8    = (participant.top8  || []).filter(t => top8.has(teamToEnglish(t))).length;
  const t4    = (participant.top4  || []).filter(t => top4.has(teamToEnglish(t))).length;
  const t2    = (participant.top2  || []).filter(t => top2.has(teamToEnglish(t))).length;
  const win   = (participant.winner && results.winner &&
                 teamToEnglish(participant.winner) === results.winner) ? 1 : 0;

  return {
    lohko, t16, t8, t4, t2, win,
    total: lohko + t16 * 1 + t8 * 2 + t4 * 3 + t2 * 4 + win * 5,
  };
}

export function calculateMaxScore(participant, results) {
  const eliminatedSet = new Set(results.eliminated || []);
  const teamGroupMap  = results.teamGroup || {};

  const isBlocked = (finnishName, stage) => {
    const enName = teamToEnglish(finnishName);
    if (eliminatedSet.has(enName)) return true;
    if (stage === 'top16' && results.stagesComplete?.top16 && !(results.top16 || []).includes(enName)) return true;
    if (stage === 'top8'  && results.stagesComplete?.top8  && !(results.top8  || []).includes(enName)) return true;
    if (stage === 'top4'  && results.stagesComplete?.top4  && !(results.top4  || []).includes(enName)) return true;
    if (stage === 'top2'  && results.stagesComplete?.top2  && !(results.top2  || []).includes(enName)) return true;
    if (stage === 'winner' && results.winner && results.winner !== enName) return true;
    return false;
  };

  let max = 0;

  // Lohkovoittajat (per lohko)
  for (const team of (participant.groupWinners || [])) {
    const enName = teamToEnglish(team);
    const letter = teamGroupMap[enName];
    if (letter && results.groups?.[letter]?.complete) {
      if (results.groups[letter].winner === enName) max += 1;
    } else if (!eliminatedSet.has(enName)) {
      max += 1;
    }
  }

  // Top16 (1 pt each)
  for (const team of (participant.top16 || [])) {
    if (!isBlocked(team, 'top16')) max += 1;
  }

  // Top8, top4, top2 — bracket-konfliktit huomioiden
  const stageConfigs = [
    { key: 'top8', pts: 2, rounds: ['ROUND_OF_16', 'LAST_16'] },
    { key: 'top4', pts: 3, rounds: ['QUARTER_FINALS'] },
    { key: 'top2', pts: 4, rounds: ['SEMI_FINALS'] },
  ];

  for (const { key, pts, rounds } of stageConfigs) {
    const candidates = new Map(); // enName → futureWeight
    for (const team of (participant[key] || [])) {
      if (!isBlocked(team, key)) {
        const enName = teamToEnglish(team);
        candidates.set(enName, calcFutureWeight(enName, key, participant));
      }
    }

    const removed = new Set();
    for (const m of (results.bracket || [])) {
      if (!rounds.includes(m.round)) continue;
      if (candidates.has(m.team1) && candidates.has(m.team2)) {
        const w1 = candidates.get(m.team1), w2 = candidates.get(m.team2);
        removed.add(w1 >= w2 ? m.team2 : m.team1);
      }
    }

    for (const enName of candidates.keys()) {
      if (!removed.has(enName)) max += pts;
    }
  }

  // Voittaja (5 pt)
  if (participant.winner && !isBlocked(participant.winner, 'winner')) max += 5;

  return max;
}

function calcFutureWeight(enName, fromStage, participant) {
  const order = ['top8', 'top4', 'top2', 'winner'];
  const pts   = { top8: 2, top4: 3, top2: 4, winner: 5 };
  let w = 0, past = false;
  for (const s of order) {
    if (!past) { if (s === fromStage) past = true; continue; }
    if (s === 'winner') {
      if (participant.winner && teamToEnglish(participant.winner) === enName) w += 5;
    } else {
      if ((participant[s] || []).some(t => teamToEnglish(t) === enName)) w += pts[s];
    }
  }
  return w;
}

// Tasatilanne-vertailu: palauttaa -1/0/1 (a < b, tasa, a > b järjestyksessä)
export function tiebreaker(a, b, results) {
  const top2  = new Set(results.top2  || []);
  const top4  = new Set(results.top4  || []);
  const top8  = new Set(results.top8  || []);
  const top16 = new Set(results.top16 || []);

  const hasWinner = p => results.winner && teamToEnglish(p.winner) === results.winner;
  const count = (list, set) => (list || []).filter(t => set.has(teamToEnglish(t))).length;

  const checks = [
    [hasWinner(b) ? 1 : 0, hasWinner(a) ? 1 : 0],
    [count(b.top2,  top2),  count(a.top2,  top2)],
    [count(b.top4,  top4),  count(a.top4,  top4)],
    [count(b.top8,  top8),  count(a.top8,  top8)],
    [count(b.top16, top16), count(a.top16, top16)],
  ];

  for (const [bv, av] of checks) {
    if (bv !== av) return bv - av;
  }
  return 0;
}
