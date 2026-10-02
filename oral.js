'use strict';
/* Mode « à voix haute » : l'appli gère les dés et le chapeau, les annonces se font à l'oral. */

const O = {
  dice: [0, 0, 0, 0, 0], table: [false, false, false, false, false],
  open: false, rolled: [], turn: 1, armed: false, armT: null,
  log: null, lastLog: '',
};
const freshLog = () => ({ peek: false, shook: 0, rolled: 0, out: 0, back: 0 });

function oralNewRound() {
  O.dice = O.dice.map(rollDie);
  O.table = [false, false, false, false, false];
  O.open = false; O.rolled = []; O.turn = 1; O.armed = false;
  O.log = freshLog(); O.lastLog = '';
  S.screen = 'oral';
  render();
}

function logText(l, tu = false) {
  const a = tu ? 'as' : 'a';
  const parts = [];
  if (l.peek) parts.push(`${a} regardé dans le chapeau`);
  if (l.shook) parts.push(`${a} mélangé le chapeau`);
  if (l.rolled) parts.push(`${a} lancé ${l.rolled} dé${l.rolled > 1 ? 's' : ''} sur la table`);
  if (l.out) parts.push(`${a} sorti ${l.out} dé${l.out > 1 ? 's' : ''} du chapeau`);
  if (l.back) parts.push(`${a} remis ${l.back} dé${l.back > 1 ? 's' : ''} dans le chapeau`);
  if (!parts.length) return `n'${a} touché à rien`;
  return parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' et ' + parts[parts.length - 1];
}

const hatIdx = () => O.dice.map((_, i) => i).filter(i => !O.table[i]);
const tableIdx = () => O.dice.map((_, i) => i).filter(i => O.table[i]);

function oralShakeHat() {
  if (S.busy) return;
  const idx = hatIdx();
  if (!idx.length) return;
  idx.forEach(i => { O.dice[i] = rollDie(); });
  O.rolled = O.open ? idx : [];
  O.log.shook++;
  Sound.land(); vibrate([30, 40, 30]);
  render();
}

function oralRollTable() {
  const idx = tableIdx();
  if (!idx.length) return;
  idx.forEach(i => { O.dice[i] = rollDie(); });
  O.rolled = [];
  O.log.rolled += idx.length;
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
  el.querySelector('.fv').textContent = FACES[v];
  el.querySelector('.fs').textContent = SUITS[v];
}

// Anime l'élément secoué (le chapeau ou les dés de la table) avant de lancer
function fakeShake(then, id = 'cup', steps = 7) {
  if (S.busy) return;
  S.busy = true; Shake.stop();
  let n = 0;
  const el = () => document.getElementById(id);
  el() && el().classList.add('shaking');
  const t = setInterval(() => {
    Sound.rattle(); vibrate(10);
    if (++n >= steps) { clearInterval(t); el() && el().classList.remove('shaking'); S.busy = false; then(); }
  }, 90);
}

Object.assign(actions, {
  oralStart() { Sound.init(); Shake.ask(); oralNewRound(); },
  oralPeek() {
    O.open = !O.open;
    if (O.open) O.log.peek = true;
    O.rolled = [];
    Sound.click(0.3);
    render();
  },
  oralShake() { Sound.init(); fakeShake(oralShakeHat); },
  oralRoll() { if (S.busy) return; Sound.init(); oralRollTable(); },
  oralTap(i) {
    if (S.busy) return;
    i = +i;
    if (O.table[i]) { O.table[i] = false; O.log.back++; }
    else if (O.open) { O.table[i] = true; O.log.out++; }
    else return;
    O.rolled = [];
    Sound.click(0.4);
    render();
  },
  oralPass() {
    O.lastLog = logText(O.log);
    O.log = freshLog();
    O.open = false; O.rolled = []; O.armed = false;
    O.turn++;
    S.screen = 'oralPass';
    render();
  },
  oralTake() { Sound.init(); Shake.ask(); S.screen = 'oral'; render(); },
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
    Sound.liar(); vibrate([80, 60, 80]);
    render();
  },
});

function oralBar() {
  return `<div class="topbar">
    <div class="players"><div class="pl cur"><span class="nm">🎩 Tour ${O.turn}</span></div></div>
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
    const inner0 = `<span class="fv">${FACES[v]}</span><span class="fs">${SUITS[v]}</span>`;
    return `<button class="${cls}" style="${style}" data-act="oralTap" data-arg="${i}">${inner0}</button>`;
  }
  const inner = `<span class="fv">${FACES[v]}</span><span class="fs">${SUITS[v]}</span>`;
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
  const now = logText(O.log, true);
  const tip = O.open
    ? 'Touche un dé pour le changer de place (chapeau ↔ table).'
    : t ? 'Touche un dé de la table pour le remettre dans le chapeau.' : '';
  return `${oralBar()}
    ${O.turn > 1 ? `<div class="banner"><small>Au tour d'avant, le joueur…</small><span class="prev">${O.lastLog}</span></div>`
      : `<div class="banner muted">Nouvelle manche : secoue le chapeau, regarde et annonce à voix haute !</div>`}
    ${oralFelt(false)}
    ${tip ? `<p class="hint small">${tip}</p>` : ''}
    ${O.open ? `<p class="mine">Avec la table : <b>${handName(evaluate(O.dice))}</b></p>` : ''}
    <div class="actions">
      <button class="btn ${O.open ? 'ghost' : ''}" data-act="oralPeek">${O.open ? '🙈 Refermer le chapeau' : '👀 Regarder dans le chapeau'}</button>
      ${h ? '<p class="hint">📳 Secoue le téléphone pour mélanger le chapeau</p>' : ''}
      <div class="row2">
        <button class="btn" data-act="oralShake" ${h ? '' : 'disabled'}>🎩 Mélanger</button>
        <button class="btn" data-act="oralRoll" ${t ? '' : 'disabled'}>🎲 Lancer la table${t ? ` (${t})` : ''}</button>
      </div>
      <div class="row2">
        <button class="btn primary" data-act="oralPass">📱 Passer</button>
        <button class="btn danger ${O.armed ? 'armed' : ''}" data-act="oralHat">${O.armed ? 'Sûr ? Touche encore' : '🎩 Chapeau !'}</button>
      </div>
      <p class="hint small">Ce tour : tu ${now}.</p>
    </div>`;
}

function oralPassHTML() {
  return `${oralBar()}<div class="handoff">
    <div class="phone">📱</div>
    <h2>Passe le téléphone<br><span>au suivant</span></h2>
    <p class="msg">Le joueur précédent ${O.lastLog}.</p>
    <button class="btn primary big" data-act="oralTake">C'est à moi</button>
    <p class="hint">Annonces à voix haute — le chapeau reste fermé tant que tu ne regardes pas.</p>
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
