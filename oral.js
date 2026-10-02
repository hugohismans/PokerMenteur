'use strict';
/* Mode « à voix haute » : l'appli gère les dés, le chapeau, les tours et les fiches ;
   les annonces se font à l'oral. */

// Dés et chapeau de la manche en cours
const O = {
  dice: [0, 0, 0, 0, 0], table: [false, false, false, false, false],
  open: false, rolled: [], armed: false, armT: null,
  mixed: false, // le joueur a déjà mélangé pendant son tour
  last: null,   // dernier lancer : { where: 'hat' | 'table', n }
};

// La partie : joueurs (dans l'ordre des aiguilles d'une montre), fiches, pot, phase
let G = null;

// Réglages de la préparation
let OS = { names: ['Joueur 1', 'Joueur 2', 'Joueur 3'], tokenType: 'cailloux' };
try { OS = JSON.parse(localStorage.getItem('pm-oral-setup')) || OS; } catch (e) {}
const saveOS = () => { try { localStorage.setItem('pm-oral-setup', JSON.stringify(OS)); } catch (e) {} };

/* ---------- Sauvegarde de la partie (si l'appli se ferme) ---------- */
const GAME_SCREENS = ['oral', 'oralReveal', 'oralDir', 'oralEnd'];
function saveGame() {
  try {
    localStorage.setItem('pm-game', JSON.stringify({
      G, screen: S.screen,
      O: { dice: O.dice, table: O.table, mixed: O.mixed, last: O.last },
    }));
  } catch (e) {}
}
function savedGame() {
  try {
    const s = JSON.parse(localStorage.getItem('pm-game'));
    return s && s.G && !s.G.over ? s : null;
  } catch (e) { return null; }
}

/* ---------- Joueurs et tours ---------- */
const P = i => `<b>${esc(G.players[i].name)}</b>`;
const activeCount = () => G.players.filter(p => !p.out).length;
function nextActive(i, dir) {
  const n = G.players.length;
  let j = i;
  do { j = (j + dir + n) % n; } while (G.players[j].out && j !== i);
  return j;
}

function oralNewGame() {
  const names = OS.names.map((s, i) => s.trim() || `Joueur ${i + 1}`);
  G = {
    players: names.map(name => ({ name, tokens: 0, out: false })),
    pot: 2 * names.length + 1,
    tokenType: OS.tokenType,
    phase: 'charge', dir: null,
    current: 0, prev: null,
    msg: `Charge : ${2 * names.length + 1} fiches au milieu de la table.`,
    anim: null, over: false, loser: null,
  };
  newRound(0);
}

function newRound(starter) {
  O.dice = O.dice.map(rollDie);
  O.table = [false, false, false, false, false];
  O.open = false; O.rolled = []; O.armed = false;
  O.mixed = false; O.last = null;
  G.current = starter; G.prev = null;
  G.msg = (G.msg ? G.msg + ' ' : '') + `Nouvelle manche : ${P(starter)} commence.`;
  S.screen = 'oral';
  render();
}

/* ---------- Dés ---------- */
const hatIdx = () => O.dice.map((_, i) => i).filter(i => !O.table[i]);
const tableIdx = () => O.dice.map((_, i) => i).filter(i => O.table[i]);

function oralShakeHat() {
  if (S.busy) return;
  const idx = hatIdx();
  if (!idx.length || O.mixed) return;
  idx.forEach(i => { O.dice[i] = rollDie(); });
  O.rolled = O.open ? idx : [];
  O.mixed = true;
  O.last = { where: 'hat', n: idx.length };
  Sound.land(); vibrate([30, 40, 30]);
  render();
}

function oralRollTable() {
  const idx = tableIdx();
  if (!idx.length) return;
  idx.forEach(i => { O.dice[i] = rollDie(); });
  O.rolled = [];
  O.last = { where: 'table', n: idx.length };
  O.throwing = idx;
  render();
  O.throwing = [];
  animateThrow(idx);
}

// Les dés lancés roulent sur le tapis : faces qui défilent, rebonds, claquements
const THROW_MS = 1100;
function animateThrow(idx) {
  S.busy = true;
  idx.forEach((i, k) => {
    const el = document.querySelector(`#tableDice [data-arg="${i}"]`);
    if (!el) return;
    const delay = k * 90;
    const flick = setInterval(() => setFace(el, rollDie()), 75);
    setTimeout(() => { clearInterval(flick); setFace(el, O.dice[i]); }, delay + THROW_MS * 0.72);
    // un claquement à chaque rebond
    [0.38, 0.6, 0.78].forEach((t, j) => Sound.click(0.55 - j * 0.15, (delay + THROW_MS * t) / 1000));
  });
  vibrate([0, 400, 30, 150, 20]);
  setTimeout(() => {
    document.querySelectorAll('#tableDice .throw').forEach(e => e.classList.remove('throw'));
    S.busy = false;
  }, THROW_MS + idx.length * 90);
}

function setFace(el, v) {
  el.className = el.className.replace(/\bf\d\b/, 'f' + v);
  el.innerHTML = faceInner(v);
}

// Fait trembler le chapeau quelques instants avant de mélanger
function fakeShake(then, id = 'cup', steps = 7) {
  if (S.busy) return;
  S.busy = true;
  let n = 0;
  const el = () => document.getElementById(id);
  el() && el().classList.add('shaking');
  const t = setInterval(() => {
    Sound.rattle(); vibrate(10);
    if (++n >= steps) { clearInterval(t); el() && el().classList.remove('shaking'); S.busy = false; then(); }
  }, 90);
}

/* ---------- Fiches : charge puis décharge ---------- */
function applyLoss(loser) {
  const winner = loser === G.current ? G.prev : G.current;
  const L = G.players[loser], W = G.players[winner];
  L.tokens++;
  if (G.phase === 'charge') {
    G.pot--;
    G.anim = { from: 'pot', to: loser };
    G.msg = `${P(loser)} prend une fiche du pot.`;
    if (G.pot === 0) return startDecharge(loser);
  } else {
    W.tokens--;
    G.anim = { from: winner, to: loser };
    G.msg = `${P(winner)} donne une fiche à ${P(loser)}.`;
    if (W.tokens === 0) {
      W.out = true;
      G.msg += ` ${P(winner)} n'a plus de fiche : sauvé ! 🎉`;
    }
    if (activeCount() <= 1) return endGame(loser);
  }
  newRound(loser);
}

function startDecharge(lastLoser) {
  G.phase = 'decharge';
  G.current = lastLoser; G.prev = null;
  const safe = G.players.filter(p => p.tokens === 0);
  safe.forEach(p => { p.out = true; });
  if (safe.length) G.msg += ` Sans fiche, ${safe.map(p => `<b>${esc(p.name)}</b>`).join(', ')} ${safe.length > 1 ? 'sont sauvés' : 'est sauvé'} !`;
  if (activeCount() <= 1) return endGame(lastLoser);
  if (activeCount() === 2) {
    G.dir = 1;
    G.msg += ' Décharge !';
    return newRound(lastLoser);
  }
  G.dirChooser = lastLoser;
  S.screen = 'oralDir';
  Sound.win();
  render();
}

function endGame(loser) {
  G.over = true;
  G.loser = loser;
  G.current = loser; G.prev = null;
  S.screen = 'oralEnd';
  Sound.win();
  render();
}

/* ---------- Actions ---------- */
Object.assign(actions, {
  oralSetup() { S.screen = 'oralSetup'; render(); },
  oralResume() {
    const s = savedGame();
    if (!s) return;
    G = s.G; Object.assign(O, s.O, { open: false, rolled: [], armed: false });
    G.anim = null;
    S.screen = s.screen === 'oralReveal' ? 'oralReveal' : s.screen;
    Sound.init();
    render();
  },
  oCount(d) {
    const n = Math.max(2, Math.min(8, OS.names.length + +d));
    while (OS.names.length < n) OS.names.push(`Joueur ${OS.names.length + 1}`);
    OS.names.length = n;
    saveOS(); render();
  },
  oToken(t) { OS.tokenType = t; saveOS(); render(); },
  oralGo() { Sound.init(); oralNewGame(); },
  oralAgain() { Sound.init(); oralNewGame(); },

  oralPeek() {
    O.open = !O.open;
    O.rolled = [];
    Sound.init();
    O.open ? Sound.hatOpen() : Sound.hatClose();
    vibrate([40, 70, 40]);
    render();
  },
  oralShake() { if (O.mixed) return; Sound.init(); fakeShake(oralShakeHat); },
  oralRoll() { if (S.busy) return; Sound.init(); oralRollTable(); },
  oralTap(i) {
    if (S.busy) return;
    i = +i;
    if (O.table[i]) O.table[i] = false;
    else if (O.open) O.table[i] = true;
    else return;
    O.rolled = [];
    Sound.click(0.4);
    render();
  },
  oralPass(dir) {
    if (O.open || S.busy) return;
    const from = G.current, to = nextActive(from, +dir);
    G.prev = from; G.current = to;
    O.mixed = false; O.armed = false;
    G.msg = `${P(from)} passe le chapeau à ${P(to)}.`;
    Sound.click(0.5); vibrate(30);
    render();
  },
  oralHat() {
    if (G.prev == null) return;
    if (!O.armed) {
      O.armed = true; render();
      clearTimeout(O.armT);
      O.armT = setTimeout(() => { O.armed = false; if (S.screen === 'oral') render(); }, 3000);
      return;
    }
    clearTimeout(O.armT);
    O.armed = false; O.rolled = [];
    S.screen = 'oralReveal';
    Sound.tada(); vibrate([0, 500, 40, 80, 300]);
    render();
  },
  oralCancelHat() { S.screen = 'oral'; render(); },
  oralLoser(i) { applyLoss(+i); },
  oralDir(d) {
    G.dir = +d;
    G.msg = `Décharge dans le sens ${G.dir === 1 ? 'des aiguilles d\'une montre ↻' : 'inverse ↺'}.`;
    newRound(G.dirChooser);
  },
});

document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.oname != null) { OS.names[+el.dataset.oname] = el.value; saveOS(); }
});

// Après chaque affichage : sauvegarde et animation des fiches
function afterRender() {
  if (G && GAME_SCREENS.includes(S.screen)) saveGame();
  if (G && G.anim && S.screen === 'oral') {
    const a = G.anim;
    G.anim = null;
    setTimeout(() => flyToken(G.tokenType, a.from === 'pot' ? 'pot' : `seat-${a.from}`, `seat-${a.to}`), 250);
  }
}

/* ---------- Écrans ---------- */
function oralBar() {
  return `<div class="topbar">
    <div class="apptitle">🎩 Poker Menteur</div>
    <div class="tools">
      <button class="icon" data-act="mute" aria-label="Son">${S.muted ? '🔇' : '🔊'}</button>
      <button class="icon" data-act="quit" aria-label="Quitter">✕</button>
    </div>
  </div>`;
}

function oralDie(i, tap) {
  const v = O.dice[i];
  const k = (O.throwing || []).indexOf(i);
  const cls = ['die', 'f' + v, O.rolled.includes(i) ? 'rolled' : '', k >= 0 ? 'throw' : ''].join(' ');
  if (k >= 0) {
    // trajectoire un peu différente pour chaque dé
    const r = (a, b) => a + Math.random() * (b - a);
    const style = `animation-delay:${k * 90}ms;--dx:${r(-260, -180)}px;--dy:${r(-30, 50)}px;` +
      `--r0:${r(-900, -540)}deg;--r1:${r(-200, -90)}deg;--r2:${r(10, 40)}deg;--hop:${r(-34, -18)}px`;
    return `<button class="${cls}" style="${style}" data-act="oralTap" data-arg="${i}">${faceInner(v)}</button>`;
  }
  return tap
    ? `<button class="${cls}" style="animation-delay:${i * 50}ms" data-act="oralTap" data-arg="${i}">${faceInner(v)}</button>`
    : `<div class="${cls}" style="animation-delay:${i * 50}ms">${faceInner(v)}</div>`;
}

function oralFelt(reveal) {
  const t = tableIdx(), h = hatIdx();
  const open = reveal || O.open;
  const hatZone = open
    ? `<div class="dice-row under ${reveal ? '' : 'peek'}" id="cup">${h.map(i => oralDie(i, !reveal)).join('') || '<span class="empty">chapeau vide</span>'}</div>`
    : `<div class="cup-wrap"><div class="cup ${h.length ? 'ready' : ''}" id="cup">${HAT_SVG}<span class="cnt">${h.length}</span></div></div>`;
  return `<div class="felt">
    <div class="zone"><div class="zl">Sur la table · visibles par tous</div>
      <div class="dice-row" id="tableDice">${t.map(i => oralDie(i, !reveal)).join('') || '<span class="empty">aucun dé</span>'}</div></div>
    <div class="zone"><div class="zl">${reveal ? 'Dans le chapeau · levé !' : open ? `Dans le chapeau · ${esc(G.players[G.current].name)} seul les voit` : 'Dans le chapeau'}</div>
      ${hatZone}
    </div>
  </div>`;
}

function passButtons() {
  const cur = G.current;
  const cw = nextActive(cur, 1), ccw = nextActive(cur, -1);
  const dis = O.open ? 'disabled' : '';
  const btn = (d, to, label) => `<button class="btn primary" data-act="oralPass" data-arg="${d}" ${dis}>${label.replace('%', esc(G.players[to].name))}</button>`;
  if (G.phase === 'decharge' || cw === ccw) {
    const d = G.phase === 'decharge' ? G.dir : 1, to = nextActive(cur, d);
    return btn(d, to, `📱 Passer à % ${d === 1 ? '↻' : '↺'}`);
  }
  return `<div class="row2">${btn(1, cw, '📱 ↻ %')}${btn(-1, ccw, '% ↺ 📱')}</div>`;
}

function oralHTML() {
  const t = tableIdx().length, h = hatIdx().length;
  const me = esc(G.players[G.current].name);
  const tip = O.open
    ? 'Touche un dé pour le changer de place (chapeau ↔ table).'
    : t ? 'Touche un dé de la table pour le remettre dans le chapeau.' : '';
  const L = O.last;
  const lastTxt = !L ? 'Pas encore de lancer dans cette manche'
    : L.where === 'hat' ? `🎩 Dernier lancer : <b>chapeau mélangé</b> (${L.n} dé${L.n > 1 ? 's' : ''})`
    : `🎲 Dernier lancer : <b>${L.n} dé${L.n > 1 ? 's' : ''} lancé${L.n > 1 ? 's' : ''} sur la table</b>`;
  // Chapeau ouvert : la table devient une simple ligne pour laisser la place aux dés
  return `${oralBar()}
    ${O.open ? playersStripHTML(G) : pokerTableHTML(G)}
    ${G.msg && !O.open ? `<p class="gmsg">${G.msg}</p>` : ''}
    <div class="lastroll ${L ? L.where : ''}">${lastTxt}</div>
    ${oralFelt(false)}
    ${O.open ? `<p class="mine">Avec la table : <b>${handName(evaluate(O.dice))}</b> · <small>touche un dé pour le déplacer</small></p>`
      : tip ? `<p class="hint small">${tip}</p>` : ''}
    <div class="actions">
      <button class="btn ${O.open ? 'ghost' : ''}" data-act="oralPeek">${O.open ? '🙈 Refermer le chapeau' : `👀 ${me} regarde dans le chapeau`}</button>
      <div class="row2">
        <button class="btn" data-act="oralShake" ${h && !O.mixed ? '' : 'disabled'}>${O.mixed ? '🎩 Déjà mélangé' : '🎩 Mélanger'}</button>
        <button class="btn" data-act="oralRoll" ${t ? '' : 'disabled'}>🎲 Lancer la table${t ? ` (${t})` : ''}</button>
      </div>
      ${passButtons()}
      ${O.open ? '<p class="hint small">Referme le chapeau pour passer le téléphone.</p>' : ''}
      <button class="btn danger big ${O.armed ? 'armed' : ''}" data-act="oralHat" ${G.prev == null ? 'disabled' : ''}>${
        O.armed ? 'Sûr ? Touche encore' : G.prev == null ? '🎩 Chapeau !' : `🎩 Chapeau à ${esc(G.players[G.prev].name)} !`}</button>
    </div>`;
}

function oralRevealHTML() {
  const a = G.prev, b = G.current;
  const gain = G.phase === 'charge' ? 'prend une fiche du pot' : 'reçoit une fiche de l\'autre';
  return `${oralBar()}<div class="reveal">
    <h2 class="shout">« Chapeau ! »</h2>
    <p>${P(b)} ne croit pas ${P(a)}.</p>
    ${oralFelt(true)}
    <p class="actual">Il y a : <b>${handName(evaluate(O.dice))}</b></p>
    <h3 class="ask">Qui a perdu ?</h3>
    <p class="hint small">Le perdant ${gain}.</p>
    <div class="row2">
      <button class="btn loser" data-act="oralLoser" data-arg="${a}"><b>${esc(G.players[a].name)}</b><small>a annoncé</small></button>
      <button class="btn loser" data-act="oralLoser" data-arg="${b}"><b>${esc(G.players[b].name)}</b><small>a dit chapeau</small></button>
    </div>
    <button class="btn ghost" data-act="oralCancelHat">↩ Annuler (fausse manip)</button>
  </div>`;
}

function oralDirHTML() {
  const c = G.dirChooser, cw = nextActive(c, 1), ccw = nextActive(c, -1);
  return `${oralBar()}
    ${pokerTableHTML(G)}
    <div class="reveal">
      <h2 class="shout gold">Décharge !</h2>
      <p class="gmsg">${G.msg}</p>
      <p>${P(c)} a pris la dernière fiche : à lui de choisir le sens du jeu. Ensuite, il ne change plus.</p>
      <button class="btn primary big" data-act="oralDir" data-arg="1">↻ Sens des aiguilles d'une montre<br><small>${esc(G.players[c].name)} → ${esc(G.players[cw].name)}</small></button>
      <button class="btn primary big" data-act="oralDir" data-arg="-1">↺ Sens inverse<br><small>${esc(G.players[c].name)} → ${esc(G.players[ccw].name)}</small></button>
    </div>`;
}

function oralEndHTML() {
  const l = G.players[G.loser];
  return `${oralBar()}
    ${pokerTableHTML(G)}
    <div class="end">
      <div class="trophy">🏁</div>
      <h2>${esc(l.name)} a perdu la partie</h2>
      <p class="gmsg">${G.msg}</p>
      <p>Il reste avec ${l.tokens} fiche${l.tokens > 1 ? 's' : ''}. Tous les autres sont sauvés !</p>
      <button class="btn primary big" data-act="oralAgain">Rejouer</button>
      <button class="btn ghost" data-act="menu">Menu</button>
    </div>`;
}

function oralSetupHTML() {
  const n = OS.names.length;
  return `<div class="topbar"><button class="icon" data-act="menu" aria-label="Retour">←</button><div class="apptitle">Nouvelle partie</div></div>
    <section class="card">
      <div class="lives"><h2>Joueurs</h2>
        <div class="stepper"><button class="icon" data-act="oCount" data-arg="-1" ${n <= 2 ? 'disabled' : ''}>−</button><b>${n}</b><button class="icon" data-act="oCount" data-arg="1" ${n >= 8 ? 'disabled' : ''}>+</button></div>
      </div>
      <p class="hint small">Dans l'ordre autour de la table, dans le sens des aiguilles d'une montre. Le joueur 1 commence.</p>
      ${OS.names.map((nm, i) => `<div class="prow"><span class="num">${i + 1}</span><input value="${esc(nm)}" data-oname="${i}" maxlength="12" aria-label="Nom du joueur ${i + 1}"></div>`).join('')}
    </section>
    <section class="card">
      <h2>Fiches</h2>
      <div class="tokens">${Object.keys(TOKEN_TYPES).map(t => `
        <button class="style-opt ${OS.tokenType === t ? 'on' : ''}" data-act="oToken" data-arg="${t}">
          <span class="tok-prev">${pileHTML(t, 5, 5, 1)}</span><b>${TOKEN_TYPES[t]}</b>
        </button>`).join('')}
      </div>
      <p class="potinfo">Au milieu de la table : 2 × ${n} + 1 = <b>${2 * n + 1} fiches</b></p>
    </section>
    <button class="btn primary big" data-act="oralGo">C'est parti !</button>`;
}

render();
