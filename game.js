'use strict';
/* Règles pures du poker menteur (aucun accès au DOM). */

const FACES = ['9', '10', 'V', 'D', 'R', 'A'];
const FACE_NAMES = ['9', '10', 'Valet', 'Dame', 'Roi', 'As'];
const PLURAL = ['9', '10', 'Valets', 'Dames', 'Rois', 'As'];
const SUITS = ['♠', '♥', '♣', '♦', '♠', '♥'];
const TYPE_NAMES = ['Rien', 'Paire', 'Double paire', 'Brelan', 'Petite suite', 'Grande suite', 'Full', 'Carré', 'Poker'];

// Une main : t = type (0..8), a / b = valeurs de faces (0..5)
const H = (t, a = 0, b = 0) => ({ t, a, b });
const score = h => h.t * 100 + h.a * 10 + h.b;
const de = v => (v === 5 ? "d'As" : 'de ' + PLURAL[v]);
const rollDie = () => Math.floor(Math.random() * 6);

function handName(h) {
  switch (h.t) {
    case 0: return `Rien (${FACE_NAMES[h.a]} haut)`;
    case 1: return `Paire ${de(h.a)}`;
    case 2: return `Double paire ${PLURAL[h.a]} et ${PLURAL[h.b]}`;
    case 3: return `Brelan ${de(h.a)}`;
    case 4: return 'Petite suite (9 → Roi)';
    case 5: return 'Grande suite (10 → As)';
    case 6: return `Full ${PLURAL[h.a]} par ${PLURAL[h.b]}`;
    case 7: return `Carré ${de(h.a)}`;
    case 8: return `Poker ${de(h.a)}`;
  }
  return '?';
}

// Meilleure main contenue dans 5 dés
function evaluate(dice) {
  const c = [0, 0, 0, 0, 0, 0];
  dice.forEach(v => c[v]++);
  const g = [];
  for (let v = 5; v >= 0; v--) if (c[v]) g.push({ v, n: c[v] });
  g.sort((x, y) => y.n - x.n || y.v - x.v);
  if (g[0].n === 5) return H(8, g[0].v);
  if (g[0].n === 4) return H(7, g[0].v);
  if (g[0].n === 3 && g[1].n === 2) return H(6, g[0].v, g[1].v);
  if (g.length === 5) {
    if (!c[5]) return H(4);
    if (!c[0]) return H(5);
  }
  if (g[0].n === 3) return H(3, g[0].v);
  if (g[0].n === 2 && g[1].n === 2) return H(2, g[0].v, g[1].v);
  if (g[0].n === 2) return H(1, g[0].v);
  return H(0, g[0].v);
}

// Toutes les annonces possibles, de la plus faible à la plus forte
const ALL_CLAIMS = (() => {
  const L = [];
  for (let a = 0; a < 6; a++) L.push(H(1, a));
  for (let a = 0; a < 6; a++) for (let b = 0; b < a; b++) L.push(H(2, a, b));
  for (let a = 0; a < 6; a++) L.push(H(3, a));
  L.push(H(4), H(5));
  for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) if (a !== b) L.push(H(6, a, b));
  for (let a = 0; a < 6; a++) L.push(H(7, a));
  for (let a = 0; a < 6; a++) L.push(H(8, a));
  return L.sort((x, y) => score(x) - score(y));
})();

const claimsAbove = claim => ALL_CLAIMS.filter(c => !claim || score(c) > score(claim));
// L'annonce est vraie si les dés valent au moins ce qui a été annoncé
const isTrue = (dice, claim) => score(evaluate(dice)) >= score(claim);

/* ---------- Ordinateur ---------- */

// Probabilité que (dés fixes + nRand dés aléatoires) atteigne targetScore
function probAtLeast(fixed, nRand, targetScore, N = 300) {
  if (nRand === 0) return score(evaluate(fixed)) >= targetScore ? 1 : 0;
  const d = new Array(5);
  let ok = 0;
  for (let n = 0; n < N; n++) {
    for (let j = 0; j < fixed.length; j++) d[j] = fixed[j];
    for (let k = 0; k < nRand; k++) d[fixed.length + k] = rollDie();
    if (score(evaluate(d)) >= targetScore) ok++;
  }
  return ok / N;
}

const Bot = {
  // Crier « menteur » ? Le bot ne connaît que les dés sur la table.
  shouldCall(round) {
    if (!claimsAbove(round.claim).length) return true;
    const visible = round.dice.filter((_, i) => round.table[i]);
    const p = probAtLeast(visible, 5 - visible.length, score(round.claim), 800);
    return p < 0.22 + Math.random() * 0.12;
  },

  // Quels dés relancer (true = relancer) pour pouvoir annoncer au-dessus de claim honnêtement
  chooseRerolls(dice, claim) {
    const above = claimsAbove(claim);
    const target = score(above[0]);
    let best = null, bestP = -1;
    for (let mask = 0; mask < 32; mask++) {
      const fixed = [];
      let n = 0;
      for (let i = 0; i < 5; i++) (mask >> i) & 1 ? n++ : fixed.push(dice[i]);
      const p = probAtLeast(fixed, n, target, 200) + Math.random() * 0.02;
      if (p > bestP) { bestP = p; best = mask; }
    }
    return [0, 1, 2, 3, 4].map(i => !!((best >> i) & 1));
  },

  chooseClaim(dice, claim) {
    const above = claimsAbove(claim);
    const actual = evaluate(dice);
    if (actual.t > 0 && (!claim || score(actual) > score(claim))) {
      return ALL_CLAIMS.find(c => score(c) === score(actual));
    }
    // Bluff : on monte un peu au-dessus
    return above[Math.min(above.length - 1, Math.floor(Math.random() * (claim ? 2 : 4)))];
  },
};

if (typeof module !== 'undefined') {
  module.exports = { FACES, H, score, evaluate, handName, ALL_CLAIMS, claimsAbove, isTrue, probAtLeast, Bot };
}
