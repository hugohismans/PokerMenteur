'use strict';
/* Interface du jeu : écrans, chapeau, secousse, sons. */

const $app = document.getElementById('app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vibrate = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

/* ---------- Sons (synthétisés, pas de fichiers) ---------- */
const Sound = {
  ctx: null, noise: null, muted: false,
  init() {
    try {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        const len = Math.floor(this.ctx.sampleRate * 0.04);
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 5);
      }
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      // Petit son muet : sur iPhone, c'est ce qui « débloque » vraiment le son
      const s = this.ctx.createBufferSource();
      s.buffer = this.ctx.createBuffer(1, 1, 22050);
      s.connect(this.ctx.destination); s.start(0);
    } catch (e) {}
  },
  // Après un passage en arrière-plan, iOS laisse souvent le son coupé : on repart d'un contexte neuf
  // au prochain toucher de l'écran
  revive() {
    if (!this.ctx) return;
    try { this.ctx.close(); } catch (e) {}
    this.ctx = null;
    this.init();
  },
  click(vol = 0.5, when = 0) {
    if (this.muted || !this.ctx) return;
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise;
    f.type = 'bandpass'; f.frequency.value = 1200 + Math.random() * 3000; f.Q.value = 3;
    g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(c.destination);
    s.start(c.currentTime + when);
  },
  rattle() { for (let i = 0; i < 3; i++) this.click(0.35, Math.random() * 0.08); },
  land() { for (let i = 0; i < 7; i++) this.click(0.6 - i * 0.07, i * 0.045 + Math.random() * 0.03); },
  tone(freq, dur, when = 0, type = 'triangle', vol = 0.25) {
    if (this.muted || !this.ctx) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime + when;
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur);
  },
  liar() { this.tone(180, 0.35, 0, 'sawtooth', 0.15); this.tone(140, 0.45, 0.18, 'sawtooth', 0.15); },
  good() { this.tone(523, 0.15); this.tone(784, 0.25, 0.12); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, i * 0.13)); },
  // Fiche qui tombe sur une autre
  clink() { this.tone(2400, 0.12, 0, 'sine', 0.18); this.tone(3100, 0.1, 0.06, 'sine', 0.12); },
  // Coup sec de bloc de bois : note qui chute très vite + attaque bruitée
  knock(freq, when = 0, vol = 0.7) {
    if (this.muted || !this.ctx) return;
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + 0.1);
    this.click(vol * 0.8, when);
  },
  // Ouvrir le chapeau : « tac-tac » qui monte ; le refermer : qui descend
  hatOpen() { this.knock(900, 0); this.knock(1350, 0.11); },
  hatClose() { this.knock(1250, 0); this.knock(800, 0.11); },
  // Accord de cuivres : dents de scie filtrées, petite attaque, léger vibrato
  brass(freqs, when, dur, vol = 0.05) {
    if (this.muted || !this.ctx) return;
    const c = this.ctx, t = c.currentTime + when;
    const f = c.createBiquadFilter(), g = c.createGain();
    f.type = 'lowpass'; f.Q.value = 1;
    f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(3200, t + 0.08);
    f.frequency.exponentialRampToValueAtTime(1400, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * freqs.length, t + 0.04);
    g.gain.setValueAtTime(vol * freqs.length, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g); g.connect(c.destination);
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 5.5; lg.gain.value = 4;
    lfo.connect(lg); lfo.start(t + 0.15); lfo.stop(t + dur);
    freqs.forEach((fr, i) => {
      const o = c.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = (i % 2 ? 6 : -6);
      lg.connect(o.frequency);
      o.connect(f); o.start(t); o.stop(t + dur + 0.05);
    });
  },
  // « Ta-daa ! » : roulement de tambour, accord court puis accord long, étincelles
  tada() {
    if (this.muted || !this.ctx) return;
    for (let i = 0; i < 14; i++) this.click(0.18 + i * 0.025, i * 0.032);
    this.brass([392, 523.25, 659.25], 0.5, 0.16);
    this.brass([523.25, 659.25, 783.99, 1046.5], 0.7, 1.2);
    [1568, 2093, 2637, 3136].forEach((fr, i) => this.tone(fr, 0.25, 0.8 + i * 0.07, 'sine', 0.06));
  },
};

let hatShakingNow = false;
function cupShaking(on) {
  // Le chapeau du tapis et celui posé sur la table vue du dessus tremblent ensemble
  // (l'état est gardé pour être réappliqué si l'écran est redessiné pendant le mélange)
  hatShakingNow = on;
  ['cup', 'tblHat'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.toggle('shaking', on); });
}

// Le son revient tout seul : à chaque toucher on vérifie qu'il marche, et après un retour dans l'appli
// on recrée le moteur de son (iOS le coupe parfois sans prévenir)
let soundStale = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) soundStale = true;
  else if (Sound.ctx) Sound.ctx.resume().catch(() => {}); // parfois suffisant, sans attendre un toucher
});
window.addEventListener('pageshow', e => { if (e.persisted) soundStale = true; });
['pointerdown', 'touchend', 'keydown'].forEach(t => document.addEventListener(t, () => {
  if (!Sound.ctx) return;
  if (soundStale) { soundStale = false; Sound.revive(); }
  else if (Sound.ctx.state !== 'running') Sound.init();
}, { capture: true, passive: true }));

// Taille du texte (pour mieux lire sur un petit écran) : agrandit tout le texte de l'appli
const TEXT_SIZES = ['Normal', 'Grand', 'Très grand'];
let textSize = 0;
try { textSize = Math.min(2, +localStorage.getItem('pm-text') || 0); } catch (e) {}
const applyTextSize = () => { document.documentElement.dataset.text = textSize; };
applyTextSize();

/* ---------- État ---------- */
function loadSetup() {
  try { return JSON.parse(localStorage.getItem('pm-setup')); } catch (e) { return null; }
}
function saveSetup() {
  try { localStorage.setItem('pm-setup', JSON.stringify(S.setup)); } catch (e) {}
}

const S = {
  screen: 'setup',
  setup: loadSetup() || { players: [{ name: 'Joueur 1', bot: false }, { name: 'Ordi', bot: true }], lives: 3 },
  players: [], round: null, current: -1, viewer: null,
  phase: null, modes: null, rolled: [], pickType: 1, pick: null,
  msg: '', reveal: null, botTimer: null, busy: false,
};
try { S.muted = Sound.muted = localStorage.getItem('pm-muted') === '1'; } catch (e) {}

const alive = () => S.players.filter(p => p.lives > 0);
const humansAlive = () => alive().filter(p => !p.bot).length;
function nextAlive(i) {
  let j = i;
  do { j = (j + 1) % S.players.length; } while (S.players[j].lives <= 0);
  return j;
}
const pn = i => `<b>${esc(S.players[i].name)}</b>`;

/* ---------- Déroulement ---------- */
function newGame() {
  S.players = S.setup.players.map((p, i) => ({
    name: p.name.trim() || (p.bot ? `Ordi ${i + 1}` : `Joueur ${i + 1}`),
    bot: p.bot, lives: S.setup.lives,
  }));
  S.viewer = null;
  startRound(Math.floor(Math.random() * S.players.length), '');
}

function startRound(starter, intro) {
  S.round = { dice: [0, 0, 0, 0, 0], table: [false, false, false, false, false], claim: null, claimer: -1, history: [] };
  S.msg = (intro ? intro + '<br>' : '') + `Nouvelle manche : ${pn(starter)} lance les dés.`;
  goTo(starter);
}

function goTo(i) {
  S.current = i;
  S.rolled = [];
  S.modes = null;
  if (S.players[i].bot) return botTurn(i);
  S.phase = S.round.claim ? 'decide' : 'first';
  if (humansAlive() > 1 && S.viewer !== i) {
    S.screen = 'handoff';
  } else {
    S.viewer = i;
    S.screen = 'turn';
  }
  render();
}


function rerollIdx() {
  return S.phase === 'first' ? [0, 1, 2, 3, 4] : S.modes.map((m, i) => (m === 'reroll' ? i : -1)).filter(i => i >= 0);
}

function doRoll() {
  if (S.busy) return;
  const r = S.round, idx = rerollIdx();
  if (S.phase === 'arrange') r.table = S.modes.map(m => m === 'table');
  idx.forEach(i => { r.dice[i] = rollDie(); r.table[i] = false; });
  S.lastRerollCount = S.phase === 'first' ? null : idx.length;
  S.rolled = idx;
  Sound.land();
  vibrate([30, 40, 30]);
  toAnnounce();
}

function fakeShakeThenRoll() {
  if (S.busy) return;
  S.busy = true;
  let n = 0;
  cupShaking(true);
  const t = setInterval(() => {
    Sound.rattle(); vibrate(10);
    if (++n >= 7) {
      clearInterval(t); cupShaking(false); S.busy = false;
      doRoll();
    }
  }, 90);
}

function toAnnounce() {
  S.phase = 'announce';
  const r = S.round, actual = evaluate(r.dice);
  const above = claimsAbove(r.claim);
  if (actual.t > 0 && (!r.claim || score(actual) > score(r.claim))) {
    S.pick = ALL_CLAIMS.find(c => score(c) === score(actual));
  } else S.pick = null;
  S.pickType = S.pick ? S.pick.t : above[0].t;
  render();
}

function announce(claim, who, rerolled) {
  const r = S.round;
  r.claim = claim; r.claimer = who;
  r.history.push({ who, claim });
  let how;
  if (rerolled == null) how = 'lance les dés';
  else if (rerolled === 0) how = 'ne relance rien';
  else how = `relance ${rerolled} dé${rerolled > 1 ? 's' : ''}`;
  S.msg = `${pn(who)} ${how} et annonce&nbsp;: <span class="claim-inline">${handName(claim)}</span>`;
  goTo(nextAlive(who));
}

function challenge(caller) {
  const r = S.round, truth = isTrue(r.dice, r.claim);
  const loser = truth ? caller : r.claimer;
  S.players[loser].lives--;
  S.reveal = { caller, claimer: r.claimer, claim: r.claim, actual: evaluate(r.dice), truth, loser };
  S.viewer = null;
  S.screen = 'reveal';
  Sound.liar();
  setTimeout(() => (truth ? Sound.good() : Sound.liar()), 900);
  vibrate([80, 60, 80]);
  render();
}

function afterReveal() {
  const loser = S.reveal.loser, out = S.players[loser].lives <= 0;
  if (alive().length <= 1) {
    S.screen = 'end';
    Sound.win();
    return render();
  }
  const intro = out ? `${pn(loser)} est éliminé·e !` : '';
  startRound(out ? nextAlive(loser) : loser, intro);
}

/* ---------- Ordinateur ---------- */
function botTurn(i) {
  S.screen = 'bot';
  S.phase = null;
  render();
  const r = S.round;
  const willCall = r.claim && Bot.shouldCall(r);
  let rattle = null;
  if (!willCall) {
    let n = 0;
    rattle = setInterval(() => { if (++n > 6 && n < 18) { Sound.rattle(); cupShaking(true); } }, 90);
  }
  S.botTimer = setTimeout(() => {
    clearInterval(rattle); cupShaking(false);
    if (willCall) return challenge(i);
    if (!r.claim) {
      r.dice = r.dice.map(rollDie);
      r.table = [false, false, false, false, false];
      Sound.land();
      return announce(Bot.chooseClaim(r.dice, null), i, null);
    }
    const rer = Bot.chooseRerolls(r.dice, r.claim);
    const showKept = Math.random() < 0.5;
    let n = 0;
    r.dice = r.dice.map((v, k) => {
      if (rer[k]) { n++; r.table[k] = false; return rollDie(); }
      r.table[k] = showKept;
      return v;
    });
    if (n) Sound.land();
    announce(Bot.chooseClaim(r.dice, r.claim), i, n);
  }, r.claim && willCall ? 1400 : 2000);
}

/* ---------- Actions ---------- */
const actions = {
  setTextSize(i) {
    textSize = +i;
    try { localStorage.setItem('pm-text', textSize); } catch (e) {}
    applyTextSize(); render();
  },
  addPlayer(bot) {
    const P = S.setup.players;
    if (P.length >= 8) return;
    const n = P.filter(p => p.bot === (bot === '1')).length + 1;
    P.push({ name: bot === '1' ? `Ordi ${n}` : `Joueur ${n}`, bot: bot === '1' });
    saveSetup(); render();
  },
  removePlayer(i) {
    if (S.setup.players.length <= 2) return;
    S.setup.players.splice(+i, 1); saveSetup(); render();
  },
  toggleBot(i) {
    const p = S.setup.players[+i];
    p.bot = !p.bot; saveSetup(); render();
  },
  lives(d) {
    S.setup.lives = Math.max(1, Math.min(9, S.setup.lives + +d)); saveSetup(); render();
  },
  start() {
    Sound.init();
    if (!S.setup.players.some(p => !p.bot)) return alert('Il faut au moins un joueur humain.');
    newGame();
  },
  iam() {
    Sound.init();
    S.viewer = S.current; S.screen = 'turn'; render();
  },
  roll() { Sound.init(); fakeShakeThenRoll(); },
  liar() { challenge(S.current); },
  believe() {
    S.phase = 'arrange';
    S.modes = S.round.table.map(t => (t ? 'table' : 'cup'));
    render();
  },
  tapDie(i) {
    i = +i;
    if (S.phase === 'arrange') {
      const order = ['cup', 'table', 'reroll'];
      S.modes[i] = order[(order.indexOf(S.modes[i]) + 1) % 3];
      Sound.click(0.4);
      render();
    } else if (S.phase === 'announce') {
      S.round.table[i] = !S.round.table[i];
      Sound.click(0.4);
      S.rolled = [];
      render();
    }
  },
  allMode(m) { S.modes = S.modes.map(() => m); render(); },
  keepAll() {
    S.round.table = S.modes.map(m => m === 'table');
    S.rolled = [];
    S.lastRerollCount = 0;
    toAnnounce();
  },
  pickType(t) { S.pickType = +t; S.pick = null; const opts = claimsAbove(S.round.claim).filter(c => c.t === +t); if (opts.length === 1) S.pick = opts[0]; render(); },
  pick(sc) { S.pick = ALL_CLAIMS.find(c => score(c) === +sc); Sound.click(0.3); render(); },
  confirm() {
    if (!S.pick) return;
    announce(S.pick, S.current, S.lastRerollCount);
  },
  next() { afterReveal(); },
  again() { newGame(); },
  menu() { S.screen = 'setup'; render(); },
  quit() {
    const oral = GAME_SCREENS.includes(S.screen);
    if (!confirm(oral ? 'Revenir au menu ? La partie est gardée, tu pourras la reprendre.' : 'Quitter la partie en cours ?')) return;
    clearTimeout(S.botTimer);
    S.screen = 'setup'; render();
  },
  diceStyle(s) { setDiceStyle(s); render(); },
  // Remplacée par online.js une fois chargé ; sans internet, on affiche un message
  onlineHome() { S.screen = 'online'; render(); },
  mute() {
    S.muted = Sound.muted = !Sound.muted;
    try { localStorage.setItem('pm-muted', S.muted ? '1' : '0'); } catch (e) {}
    render();
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  actions[el.dataset.act](el.dataset.arg);
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.name != null) { S.setup.players[+el.dataset.name].name = el.value; saveSetup(); }
});

/* ---------- Rendu ---------- */
const HAT_SVG = `<svg viewBox="0 0 120 110" aria-hidden="true">
  <defs><linearGradient id="hg" x1="0" x2="1"><stop offset="0" stop-color="#0d0d0d"/><stop offset=".4" stop-color="#3a3a3a"/><stop offset="1" stop-color="#0a0a0a"/></linearGradient></defs>
  <ellipse cx="60" cy="92" rx="56" ry="13" fill="#111"/>
  <path d="M30 14 Q60 4 90 14 L86 88 Q60 96 34 88 Z" fill="url(#hg)"/>
  <ellipse cx="60" cy="14" rx="30" ry="7" fill="#262626"/>
  <path d="M33 66 Q60 74 87 66 L86 80 Q60 88 34 80 Z" fill="#9b1c22"/>
  <ellipse cx="60" cy="90" rx="56" ry="11" fill="none" stroke="#2c2c2c" stroke-width="2"/>
</svg>`;

function dieHTML(v, i, o = {}) {
  const cls = ['die', 'f' + v, o.cls || '', S.rolled.includes(i) && o.anim !== false ? 'rolled' : ''].join(' ');
  const delay = `style="animation-delay:${(i % 5) * 50}ms"`;
  const inner = faceInner(v);
  return o.tap
    ? `<button class="${cls}" ${delay} data-act="tapDie" data-arg="${i}">${inner}${o.badge || ''}</button>`
    : `<div class="${cls}" ${delay}>${inner}${o.badge || ''}</div>`;
}

function playersBar() {
  return `<div class="topbar">
    <div class="players">${S.players.map((p, i) => `
      <div class="pl ${i === S.current && S.screen !== 'reveal' ? 'cur' : ''} ${p.lives <= 0 ? 'out' : ''}">
        <span class="nm">${p.bot ? '🤖 ' : ''}${esc(p.name)}</span>
        <span class="lv">${'<i class="tok"></i>'.repeat(Math.max(0, p.lives))}${p.lives <= 0 ? '✖' : ''}</span>
      </div>`).join('')}
    </div>
    <div class="tools">
      <button class="icon" data-act="mute" aria-label="Son">${S.muted ? '🔇' : '🔊'}</button>
      <button class="icon" data-act="quit" aria-label="Quitter">✕</button>
    </div>
  </div>`;
}

function claimBanner() {
  const r = S.round;
  if (!r.claim) return `<div class="banner muted">Pas encore d'annonce dans cette manche</div>`;
  return `<div class="banner"><small>Annonce de ${pn(r.claimer)}</small><strong>${handName(r.claim)}</strong></div>`;
}

function historyHTML() {
  const h = S.round.history;
  if (h.length < 2) return '';
  return `<details class="hist"><summary>Annonces de la manche (${h.length})</summary><ol>${
    h.map(x => `<li>${esc(S.players[x.who].name)} : ${handName(x.claim)}</li>`).join('')}</ol></details>`;
}

// Le tapis : dés visibles sur la table + chapeau (fermé ou soulevé)
function feltHTML({ open = false, tap = false, shake = false, reveal = false } = {}) {
  const r = S.round, tbl = [], cup = [];
  r.dice.forEach((v, i) => (r.table[i] ? tbl : cup).push(dieHTML(v, i, { tap })));
  const cupClosed = `<div class="cup ${shake ? 'ready' : ''}" id="cup">${HAT_SVG}<span class="cnt">${cup.length}</span></div>`;
  return `<div class="felt">
    <div class="zone"><div class="zl">Sur la table · visibles par tous</div>
      <div class="dice-row">${tbl.join('') || '<span class="empty">aucun dé</span>'}</div></div>
    <div class="zone"><div class="zl">Dans le chapeau${reveal ? ' · soulevé !' : open ? ' · toi seul les vois' : ''}</div>
      ${open
        ? `<div class="dice-row under">${cup.join('') || '<span class="empty">aucun dé</span>'}</div>`
        : `<div class="cup-wrap">${cupClosed}</div>`}
    </div>
  </div>`;
}

function arrangeHTML() {
  const r = S.round;
  const labels = { cup: '🎩 Caché', table: '👁 Table', reroll: '🎲 Relance' };
  const dice = r.dice.map((v, i) => dieHTML(v, i, {
    tap: true, cls: 'm-' + S.modes[i], anim: false,
    badge: `<span class="badge">${labels[S.modes[i]]}</span>`,
  })).join('');
  const n = S.modes.filter(m => m === 'reroll').length;
  return `<div class="felt">
      <div class="zl">Tes dés — touche un dé pour changer son sort</div>
      <div class="dice-row arrange">${dice}</div>
      <div class="quick">
        <button class="chip" data-act="allMode" data-arg="reroll">Tout relancer</button>
        <button class="chip" data-act="allMode" data-arg="cup">Tout garder</button>
      </div>
      ${n ? `<div class="cup-wrap small">${`<div class="cup ready" id="cup">${HAT_SVG}<span class="cnt">${n}</span></div>`}</div>` : ''}
    </div>
    <div class="actions">
      ${n
        ? `<button class="btn primary" data-act="roll">🎲 Lancer ${n} dé${n > 1 ? 's' : ''}</button>`
        : `<button class="btn primary" data-act="keepAll">Ne rien relancer → annoncer</button>`}
    </div>`;
}

function pickerHTML() {
  const r = S.round, above = claimsAbove(r.claim);
  const actual = evaluate(r.dice);
  const types = TYPE_ORDER.map(t => {
    const ok = above.some(c => c.t === t);
    return `<button class="chip ${S.pickType === t ? 'on' : ''}" data-act="pickType" data-arg="${t}" ${ok ? '' : 'disabled'}>${TYPE_NAMES[t]}</button>`;
  }).join('');
  const opts = above.filter(c => c.t === S.pickType);
  const label = c => {
    if (c.t === 2) return `${PLURAL[c.a]} + ${PLURAL[c.b]}`;
    if (c.t === 6) return `${PLURAL[c.a]} par ${PLURAL[c.b]}`;
    if (c.t === 4 || c.t === 5) return TYPE_NAMES[c.t];
    return PLURAL[c.a];
  };
  const vals = opts.map(c => `<button class="val ${S.pick && score(S.pick) === score(c) ? 'on' : ''} ${score(c) <= score(actual) ? 'true' : ''}"
      data-act="pick" data-arg="${score(c)}">${label(c)}</button>`).join('');
  const bluff = S.pick && score(S.pick) > score(actual);
  return `<div class="picker">
    <div class="mine">Ta main : <b>${handName(actual)}</b></div>
    <div class="types">${types}</div>
    <div class="vals ${S.pickType === 6 || S.pickType === 2 ? 'wide' : ''}">${vals}</div>
    <button class="btn primary" data-act="confirm" ${S.pick ? '' : 'disabled'}>
      ${S.pick ? `Annoncer : ${handName(S.pick)} ${bluff ? '<span class="tag">bluff 😏</span>' : ''}` : 'Choisis ton annonce'}
    </button>
  </div>`;
}

function setupHTML() {
  const P = S.setup.players;
  return `<div class="setup">
    <header class="hero">
      <div class="hero-dice">${[5, 4, 3, 2, 1].map(v => `<div class="die f${v}">${faceInner(v)}</div>`).join('')}</div>
      <h1>Poker Menteur</h1>
      <p>Lance, cache, bluffe… et démasque les menteurs.</p>
    </header>
    ${(() => { const s = savedGame(); return s ? `<button class="btn good big" data-act="oralResume">▶ Reprendre la partie<br><small>${s.G.players.map(p => esc(p.name)).join(', ')}</small></button>` : ''; })()}
    <button class="btn primary big" data-act="oralSetup">🎩 Nouvelle partie</button>
    <button class="btn big online-btn" data-act="onlineHome">🌐 Jouer en ligne</button>
    ${(() => { let seen = false; try { seen = !!localStorage.getItem('pm-tuto'); } catch (e) {}
      return `<button class="btn tuto-btn ${seen ? '' : 'new'}" data-act="tuto">📖 ${seen ? 'Tutoriel : jouer en ligne' : 'Première fois ? Découvre le tutoriel en ligne'}</button>`; })()}
    <p class="hint">Un seul téléphone qu'on se passe. Les annonces se font à voix haute.</p>
    <section class="card">
      <h2>Style des dés</h2>
      <div class="styles">${Object.keys(DICE_STYLES).map(s => `
        <button class="style-opt ${diceStyle === s ? 'on' : ''}" data-act="diceStyle" data-arg="${s}">
          <span class="mini">${[4, 3, 2, 5].map(v => `<span class="die f${v}">${faceInnerAs(s, v)}</span>`).join('')}</span>
          <b>${DICE_STYLES[s]}</b>
        </button>`).join('')}
      </div>
    </section>
    <section class="card">
      <h2>Options</h2>
      <div class="textsize"><span>🔠 Taille du texte</span>
        <div class="seg">${TEXT_SIZES.map((t, i) => `<button class="${textSize === i ? 'on' : ''}" data-act="setTextSize" data-arg="${i}" style="font-size:${[0.9, 1.05, 1.2][i]}rem">${t}</button>`).join('')}</div>
      </div>
      <button class="toggle ${shakeOn ? 'on' : ''}" data-act="toggleShake">
        <span>📳 Secouer le téléphone pour mélanger le chapeau</span><i></i>
      </button>
    </section>
    <details class="card bots">
      <summary>🤖 Jouer avec les annonces dans l'appli (contre l'ordinateur)</summary>
      ${P.map((p, i) => `<div class="prow">
        <button class="kind" data-act="toggleBot" data-arg="${i}" aria-label="Humain ou ordinateur">${p.bot ? '🤖' : '👤'}</button>
        <input value="${esc(p.name)}" data-name="${i}" maxlength="14" aria-label="Nom">
        <button class="icon" data-act="removePlayer" data-arg="${i}" ${P.length <= 2 ? 'disabled' : ''} aria-label="Retirer">✕</button>
      </div>`).join('')}
      <div class="row2">
        <button class="btn ghost" data-act="addPlayer" data-arg="0" ${P.length >= 8 ? 'disabled' : ''}>+ Joueur</button>
        <button class="btn ghost" data-act="addPlayer" data-arg="1" ${P.length >= 8 ? 'disabled' : ''}>+ Ordinateur</button>
      </div>
      <div class="lives">
        <span>Jetons par joueur</span>
        <div class="stepper"><button class="icon" data-act="lives" data-arg="-1">−</button><b>${S.setup.lives}</b><button class="icon" data-act="lives" data-arg="1">+</button></div>
      </div>
      <button class="btn primary" data-act="start">Jouer avec annonces</button>
    </details>
    <details class="card rules">
      <summary>Règles du jeu</summary>
      <p>5 dés à faces <b>9, 10, Valet, Dame, Roi, As</b>. On se passe le téléphone comme le chapeau. Les annonces se font <b>à voix haute</b> et on a le droit de mentir.</p>
      <p><b>À ton tour</b>, tu prends le téléphone et tu peux :</p>
      <p>• <b>👀 regarder dans le chapeau</b> (toi seul vois les dés), autant de fois que tu veux. En début de manche, on mélange d'abord ;</p>
      <p>• <b>🎩 mélanger le chapeau</b> (chapeau fermé) : seuls les dés du chapeau sont relancés ;</p>
      <p>• <b>🎲 lancer la table</b> : on relance les dés posés sur la table, le chapeau ne bouge pas ;</p>
      <p>• <b>un seul lancer par tour</b> : soit on mélange le chapeau, soit on lance la table ;</p>
      <p>• <b>déplacer des dés</b> entre le chapeau et la table en les touchant ou en les faisant glisser, <b>avant</b> ton lancer : une fois le lancer fait, les dés ne bougent plus ;</p>
      <p>• puis tu annonces plus fort que le précédent, tu refermes le chapeau et tu <b>passes</b> le téléphone.</p>
      <p>Si tu ne crois pas le joueur d'avant : <b>« Chapeau ! »</b>, mais seulement <b>avant</b> d'avoir regardé dans le chapeau ou lancé : regarder, c'est accepter. On lève le chapeau, tout le monde voit les dés, et on indique <b>qui a perdu</b>.</p>
      <p><b>En ligne</b>, on annonce en touchant les dés (de 1 à 5) : l'appli en déduit la combinaison. Les dés en plus départagent : après « Brelan de Rois, As, 9 », il faut au moins « Brelan de Rois, As, 10 ». Après l'annonce, le tour passe tout seul.</p>
      <p><b>Deux modes :</b> <b>Simple</b> (seulement les dés et le chapeau, vos fiches sont sur la vraie table) ou <b>Complet</b> (l'appli gère les joueurs et les fiches).</p>
      <p><b>Les fiches (mode complet) :</b> au départ, il y a 2 × le nombre de joueurs + 1 fiches au milieu de la table. Une roue tire au sort qui commence.</p>
      <p>• <b>La charge</b> : le perdant prend une fiche du pot. Au début de chaque manche, le premier qui passe le téléphone choisit le sens : à sa gauche, on tourne dans le sens des aiguilles d'une montre ; à sa droite, dans l'autre sens.</p>
      <p>• <b>La décharge</b> commence quand le pot est vide. Ceux qui n'ont aucune fiche sont sauvés. Le dernier perdant choisit le sens du jeu, qui ne change plus. Le gagnant remet une de ses fiches au milieu de la table.</p>
      <p><b>Pour rire :</b> touche un joueur autour de la table pour lui lancer une tomate, des fleurs, un bisou…</p>
      <p>Le but : ne plus avoir de fiches. Le dernier qui en a encore a perdu la partie. Le perdant commence toujours la manche suivante.</p>
      <p><b>Ordre des combinaisons :</b> Paire &lt; Double paire &lt; Petite suite (9→R) &lt; Brelan &lt; Grande suite (10→A) &lt; Full &lt; Carré &lt; Poker (5 dés identiques). À combinaison égale, la plus haute valeur gagne (As &gt; Roi &gt; Dame &gt; Valet &gt; 10 &gt; 9). Une annonce est vraie si les dés valent <b>au moins</b> l'annonce : on peut sous-annoncer (dire un full avec un carré) sans mentir.</p>
    </details>
  </div>`;
}

function render() {
  let html = '';
  switch (S.screen) {
    case 'setup':
      html = setupHTML();
      break;
    case 'oral':
      html = oralHTML();
      break;
    case 'oralSetup':
      html = oralSetupHTML();
      break;
    case 'online':
      html = typeof onlineHomeHTML === 'function' ? onlineHomeHTML()
        : `<div class="topbar"><button class="icon" data-act="menu" aria-label="Retour">←</button><div class="apptitle">🌐 Jouer en ligne</div></div>
           <section class="card"><h2>${window.ONLINE_FAILED ? 'Connexion impossible' : 'Chargement…'}</h2>
           <p>${window.ONLINE_FAILED ? 'Le jeu en ligne n\'a pas pu se charger. Vérifie ta connexion internet puis relance l\'appli.' : 'Un instant…'}</p></section>`;
      break;
    case 'onlineRoom':
      html = onlineRoomHTML();
      break;
    case 'oralWheel':
      html = oralWheelHTML();
      break;
    case 'oralDir':
      html = oralDirHTML();
      break;
    case 'oralEnd':
      html = oralEndHTML();
      break;
    case 'oralReveal':
      html = oralRevealHTML();
      break;
    case 'tuto':
      html = tutoHTML();
      break;

    case 'handoff':
      html = `${playersBar()}<div class="handoff">
        <div class="phone">📱</div>
        <h2>Passe le téléphone à<br><span>${esc(S.players[S.current].name)}</span></h2>
        <p class="msg">${S.msg}</p>
        <button class="btn primary big" data-act="iam">Je suis ${esc(S.players[S.current].name)}</button>
        <p class="hint">Les autres, ne regardez pas l'écran 👀</p>
      </div>`;
      break;

    case 'bot':
      html = `${playersBar()}${claimBanner()}
        ${feltHTML()}
        <div class="actions"><p class="msg">${S.msg}</p>
        <p class="thinking">🤖 ${esc(S.players[S.current].name)} réfléchit<span class="dots"></span></p></div>`;
      break;

    case 'turn': {
      const me = esc(S.players[S.current].name);
      html = playersBar();
      if (S.phase === 'first') {
        html += `${claimBanner()}<div class="msg top">${S.msg}</div>${feltHTML({ shake: true })}
          <div class="actions"><p class="hint big">${me}, lance les dés</p>
          <button class="btn primary" data-act="roll">🎲 Lancer les dés</button></div>`;
      } else if (S.phase === 'decide') {
        const canBelieve = claimsAbove(S.round.claim).length > 0;
        html += `${claimBanner()}<div class="msg top">${S.msg}</div>${historyHTML()}${feltHTML()}
          <div class="actions">
            <p class="hint">${me}, tu le crois ?</p>
            <div class="row2">
              <button class="btn danger" data-act="liar">Menteur !</button>
              <button class="btn good" data-act="believe" ${canBelieve ? '' : 'disabled'}>Je te crois</button>
            </div>
          </div>`;
      } else if (S.phase === 'arrange') {
        html += `${claimBanner()}${arrangeHTML()}`;
      } else if (S.phase === 'announce') {
        html += `${claimBanner()}${feltHTML({ open: true, tap: true })}
          <p class="hint small">Touche un dé pour le poser sur la table ou le cacher sous le chapeau.</p>
          ${pickerHTML()}`;
      }
      break;
    }

    case 'reveal': {
      const R = S.reveal;
      html = `${playersBar()}<div class="reveal">
        <h2 class="shout">« Menteur ! »</h2>
        <p>${pn(R.caller)} accuse ${pn(R.claimer)} qui annonçait <b>${handName(R.claim)}</b>.</p>
        ${feltHTML({ open: true, reveal: true })}
        <p class="actual">Dans le chapeau : <b>${handName(R.actual)}</b></p>
        <div class="verdict ${R.truth ? 'truth' : 'lie'}">
          ${R.truth ? `C'était vrai ! ${pn(R.caller)} perd un jeton.` : `C'était du bluff ! ${pn(R.claimer)} perd un jeton.`}
          ${S.players[R.loser].lives <= 0 ? `<br>${pn(R.loser)} est éliminé·e.` : ''}
        </div>
        <button class="btn primary big" data-act="next">Continuer</button>
      </div>`;
      break;
    }

    case 'end': {
      const w = alive()[0];
      html = `<div class="end">
        <div class="trophy">🏆</div>
        <h2>${esc(w ? w.name : '?')} gagne !</h2>
        <button class="btn primary big" data-act="again">Rejouer</button>
        <button class="btn ghost" data-act="menu">Menu</button>
      </div>`;
      break;
    }
  }
  $app.innerHTML = html;
  // En ligne, la partie utilise la même mise en page que le mode local
  $app.dataset.screen = S.screen === 'onlineRoom' ? 'oral' : S.screen;
  if (typeof afterRender === 'function') afterRender();
}

// Premier affichage : fait à la fin de oral.js, une fois tous les scripts chargés.
