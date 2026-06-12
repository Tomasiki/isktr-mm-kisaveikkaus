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
