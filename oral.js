'use strict';
/* Mode « à voix haute » : l'appli gère les dés et le chapeau, les annonces se font à l'oral. */

const O = {
  dice: [0, 0, 0, 0, 0], table: [false, false, false, false, false],
  open: false, rolled: [], armed: false, armT: null,
  mixed: false, // déjà mélangé pendant que le chapeau est ouvert (débloqué en le refermant)
  last: null,   // dernier lancer : { where: 'hat' | 'table', n }
};

function oralNewRound() {
  O.dice = O.dice.map(rollDie);
  O.table = [false, false, false, false, false];
  O.open = false; O.rolled = []; O.armed = false;
  O.mixed = false; O.last = null;
  S.screen = 'oral';
  render();
}

const hatIdx = () => O.dice.map((_, i) => i).filter(i => !O.table[i]);
const tableIdx = () => O.dice.map((_, i) => i).filter(i => O.table[i]);

function oralShakeHat() {
  if (S.busy) return;
  const idx = hatIdx();
  if (!idx.length || (O.open && O.mixed)) return;
  idx.forEach(i => { O.dice[i] = rollDie(); });
  O.rolled = O.open ? idx : [];
  if (O.open) O.mixed = true;
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

Object.assign(actions, {
  oralStart() { Sound.init(); oralNewRound(); },
  oralPeek() {
    O.open = !O.open;
    if (!O.open) O.mixed = false; // refermer le chapeau = fin du tour
    O.rolled = [];
    Sound.init();
    O.open ? Sound.hatOpen() : Sound.hatClose();
    vibrate([40, 70, 40]);
    render();
  },
  oralShake() { if (O.open && O.mixed) return; Sound.init(); fakeShake(oralShakeHat); },
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
  oralHat() {
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
});

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
    const inner0 = faceInner(v);
    return `<button class="${cls}" style="${style}" data-act="oralTap" data-arg="${i}">${inner0}</button>`;
  }
  const inner = faceInner(v);
  return tap
    ? `<button class="${cls}" style="animation-delay:${i * 50}ms" data-act="oralTap" data-arg="${i}">${inner}</button>`
    : `<div class="${cls}" style="animation-delay:${i * 50}ms">${inner}</div>`;
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
    <div class="zone"><div class="zl">${reveal ? 'Dans le chapeau · levé !' : open ? 'Dans le chapeau · toi seul les vois' : 'Dans le chapeau'}</div>
      ${hatZone}
    </div>
  </div>`;
}

function oralHTML() {
  const t = tableIdx().length, h = hatIdx().length;
  const tip = O.open
    ? 'Touche un dé pour le changer de place (chapeau ↔ table).'
    : t ? 'Touche un dé de la table pour le remettre dans le chapeau.' : '';
  const mixLocked = O.open && O.mixed;
  const L = O.last;
  const lastTxt = !L ? 'Nouvelle manche : pas encore de lancer'
    : L.where === 'hat' ? `🎩 Dernier lancer : <b>chapeau mélangé</b> (${L.n} dé${L.n > 1 ? 's' : ''})`
    : `🎲 Dernier lancer : <b>${L.n} dé${L.n > 1 ? 's' : ''} lancé${L.n > 1 ? 's' : ''} sur la table</b>`;
  return `${oralBar()}
    <div class="lastroll ${L ? L.where : ''}">${lastTxt}</div>
    ${oralFelt(false)}
    ${tip ? `<p class="hint small">${tip}</p>` : ''}
    ${O.open ? `<p class="mine">Avec la table : <b>${handName(evaluate(O.dice))}</b></p>` : ''}
    <div class="actions">
      <button class="btn ${O.open ? 'ghost' : ''}" data-act="oralPeek">${O.open ? '🙈 Refermer le chapeau' : '👀 Regarder dans le chapeau'}</button>
      <div class="row2">
        <button class="btn" data-act="oralShake" ${h && !mixLocked ? '' : 'disabled'}>${mixLocked ? '🎩 Déjà mélangé' : '🎩 Mélanger'}</button>
        <button class="btn" data-act="oralRoll" ${t ? '' : 'disabled'}>🎲 Lancer la table${t ? ` (${t})` : ''}</button>
      </div>
      <button class="btn danger big ${O.armed ? 'armed' : ''}" data-act="oralHat">${O.armed ? 'Sûr ? Touche encore' : '🎩 Chapeau !'}</button>
      ${O.open ? `<p class="hint small">${mixLocked ? 'Une seule fois par tour : referme le chapeau et passe le téléphone.' : 'Pense à refermer le chapeau avant de passer le téléphone.'}</p>` : ''}
    </div>`;
}

function oralRevealHTML() {
  return `${oralBar()}<div class="reveal">
    <h2 class="shout">« Chapeau ! »</h2>
    ${oralFelt(true)}
    <p class="actual">Il y a : <b>${handName(evaluate(O.dice))}</b></p>
    <p class="hint">Comparez avec la dernière annonce : qui a menti ?</p>
    <button class="btn primary big" data-act="oralStart">Nouvelle manche</button>
    <button class="btn ghost" data-act="menu">Menu</button>
  </div>`;
}
