'use strict';
/* Mode « à voix haute » : les annonces se font à l'oral.
   - Mode simple : l'appli ne gère que les dés et le chapeau (fiches physiques sur la table).
   - Mode complet : l'appli gère aussi les joueurs, les tours et les fiches (charge / décharge). */

// Dés et chapeau de la manche en cours
const O = {
  dice: [0, 0, 0, 0, 0], table: [false, false, false, false, false],
  open: false, rolled: [], armed: false, armT: null,
  mixed: false, // lancer du tour déjà fait (chapeau OU table). Il faut l'avoir fait pour regarder dans le chapeau.
  last: null,   // dernier lancer : { where: 'hat' | 'table', n }
};

// La partie (joueurs dans l'ordre des aiguilles d'une montre, fiches, pot, phase)
let G = null;
const full = () => G && G.mode === 'complet';

// Réglages de la préparation
let OS = { mode: 'simple', names: ['Joueur 1', 'Joueur 2', 'Joueur 3'], tokenType: 'cailloux' };
try { OS = Object.assign(OS, JSON.parse(localStorage.getItem('pm-oral-setup'))); } catch (e) {}
const saveOS = () => { try { localStorage.setItem('pm-oral-setup', JSON.stringify(OS)); } catch (e) {} };

/* ---------- Sauvegarde de la partie (si l'appli se ferme) ---------- */
const GAME_SCREENS = ['oral', 'oralReveal', 'oralDir', 'oralEnd', 'oralWheel'];
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
  if (OS.mode !== 'complet') {
    G = { mode: 'simple', players: [], msg: '', over: false };
    return newRound(null);
  }
  const names = OS.names.map((s, i) => s.trim() || `Joueur ${i + 1}`);
  G = {
    mode: 'complet',
    players: names.map(name => ({ name, tokens: 0, out: false })),
    pot: 2 * names.length + 1,
    tokenType: OS.tokenType,
    phase: 'charge', dir: null, roundDir: null,
    current: null, prev: null,
    msg: '', anim: null, over: false, loser: null,
    wheel: { spun: false, rot: 0, pick: null, done: false },
  };
  S.screen = 'oralWheel';
  render();
}

function newRound(starter) {
  O.dice = O.dice.map(rollDie);
  O.table = [false, false, false, false, false];
  O.open = false; O.rolled = []; O.armed = false;
  O.mixed = false; O.last = null;
  if (full()) {
    G.current = starter; G.prev = null; G.roundDir = null;
    G.msg = (G.msg ? G.msg + ' ' : '') + `Nouvelle manche : ${P(starter)} commence.`;
  }
  S.screen = 'oral';
  render();
}

// Sens du jeu en cours : fixe pendant la décharge, choisi au premier passage pendant la charge
const playDir = () => (G.phase === 'decharge' ? G.dir : G.roundDir);
const dirName = d => (d === 1 ? 'sens des aiguilles d\'une montre ↻' : 'sens inverse ↺');

/* ---------- Dés ---------- */
const hatIdx = () => O.dice.map((_, i) => i).filter(i => !O.table[i]);
const tableIdx = () => O.dice.map((_, i) => i).filter(i => O.table[i]);
// Un seul lancer par tour : mélanger le chapeau OU lancer la table, et toujours AVANT de regarder.
// Le tour se termine quand on passe le téléphone : on peut rouvrir le chapeau autant qu'on veut avant.
const mixLocked = () => O.mixed;

function oralShakeHat() {
  if (S.busy) return;
  const idx = hatIdx();
  if (!idx.length || mixLocked() || O.open) return; // on mélange chapeau fermé
  idx.forEach(i => { O.dice[i] = rollDie(); });
  O.rolled = [];
  O.mixed = true;
  O.last = { where: 'hat', n: idx.length };
  Sound.land(); vibrate([30, 40, 30]);
  render();
}

function oralRollTable() {
  const idx = tableIdx();
  if (!idx.length || mixLocked()) return;
  idx.forEach(i => { O.dice[i] = rollDie(); });
  O.mixed = true;
  O.rolled = [];
  O.last = { where: 'table', n: idx.length };
  O.throwing = idx;
  render();
  O.throwing = [];
  animateThrow(idx);
}

// Déplace un dé : vers la table (seulement si le chapeau est ouvert) ou vers le chapeau
function moveDie(i, where) {
  if (S.busy) return;
  if (where === 'table' && !O.table[i] && O.open) O.table[i] = true;
  else if (where === 'hat' && O.table[i]) O.table[i] = false;
  else return render();
  O.rolled = [];
  Sound.click(0.4);
  render();
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
    if (++n >= steps) {
      clearInterval(t); el() && el().classList.remove('shaking'); S.busy = false;
      then();
    }
  }, 90);
}

/* ---------- Glisser un dé entre le chapeau et la table ---------- */
let drag = null, dragEndedAt = 0;
document.addEventListener('pointerdown', e => {
  const d = e.target.closest('#app[data-screen="oral"] .die[data-act="oralTap"]');
  if (!d || S.busy) return;
  drag = { el: d, i: +d.dataset.arg, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
});
document.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) > 12) {
    drag.moved = true;
    drag.el.classList.add('dragging');
    try { drag.el.setPointerCapture(e.pointerId); } catch (err) {}
  }
  if (drag.moved) drag.el.style.transform = `translate(${dx}px, ${dy}px) scale(1.12) rotate(${dx / 8}deg)`;
});
function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  if (!d.moved) return;
  dragEndedAt = Date.now();
  d.el.style.visibility = 'hidden';
  const under = document.elementFromPoint(e.clientX, e.clientY);
  d.el.style.visibility = '';
  const zone = under && under.closest('[data-zone]');
  // Lâché hors des zones : on se fie à la direction (la table est au-dessus du chapeau)
  const where = zone ? zone.dataset.zone : (e.clientY < d.y ? 'table' : 'hat');
  moveDie(d.i, where);
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);
// Après un glissement, on ignore le « clic » que le navigateur envoie au relâchement
document.addEventListener('click', e => {
  if (Date.now() - dragEndedAt < 120 && e.target.closest('.die')) { e.stopPropagation(); e.preventDefault(); }
}, true);

/* ---------- Fiches : charge puis décharge ---------- */
function applyLoss(loser) {
  const winner = loser === G.current ? G.prev : G.current;
  const W = G.players[winner];
  if (G.phase === 'charge') {
    // Le perdant prend une fiche du pot
    G.players[loser].tokens++;
    G.pot--;
    G.anim = { from: 'pot', to: `seat-${loser}` };
    G.msg = `${P(loser)} prend une fiche du pot.`;
    if (G.pot === 0) return startDecharge(loser);
  } else {
    // Le gagnant se débarrasse d'une fiche : elle repart au milieu de la table
    W.tokens--;
    G.pot++;
    G.anim = { from: `seat-${winner}`, to: 'pot' };
    G.msg = `${P(winner)} gagne et remet une fiche au milieu.`;
    if (W.tokens === 0) {
      W.out = true;
      G.msg += ` ${P(winner)} n'a plus de fiche : sauvé ! 🎉`;
    }
    if (activeCount() <= 1) return endGame(G.players.findIndex(p => !p.out));
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

/* ---------- Roue de la fortune : qui commence ? ---------- */
const WHEEL_MS = 4800;
function spinWheel() {
  const W = G.wheel;
  if (W.spun) return;
  const n = G.players.length, seg = 360 / n;
  W.pick = Math.floor(Math.random() * n);
  // Le pointeur est en haut : on vise le secteur choisi, pas forcément en plein milieu
  const jitter = (Math.random() - 0.5) * seg * 0.7;
  W.rot = 360 * 6 + (360 - (W.pick + 0.5) * seg) - jitter;
  W.spun = true;
  render();
  // Le navigateur doit d'abord afficher la roue à 0° avant de la faire tourner
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const wheel = document.getElementById('wheel');
    if (wheel) wheel.style.transform = `rotate(${W.rot}deg)`;
  }));
  // Cliquetis de plus en plus lents, comme une vraie roue
  let t = 0, gap = 45;
  while (t < WHEEL_MS - 300) { Sound.click(0.35, t / 1000); t += gap; gap *= 1.07; }
  setTimeout(() => {
    W.done = true;
    Sound.tada();
    vibrate([60, 40, 60]);
    render();
  }, WHEEL_MS + 150);
}

function wheelSVG() {
  const n = G.players.length, seg = 360 / n, r = 140, c = 150;
  const cols = ['#c0262d', '#1f4fbf', '#1d7a3a', '#c9971f', '#7a3fb0', '#d0661a', '#11808a', '#8a5a2b'];
  const pt = a => [c + r * Math.sin(a * Math.PI / 180), c - r * Math.cos(a * Math.PI / 180)];
  const fs = n <= 4 ? 17 : n <= 6 ? 14 : 12;
  const parts = G.players.map((p, i) => {
    const [x1, y1] = pt(i * seg), [x2, y2] = pt((i + 1) * seg), mid = (i + 0.5) * seg;
    const win = G.wheel.done && i === G.wheel.pick;
    return `<path d="M${c} ${c} L${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 ${seg > 180 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z"
        fill="${cols[i % cols.length]}" stroke="${win ? '#fff' : '#fff6'}" stroke-width="${win ? 5 : 2}"/>
      <text transform="rotate(${mid} ${c} ${c})" x="${c}" y="${c - r * 0.62}" text-anchor="middle" dominant-baseline="middle"
        font-size="${fs}" font-weight="700" fill="#fff" font-family="system-ui, sans-serif">${esc(p.name.slice(0, 10))}</text>`;
  }).join('');
  return `<svg viewBox="0 0 300 300" class="wheel-svg">
    <circle cx="${c}" cy="${c}" r="${r + 8}" fill="#5a3418"/>
    ${parts}
    <circle cx="${c}" cy="${c}" r="22" fill="#e3b341" stroke="#8a6510" stroke-width="3"/>
  </svg>`;
}

/* ---------- Actions ---------- */
Object.assign(actions, {
  oralSetup() { S.screen = 'oralSetup'; render(); },
  oralResume() {
    const s = savedGame();
    if (!s) return;
    G = s.G; Object.assign(O, s.O, { open: false, rolled: [], armed: false });
    G.anim = null;
    if (s.screen === 'oralWheel' && !G.wheel.done) G.wheel = { spun: false, rot: 0, pick: null, done: false };
    S.screen = s.screen;
    Sound.init();
    render();
  },
  oMode(m) { OS.mode = m; saveOS(); render(); },
  oCount(d) {
    const n = Math.max(2, Math.min(8, OS.names.length + +d));
    while (OS.names.length < n) OS.names.push(`Joueur ${OS.names.length + 1}`);
    OS.names.length = n;
    saveOS(); render();
  },
  oToken(t) { OS.tokenType = t; saveOS(); render(); },
  oralGo() { Sound.init(); oralNewGame(); },
  oralAgain() { Sound.init(); oralNewGame(); },
  oralSpin() { Sound.init(); spinWheel(); },
  oralWheelGo() { G.msg = ''; newRound(G.wheel.pick); },
  oralSimpleRound() { newRound(null); },

  oralPeek() {
    if (S.busy || (!O.open && !O.mixed)) return; // il faut avoir lancé avant de regarder
    O.open = !O.open;
    O.rolled = [];
    Sound.init();
    O.open ? Sound.hatOpen() : Sound.hatClose();
    vibrate([40, 70, 40]);
    render();
  },
  oralShake() { if (mixLocked() || O.open) return; Sound.init(); fakeShake(oralShakeHat); },
  oralRoll() { if (S.busy || mixLocked()) return; Sound.init(); oralRollTable(); },
  oralTap(i) { i = +i; moveDie(i, O.table[i] ? 'hat' : 'table'); },
  oralPass(dir) {
    if (O.open || S.busy) return;
    dir = +dir;
    const from = G.current, to = nextActive(from, dir);
    let note = '';
    if (G.phase === 'charge' && G.roundDir == null) {
      G.roundDir = dir;
      note = ` On tourne dans le ${dirName(dir)}.`;
    }
    G.prev = from; G.current = to;
    O.mixed = false; O.armed = false;
    G.msg = `${P(from)} passe le chapeau à ${P(to)}.${note}`;
    Sound.click(0.5); vibrate(30);
    render();
  },
  // Mode simple : on passe le téléphone, le joueur suivant devra lancer avant de regarder
  oralPassSimple() {
    if (O.open || S.busy) return;
    O.mixed = false; O.armed = false; O.rolled = [];
    Sound.click(0.5); vibrate(30);
    render();
  },
  oralHat() {
    if (full() && G.prev == null) return;
    if (!O.armed) {
      O.armed = true; render();
      clearTimeout(O.armT);
      O.armT = setTimeout(() => { O.armed = false; if (S.screen === 'oral') render(); }, 3000);
      return;
    }
    clearTimeout(O.armT);
    O.armed = false; O.rolled = []; O.open = false;
    S.screen = 'oralReveal';
    Sound.tada(); vibrate([0, 500, 40, 80, 300]);
    render();
  },
  oralCancelHat() { S.screen = 'oral'; render(); },
  oralLoser(i) { applyLoss(+i); },
  oralDir(d) {
    G.dir = +d;
    G.msg = `Décharge dans le ${dirName(G.dir)}.`;
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
  if (full() && G.anim && S.screen === 'oral') {
    const a = G.anim;
    G.anim = null;
    setTimeout(() => flyToken(G.tokenType, a.from, a.to), 250);
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
  const who = full() ? `${esc(G.players[G.current].name)} seul les voit` : 'toi seul les vois';
  const hatZone = open
    ? `<div class="dice-row under ${reveal ? '' : 'peek'}" id="cup">${h.map(i => oralDie(i, !reveal)).join('') || '<span class="empty">chapeau vide</span>'}</div>`
    : `<div class="cup-wrap"><div class="cup ${h.length ? 'ready' : ''}" id="cup">${HAT_SVG}<span class="cnt">${h.length}</span></div></div>`;
  return `<div class="felt">
    <div class="zone" data-zone="table"><div class="zl">Sur la table · visibles par tous</div>
      <div class="dice-row" id="tableDice">${t.map(i => oralDie(i, !reveal)).join('') || '<span class="empty">aucun dé</span>'}</div></div>
    <div class="zone" data-zone="hat"><div class="zl">${reveal ? 'Dans le chapeau · levé !' : open ? `Dans le chapeau · ${who}` : 'Dans le chapeau'}</div>
      ${hatZone}
    </div>
  </div>`;
}

function passButtons() {
  const cur = G.current;
  const cw = nextActive(cur, 1), ccw = nextActive(cur, -1);
  const dis = O.open ? 'disabled' : '';
  const btn = (d, to, label) => `<button class="btn primary" data-act="oralPass" data-arg="${d}" ${dis}>${label.replace('%', esc(G.players[to].name))}</button>`;
  const d = playDir();
  if (d != null || cw === ccw) {
    const dd = d || 1;
    return btn(dd, nextActive(cur, dd), `📱 Passer à % ${dd === 1 ? '↻' : '↺'}`);
  }
  // Début de manche pendant la charge : ce premier passage choisit le sens
  return `<p class="hint small">À qui tu passes ? Ça fixe le sens pour toute la manche.</p>
    <div class="row2">${btn(1, cw, '📱 ↻ %')}${btn(-1, ccw, '% ↺ 📱')}</div>`;
}

// Regarder n'est possible qu'après le lancer du tour
function peekButton(label) {
  if (O.open) return '<button class="btn ghost" data-act="oralPeek">🙈 Refermer le chapeau</button>';
  if (!O.mixed) return '<button class="btn" data-act="oralPeek" disabled>👀 Lance d\'abord pour regarder</button>';
  return `<button class="btn" data-act="oralPeek">${label}</button>`;
}

function lastRollHTML() {
  const L = O.last;
  const txt = !L ? 'Pas encore de lancer dans cette manche'
    : L.where === 'hat' ? `🎩 Dernier lancer : <b>chapeau mélangé</b> (${L.n} dé${L.n > 1 ? 's' : ''})`
    : `🎲 Dernier lancer : <b>${L.n} dé${L.n > 1 ? 's' : ''} lancé${L.n > 1 ? 's' : ''} sur la table</b>`;
  return `<div class="lastroll ${L ? L.where : ''}">${txt}</div>`;
}

function oralHTML() {
  const t = tableIdx().length, h = hatIdx().length, locked = mixLocked();
  const mine = O.open ? `<p class="mine">Avec la table : <b>${handName(evaluate(O.dice))}</b> · <small>touche ou fais glisser un dé</small></p>`
    : t ? '<p class="hint small">Touche ou fais glisser un dé de la table pour le remettre dans le chapeau.</p>' : '';
  const diceButtons = `<div class="row2">
        <button class="btn" data-act="oralShake" ${h && !locked && !O.open ? '' : 'disabled'}>🎩 Mélanger</button>
        <button class="btn" data-act="oralRoll" ${t && !locked ? '' : 'disabled'}>🎲 Lancer la table${t ? ` (${t})` : ''}</button>
      </div>
      ${locked ? '<p class="hint small">✓ Lancer fait : un seul par tour (chapeau ou table).</p>' : '<p class="hint small">Commence par mélanger le chapeau ou lancer la table.</p>'}`;

  if (!full()) {
    return `${oralBar()}
      ${lastRollHTML()}
      ${oralFelt(false)}
      ${mine}
      <div class="actions">
        ${peekButton('👀 Regarder dans le chapeau')}
        ${diceButtons}
        <button class="btn primary" data-act="oralPassSimple" ${O.open ? 'disabled' : ''}>📱 Passer au suivant</button>
        ${O.open ? '<p class="hint small">Referme le chapeau pour passer le téléphone.</p>' : ''}
        <button class="btn danger big ${O.armed ? 'armed' : ''}" data-act="oralHat">${O.armed ? 'Sûr ? Touche encore' : '🎩 Chapeau !'}</button>
      </div>`;
  }

  const me = esc(G.players[G.current].name);
  // Chapeau ouvert : la table devient une simple ligne pour laisser la place aux dés
  return `${oralBar()}
    ${O.open ? playersStripHTML(G) : pokerTableHTML(G)}
    ${G.msg && !O.open ? `<p class="gmsg">${G.msg}</p>` : ''}
    ${lastRollHTML()}
    ${oralFelt(false)}
    ${mine}
    <div class="actions">
      ${peekButton(`👀 ${me} regarde dans le chapeau`)}
      ${diceButtons}
      ${passButtons()}
      ${O.open ? '<p class="hint small">Referme le chapeau pour passer le téléphone.</p>' : ''}
      <button class="btn danger big ${O.armed ? 'armed' : ''}" data-act="oralHat" ${G.prev == null ? 'disabled' : ''}>${
        O.armed ? 'Sûr ? Touche encore' : G.prev == null ? '🎩 Chapeau !' : `🎩 Chapeau à ${esc(G.players[G.prev].name)} !`}</button>
    </div>`;
}

function oralRevealHTML() {
  const top = `${oralBar()}<div class="reveal">
    <h2 class="shout">« Chapeau ! »</h2>
    ${full() ? `<p>${P(G.current)} ne croit pas ${P(G.prev)}.</p>` : ''}
    ${oralFelt(true)}
    <p class="actual">Il y a : <b>${handName(evaluate(O.dice))}</b></p>`;
  if (!full()) {
    return `${top}
      <p class="hint">Comparez avec la dernière annonce : qui a menti ?</p>
      <button class="btn primary big" data-act="oralSimpleRound">Nouvelle manche</button>
      <button class="btn ghost" data-act="oralCancelHat">↩ Annuler (fausse manip)</button>
    </div>`;
  }
  const a = G.prev, b = G.current;
  const rule = G.phase === 'charge' ? 'Le perdant prend une fiche du pot.' : 'Le gagnant remet une de ses fiches au milieu.';
  return `${top}
    <h3 class="ask">Qui a perdu ?</h3>
    <p class="hint small">${rule}</p>
    <div class="row2">
      <button class="btn loser" data-act="oralLoser" data-arg="${a}"><b>${esc(G.players[a].name)}</b><small>a annoncé</small></button>
      <button class="btn loser" data-act="oralLoser" data-arg="${b}"><b>${esc(G.players[b].name)}</b><small>a dit chapeau</small></button>
    </div>
    <button class="btn ghost" data-act="oralCancelHat">↩ Annuler (fausse manip)</button>
  </div>`;
}

function oralWheelHTML() {
  const W = G.wheel;
  return `${oralBar()}
    <div class="wheel-screen">
      <h2>Qui commence ?</h2>
      <div class="wheel-box">
        <div class="wheel-ptr"></div>
        <div class="wheel" id="wheel" style="transform:rotate(${W.done ? W.rot : 0}deg)">${wheelSVG()}</div>
      </div>
      ${!W.spun ? '<button class="btn primary big" data-act="oralSpin">🎡 Faire tourner la roue</button>'
        : W.done ? `<p class="wheel-res">${P(W.pick)} commence !</p><button class="btn primary big" data-act="oralWheelGo">C'est parti !</button>`
        : '<p class="hint big">La roue tourne…</p>'}
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
  const n = OS.names.length, complet = OS.mode === 'complet';
  return `<div class="topbar"><button class="icon" data-act="menu" aria-label="Retour">←</button><div class="apptitle">Nouvelle partie</div></div>
    <section class="card">
      <h2>Mode de jeu</h2>
      <div class="styles">
        <button class="style-opt mode ${!complet ? 'on' : ''}" data-act="oMode" data-arg="simple">
          <span class="mode-ico">🎩</span><b>Simple</b><small>Les dés et le chapeau. Les fiches sont sur la vraie table.</small>
        </button>
        <button class="style-opt mode ${complet ? 'on' : ''}" data-act="oMode" data-arg="complet">
          <span class="mode-ico">🪨</span><b>Complet</b><small>L'appli compte les fiches et les tours. Pratique dans le train.</small>
        </button>
      </div>
    </section>
    ${complet ? `
    <section class="card">
      <div class="lives"><h2>Joueurs</h2>
        <div class="stepper"><button class="icon" data-act="oCount" data-arg="-1" ${n <= 2 ? 'disabled' : ''}>−</button><b>${n}</b><button class="icon" data-act="oCount" data-arg="1" ${n >= 8 ? 'disabled' : ''}>+</button></div>
      </div>
      <p class="hint small">Entre les noms dans l'ordre autour de la table (sens des aiguilles d'une montre). Une roue tire au sort qui commence.</p>
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
    </section>` : ''}
    <button class="btn primary big" data-act="oralGo">C'est parti !</button>`;
}

render();
