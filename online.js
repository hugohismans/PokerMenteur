/* Jeu en ligne avec Firebase (Realtime Database + connexion anonyme).
   Réutilise l'affichage du mode complet (table vue du dessus, tapis, chapeau, dés) en
   recopiant l'état partagé dans les variables G et O du mode local avant chaque affichage. */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import {
  getDatabase, connectDatabaseEmulator, ref, onValue, off, set, update, remove, get, push,
  runTransaction, onDisconnect, query, orderByChild, limitToLast, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-database.js';

/* ---------- Connexion à Firebase ---------- */
const params = new URLSearchParams(location.search);
const EMU = params.has('emu');
const config = EMU
  ? { apiKey: 'demo-key', authDomain: 'demo-pokermenteur.firebaseapp.com', projectId: 'demo-pokermenteur',
      databaseURL: 'https://demo-pokermenteur-default-rtdb.firebaseio.com', appId: 'demo' }
  : window.FIREBASE_CONFIG;

let db = null, me = null, ready = false;
const NET = { error: null };
if (config) {
  try {
    const app = initializeApp(config);
    const auth = getAuth(app);
    db = getDatabase(app);
    if (EMU) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectDatabaseEmulator(db, '127.0.0.1', 9000);
    }
    onAuthStateChanged(auth, u => {
      if (!u) return;
      me = u.uid; ready = true;
      watchPublicRooms();
      autoJoinFromLink();
      if (S.screen === 'online') render();
    });
    signInAnonymously(auth).catch(e => { NET.error = e.message; if (S.screen === 'online') render(); });
  } catch (e) { NET.error = e.message; }
}

/* ---------- État local ---------- */
const MAX_PLAYERS = 8;
const KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ON = {
  pseudo: '', roomId: null, room: null, unsub: [], publicRooms: [],
  lastEv: null, wasMyTurn: false, pick: { type: null, claim: null },
  chat: [], chatOpen: false, unread: 0, pendingRender: false, joinError: '', anim: null,
  wheelSeen: null, wheelDone: false,
};
try { ON.pseudo = localStorage.getItem('pm-pseudo') || ''; } catch (e) {}
const savePseudo = () => { try { localStorage.setItem('pm-pseudo', ON.pseudo); } catch (e) {} };

const roomRef = (p = '') => ref(db, `rooms/${ON.roomId}${p ? '/' + p : ''}`);
const newKey = () => Array.from({ length: 6 }, () => KEY_CHARS[Math.floor(Math.random() * KEY_CHARS.length)]).join('');
const rid = () => Math.random().toString(36).slice(2, 10);
const g = () => (ON.room && ON.room.game) || null;
const isHost = () => ON.room && ON.room.meta && ON.room.meta.host === me;
const nameOf = uid => esc((g() && g().names && g().names[uid]) || (ON.room && ON.room.players && ON.room.players[uid] && ON.room.players[uid].name) || '?');
const B = uid => `<b>${nameOf(uid)}</b>`;

/* ---------- Salons publics ---------- */
function watchPublicRooms() {
  const q = query(ref(db, 'publicRooms'), orderByChild('createdAt'), limitToLast(40));
  onValue(q, snap => {
    const list = [];
    snap.forEach(c => { list.push({ id: c.key, ...c.val() }); });
    const fresh = Date.now() - 6 * 3600 * 1000;
    ON.publicRooms = list.filter(r => (r.createdAt || 0) > fresh).reverse();
    const box = document.getElementById('roomList');
    if (box) box.innerHTML = roomListHTML();
  });
}

function roomListHTML() {
  if (!ON.publicRooms.length) return '<p class="empty">Aucun salon public pour l\'instant. Crée le tien !</p>';
  return ON.publicRooms.map(r => {
    const full = (r.count || 0) >= MAX_PLAYERS, playing = r.status === 'playing';
    return `<div class="roomrow">
      <div><b>${esc(r.name || 'Salon')}</b><small>${esc(r.hostName || '')} · ${r.count || 0}/${MAX_PLAYERS} joueurs · ${playing ? 'en cours' : 'en attente'}</small></div>
      <button class="btn primary sm" data-act="onJoin" data-arg="${r.id}" ${full || playing ? 'disabled' : ''}>${playing ? 'En cours' : 'Rejoindre'}</button>
    </div>`;
  }).join('');
}

/* ---------- Créer / rejoindre / quitter ---------- */
function needPseudo() {
  if (ON.pseudo.trim()) return false;
  ON.joinError = 'Choisis d\'abord ton pseudo.';
  render();
  return true;
}

async function createRoom(isPublic) {
  if (!ready || needPseudo()) return;
  const id = push(ref(db, 'rooms')).key;
  const key = newKey();
  const name = (document.getElementById('roomName')?.value || '').trim() || `Salon de ${ON.pseudo}`;
  await set(ref(db, `rooms/${id}`), {
    meta: { name, host: me, public: isPublic, key, status: 'lobby', createdAt: serverTimestamp(), tokenType: OS.tokenType || 'cailloux' },
    players: { [me]: { name: ON.pseudo, joinedAt: serverTimestamp(), online: true } },
  });
  await set(ref(db, `roomKeys/${key}`), id);
  if (isPublic) await set(ref(db, `publicRooms/${id}`), { name, hostName: ON.pseudo, count: 1, status: 'lobby', createdAt: serverTimestamp() });
  enterRoom(id);
}

async function joinRoom(id) {
  if (!ready || needPseudo()) return;
  ON.joinError = '';
  const snap = await get(ref(db, `rooms/${id}`));
  const room = snap.val();
  if (!room) { ON.joinError = 'Ce salon n\'existe plus.'; return render(); }
  const players = room.players || {};
  const inGame = room.game && room.game.order && room.game.order.includes(me);
  if (room.meta.status !== 'lobby' && !inGame) { ON.joinError = 'La partie a déjà commencé dans ce salon.'; return render(); }
  if (!players[me] && Object.keys(players).length >= MAX_PLAYERS) { ON.joinError = 'Ce salon est complet.'; return render(); }
  await update(ref(db, `rooms/${id}/players/${me}`), { name: ON.pseudo, joinedAt: players[me] ? players[me].joinedAt : serverTimestamp(), online: true });
  enterRoom(id);
}

async function joinByKey(raw) {
  const key = (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (key.length < 4) { ON.joinError = 'Clé invalide.'; return render(); }
  const id = (await get(ref(db, `roomKeys/${key}`))).val();
  if (!id) { ON.joinError = 'Aucun salon avec cette clé.'; return render(); }
  joinRoom(id);
}

function enterRoom(id) {
  leaveListeners();
  ON.roomId = id; ON.room = null; ON.chat = []; ON.unread = 0; ON.lastEv = null; ON.wasMyTurn = false;
  try { localStorage.setItem('pm-online-room', id); } catch (e) {}
  // Présence : hors ligne automatiquement si l'appli se ferme ou perd le réseau
  const presence = onValue(ref(db, '.info/connected'), s => {
    if (!s.val() || !ON.roomId) return;
    const p = ref(db, `rooms/${id}/players/${me}/online`);
    onDisconnect(p).set(false);
    set(p, true);
  });
  const roomL = onValue(ref(db, `rooms/${id}`), s => onRoom(s.val()));
  const chatL = onValue(query(ref(db, `rooms/${id}/chat`), limitToLast(80)), s => {
    const list = [];
    s.forEach(c => { list.push(c.val()); });
    const added = list.length - ON.chat.length;
    ON.chat = list;
    if (!ON.chatOpen && added > 0) ON.unread += added;
    drawChat();
  });
  ON.unsub = [presence, roomL, chatL];
  S.screen = 'onlineRoom';
  render();
}

function leaveListeners() {
  ON.unsub.forEach(u => { try { u(); } catch (e) {} });
  ON.unsub = [];
}

async function leaveRoom() {
  const id = ON.roomId, room = ON.room;
  leaveListeners();
  ON.roomId = null; ON.room = null; ON.chatOpen = false; drawChat();
  try { localStorage.removeItem('pm-online-room'); } catch (e) {}
  if (id && room) {
    const lobby = room.meta.status === 'lobby';
    if (lobby) {
      await remove(ref(db, `rooms/${id}/players/${me}`));
      const left = Object.keys(room.players || {}).filter(u => u !== me);
      if (!left.length) {
        await Promise.all([remove(ref(db, `rooms/${id}`)), remove(ref(db, `publicRooms/${id}`)), remove(ref(db, `roomKeys/${room.meta.key}`))]);
      } else if (room.meta.host === me) {
        await update(ref(db, `rooms/${id}/meta`), { host: left[0] });
      }
    } else {
      await set(ref(db, `rooms/${id}/players/${me}/online`), false);
    }
  }
  S.screen = 'online';
  render();
}

function autoJoinFromLink() {
  const key = params.get('cle'), salon = params.get('salon');
  if (!key && !salon) return;
  history.replaceState(null, '', location.pathname + (EMU ? '?emu=1' : ''));
  S.screen = 'online';
  if (!ON.pseudo.trim()) { ON.pendingJoin = key ? { key } : { salon }; return render(); }
  key ? joinByKey(key) : joinRoom(salon);
}

/* ---------- Réception de l'état du salon ---------- */
function onRoom(room) {
  if (!room) {
    if (S.screen === 'onlineRoom') { ON.roomId = null; ON.joinError = 'Le salon a été fermé.'; leaveListeners(); S.screen = 'online'; render(); }
    return;
  }
  ON.room = room;
  if (room.game) normalize(room.game);
  takeOverHostIfNeeded(room);
  if (isHost() && room.meta.public) {
    const count = Object.values(room.players || {}).filter(p => p.online !== false).length;
    update(ref(db, `publicRooms/${ON.roomId}`), { count, status: room.meta.status, hostName: (room.players[me] || {}).name || '' }).catch(() => {});
  }
  handleEvent();
  // Mon tour arrive : petit signal
  const mine = room.game && room.game.stage === 'play' && room.game.cur === me;
  if (mine && !ON.wasMyTurn) { vibrate([60, 60, 60]); Sound.tone(880, 0.15); Sound.tone(1320, 0.2, 0.12); ON.pick = { type: null, claim: null }; }
  ON.wasMyTurn = mine;
  if (S.screen !== 'onlineRoom') return;
  if (S.busy) { ON.pendingRender = true; return; }
  render();
}
setInterval(() => { if (ON.pendingRender && !S.busy) { ON.pendingRender = false; if (S.screen === 'onlineRoom') render(); } }, 150);

// Firebase supprime les valeurs vides : on remet des valeurs par défaut
function normalize(x) {
  x.order = x.order || [];
  x.names = x.names || {};
  x.tokens = x.tokens || {};
  x.out = x.out || {};
  x.dice = x.dice || [0, 0, 0, 0, 0];
  x.table = [0, 1, 2, 3, 4].map(i => !!(x.table && x.table[i]));
  ['open', 'mixed', 'peeked', 'announced'].forEach(k => { x[k] = !!x[k]; });
  ['claim', 'claimer', 'prev', 'last', 'wheel', 'reveal', 'dir', 'roundDir', 'ev', 'dirChooser', 'loser'].forEach(k => { if (x[k] === undefined) x[k] = null; });
  x.msg = x.msg || '';
}

// Si le maître du salon est parti, le premier joueur encore connecté prend sa place
function takeOverHostIfNeeded(room) {
  const P = room.players || {};
  const host = P[room.meta.host];
  if (host && host.online !== false) return;
  const online = Object.entries(P).filter(([, p]) => p.online !== false).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
  if (online.length && online[0][0] === me) update(roomRef('meta'), { host: me });
}

// Effets visibles par tous : sons, chapeau qui tremble, dés qui roulent, fiche qui vole
function handleEvent() {
  const ev = ON.room.game && ON.room.game.ev;
  if (!ev || ev.id === ON.lastEv) return;
  const first = ON.lastEv === null;
  ON.lastEv = ev.id;
  if (first) return; // pas d'animation pour un état déjà ancien
  const mine = ev.by === me;
  switch (ev.type) {
    case 'peek': if (!mine) ev.open ? Sound.hatOpen() : Sound.hatClose(); break;
    case 'shake':
      if (!mine) {
        let n = 0;
        cupShaking(true);
        const t = setInterval(() => { Sound.rattle(); if (++n >= 7) { clearInterval(t); cupShaking(false); Sound.land(); } }, 90);
      }
      break;
    case 'throw': O.throwing = ev.idx || []; ON.throwPending = ev.idx || []; break;
    case 'announce': Sound.tone(660, 0.12); Sound.tone(990, 0.16, 0.1); break;
    case 'pass': Sound.click(0.5); break;
    case 'hat': Sound.tada(); vibrate([0, 500, 40, 80, 300]); ON.anim = ev.anim || null; break;
    case 'move': if (!mine) Sound.click(0.35); break;
  }
}

/* ---------- Règles du jeu (sur l'état partagé) ---------- */
const active = x => x.order.filter(u => !x.out[u]);
function nextActive(x, uid, dir) {
  const n = x.order.length;
  let i = x.order.indexOf(uid);
  for (let k = 0; k < n; k++) { i = (i + dir + n) % n; if (!x.out[x.order[i]]) return x.order[i]; }
  return uid;
}
const hatDice = x => [0, 1, 2, 3, 4].filter(i => !x.table[i]);
const tableDiceIdx = x => [0, 1, 2, 3, 4].filter(i => x.table[i]);
const ev = (type, extra = {}) => ({ id: rid(), type, by: me, ...extra });

function newRound(x, starter) {
  Object.assign(x, {
    stage: 'play', dice: x.dice.map(rollDie), table: [false, false, false, false, false],
    open: false, mixed: false, peeked: false, announced: false,
    claim: null, claimer: null, last: null, cur: starter, prev: null, roundDir: null, reveal: null,
    round: (x.round || 0) + 1,
  });
  x.msg = (x.msg ? x.msg + ' ' : '') + `Nouvelle manche : ${B(starter)} commence.`;
}

// Modifie l'état partagé de façon sûre (transaction) ; fn renvoie false pour annuler
function mutate(fn) {
  return runTransaction(roomRef('game'), x => {
    if (!x) return x;
    normalize(x);
    if (fn(x) === false) return; // annule
    return x;
  }, { applyLocally: true });
}
const myTurn = x => x && x.stage === 'play' && x.cur === me;

function sysChat(text) {
  push(roomRef('chat'), { uid: me, name: ON.pseudo, text, ts: Date.now(), sys: true });
}

/* ---------- Actions du joueur ---------- */
Object.assign(actions, {
  onlineHome() {
    Sound.init();
    const last = (() => { try { return localStorage.getItem('pm-online-room'); } catch (e) { return null; } })();
    if (last && !ON.roomId) ON.resumeId = last;
    ON.joinError = '';
    S.screen = 'online';
    render();
  },
  onPendingJoin() {
    const p = ON.pendingJoin;
    if (!p || needPseudo()) return;
    ON.pendingJoin = null;
    p.key ? joinByKey(p.key) : joinRoom(p.salon);
  },
  onPseudo() {},
  onCreate(pub) { Sound.init(); createRoom(pub === '1'); },
  onJoin(id) { Sound.init(); joinRoom(id); },
  onJoinKey() { Sound.init(); joinByKey(document.getElementById('joinKey')?.value); },
  onResume() { Sound.init(); const id = ON.resumeId; ON.resumeId = null; if (id) joinRoom(id); },
  onLeave() {
    const playing = ON.room && ON.room.meta.status === 'playing';
    if (playing && !confirm('Quitter la partie ? Tu pourras revenir à ta place depuis « Jouer en ligne ».')) return;
    leaveRoom();
  },
  onShare() {
    const m = ON.room.meta;
    const url = `${location.origin}${location.pathname}?${m.public ? 'salon=' + ON.roomId : 'cle=' + m.key}${EMU ? '&emu=1' : ''}`;
    const text = `Viens jouer au Poker Menteur ! ${m.public ? '' : 'Clé : ' + m.key + ' — '}${url}`;
    if (navigator.share) navigator.share({ title: 'Poker Menteur', text, url }).catch(() => {});
    else { navigator.clipboard && navigator.clipboard.writeText(url); alert('Lien copié :\n' + url); }
  },
  onVisibility() {
    const m = ON.room.meta, pub = !m.public;
    update(roomRef('meta'), { public: pub });
    if (pub) set(ref(db, `publicRooms/${ON.roomId}`), { name: m.name, hostName: ON.pseudo, count: Object.keys(ON.room.players || {}).length, status: m.status, createdAt: serverTimestamp() });
    else remove(ref(db, `publicRooms/${ON.roomId}`));
  },
  onToken(t) { if (isHost()) update(roomRef('meta'), { tokenType: t }); },
  onStart() {
    if (!isHost()) return;
    const P = ON.room.players || {};
    const order = Object.entries(P).filter(([, p]) => p.online !== false)
      .sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0)).map(([u]) => u);
    if (order.length < 2) return alert('Il faut au moins 2 joueurs connectés.');
    const names = {}, tokens = {};
    order.forEach(u => { names[u] = P[u].name; tokens[u] = 0; });
    const game = {
      stage: 'wheel', order, names, tokens, out: {}, pot: 2 * order.length + 1,
      phase: 'charge', dir: null, roundDir: null, round: 0,
      dice: [0, 0, 0, 0, 0], table: [false, false, false, false, false], msg: '',
      ev: { id: rid(), type: 'start', by: me },
    };
    update(roomRef(), { game, 'meta/status': 'playing' });
    sysChat(`🎲 La partie commence ! ${order.length} joueurs, ${game.pot} fiches au milieu.`);
  },
  onSpin() {
    if (!isHost()) return;
    mutate(x => {
      if (x.stage !== 'wheel' || x.wheel) return false;
      const k = Math.floor(Math.random() * x.order.length), seg = 360 / x.order.length;
      x.wheel = { pick: x.order[k], rot: 360 * 6 + (360 - (k + 0.5) * seg) - (Math.random() - 0.5) * seg * 0.7, at: Date.now() };
    }).then(() => setTimeout(() => mutate(x => {
      if (x.stage !== 'wheel' || !x.wheel) return false;
      x.msg = '';
      newRound(x, x.wheel.pick);
    }), WHEEL_MS + 1800));
  },

  onPeek() {
    const wasOpen = !!(g() && g().open);
    wasOpen ? Sound.hatClose() : Sound.hatOpen();
    vibrate([40, 70, 40]);
    mutate(x => {
      if (!myTurn(x)) return false;
      x.open = !x.open;
      if (x.open) x.peeked = true;
      x.ev = ev('peek', { open: x.open });
    });
  },
  onShake() {
    const x = g();
    if (!myTurn(x) || x.open || x.mixed || !hatDice(x).length) return;
    Sound.init();
    fakeShake(() => mutate(y => {
      if (!myTurn(y) || y.open || y.mixed) return false;
      const idx = hatDice(y);
      idx.forEach(i => { y.dice[i] = rollDie(); });
      y.mixed = true;
      y.last = { where: 'hat', n: idx.length };
      y.ev = ev('shake');
    }).then(() => { Sound.land(); vibrate([30, 40, 30]); }));
  },
  onRoll() {
    const x = g();
    if (!myTurn(x) || x.mixed || !tableDiceIdx(x).length || S.busy) return;
    Sound.init();
    mutate(y => {
      if (!myTurn(y) || y.mixed) return false;
      const idx = tableDiceIdx(y);
      idx.forEach(i => { y.dice[i] = rollDie(); });
      y.mixed = true;
      y.last = { where: 'table', n: idx.length };
      y.ev = ev('throw', { idx });
    });
  },
  onType(t) { ON.pick.type = +t; ON.pick.claim = null; render(); },
  onPick(sc) { ON.pick.claim = ALL_CLAIMS.find(c => score(c) === +sc); Sound.click(0.3); render(); },
  onAnnounce() {
    const c = ON.pick.claim, x = g();
    if (!c || !myTurn(x) || x.announced || (x.claim && score(c) <= score(x.claim))) return;
    mutate(y => {
      if (!myTurn(y) || y.announced || (y.claim && score(c) <= score(y.claim))) return false;
      y.claim = c; y.claimer = me; y.announced = true;
      y.msg = `${B(me)} annonce <span class="claim-inline">${handName(c)}</span>.`;
      y.ev = ev('announce');
    });
    sysChat(`📣 ${ON.pseudo} annonce : ${handName(c)}`);
  },
  onPass(dir) {
    dir = +dir;
    mutate(x => {
      if (!myTurn(x) || x.open || !x.announced) return false;
      let note = '';
      if (x.phase === 'charge' && x.roundDir == null) { x.roundDir = dir; note = ` On tourne dans le ${dirName(dir)}.`; }
      const d = x.phase === 'decharge' ? x.dir : x.roundDir;
      const to = nextActive(x, me, d);
      x.prev = me; x.cur = to;
      Object.assign(x, { open: false, mixed: false, peeked: false, announced: false });
      x.msg = `${B(me)} passe le chapeau à ${B(to)}.${note}`;
      x.ev = ev('pass');
    });
  },
  onHat() {
    const x0 = g();
    if (!canCallHat(x0)) return;
    if (!O.armed) {
      O.armed = true; render();
      clearTimeout(O.armT);
      O.armT = setTimeout(() => { O.armed = false; render(); }, 3000);
      return;
    }
    O.armed = false;
    let summary = '';
    mutate(x => {
      if (!canCallHat(x)) return false;
      const caller = me, claimer = x.prev, truth = isTrue(x.dice, x.claim);
      const loser = truth ? caller : claimer, winner = truth ? claimer : caller;
      const actual = evaluate(x.dice);
      let anim, rule;
      if (x.phase === 'charge') {
        x.tokens[loser] = (x.tokens[loser] || 0) + 1;
        x.pot--;
        anim = { from: 'pot', to: loser };
        rule = `${B(loser)} prend une fiche du pot.`;
      } else {
        x.tokens[winner]--;
        x.pot++;
        anim = { from: winner, to: 'pot' };
        rule = `${B(winner)} gagne et remet une fiche au milieu.`;
        if (x.tokens[winner] <= 0) { x.out[winner] = true; rule += ` ${B(winner)} n'a plus de fiche : sauvé ! 🎉`; }
      }
      x.reveal = { caller, claimer, claim: x.claim, actual, truth, loser, winner };
      x.stage = 'reveal';
      x.open = false;
      x.msg = rule;
      x.ev = ev('hat', { anim });
      summary = `🎩 ${x.names[caller]} dit chapeau à ${x.names[claimer]} (${handName(x.claim)}) : il y avait ${handName(actual)}. ${x.names[loser]} perd.`;
    }).then(() => summary && sysChat(summary));
  },
  onContinue() {
    mutate(x => {
      if (x.stage !== 'reveal') return false;
      const loser = x.reveal.loser;
      if (x.phase === 'charge' && x.pot <= 0) {
        // Début de la décharge : ceux qui n'ont aucune fiche sont sauvés
        x.phase = 'decharge';
        const safe = x.order.filter(u => !(x.tokens[u] > 0));
        safe.forEach(u => { x.out[u] = true; });
        x.msg = safe.length ? `Sans fiche, ${safe.map(B).join(', ')} ${safe.length > 1 ? 'sont sauvés' : 'est sauvé'} !` : '';
        const act = active(x);
        if (act.length <= 1) { x.stage = 'over'; x.loser = act[0] || loser; return; }
        if (act.length === 2) { x.dir = 1; x.msg += ' Décharge !'; return newRound(x, loser); }
        x.stage = 'dir'; x.dirChooser = loser; return;
      }
      const act = active(x);
      if (x.phase === 'decharge' && act.length <= 1) { x.stage = 'over'; x.loser = act[0]; return; }
      newRound(x, loser);
    });
  },
  onDir(d) {
    mutate(x => {
      if (x.stage !== 'dir' || x.dirChooser !== me) return false;
      x.dir = +d;
      x.msg = `Décharge dans le ${dirName(x.dir)}.`;
      newRound(x, me);
    });
  },
  onReplay() {
    if (!isHost()) return;
    update(roomRef(), { game: null, 'meta/status': 'lobby' });
    sysChat('🔄 Retour au salon pour une nouvelle partie.');
  },

  toggleChat() {
    ON.chatOpen = !ON.chatOpen;
    if (ON.chatOpen) ON.unread = 0;
    drawChat();
    const b = document.getElementById('chatBadge');
    if (b) b.textContent = '';
    if (ON.chatOpen) setTimeout(() => document.getElementById('chatInput')?.focus(), 250);
  },
  sendChat(txt) {
    const input = document.getElementById('chatInput');
    const text = (txt || (input && input.value) || '').trim().slice(0, 300);
    if (!text || !ON.roomId) return;
    push(roomRef('chat'), { uid: me, name: ON.pseudo, text, ts: Date.now() });
    if (input && !txt) input.value = '';
  },
});

const canCallHat = x => myTurn(x) && x.claim && x.prev && !x.peeked && !x.mixed && !x.announced;

// Toucher ou glisser un dé : en ligne, on modifie l'état partagé
const localMove = window.moveDie;
window.moveDie = (i, where) => {
  if (S.screen !== 'onlineRoom') return localMove(i, where);
  mutate(x => {
    if (!myTurn(x) || x.mixed) return false;
    if (where === 'table' && !x.table[i] && x.open) x.table[i] = true;
    else if (where === 'hat' && x.table[i]) x.table[i] = false;
    else return false;
    x.ev = ev('move');
  });
  Sound.click(0.4);
};
const localTap = actions.oralTap;
actions.oralTap = i => {
  if (S.screen !== 'onlineRoom') return localTap(i);
  const x = g();
  if (x) window.moveDie(+i, x.table[+i] ? 'hat' : 'table');
};

// Secouer pour mélanger (option) : seulement à mon tour, chapeau fermé, lancer pas encore fait
window.onlineArmShake = () => {
  const x = g();
  if (shakeOn && myTurn(x) && !x.open && !x.mixed && hatDice(x).length && !S.busy) {
    if (!Shake.on) Shake.start(() => actions.onShake());
  } else Shake.stop();
};

document.addEventListener('input', e => {
  if (e.target.id === 'pseudo') { ON.pseudo = e.target.value.slice(0, 14); savePseudo(); }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'chatInput') actions.sendChat();
  if (e.target.id === 'joinKey') actions.onJoinKey();
  if (e.target.id === 'pseudo' && ON.pendingJoin) { const p = ON.pendingJoin; ON.pendingJoin = null; p.key ? joinByKey(p.key) : joinRoom(p.salon); }
});

/* ---------- Affichage : recopie l'état partagé dans G / O du mode local ---------- */
function mapToLocal(x) {
  const P = (ON.room && ON.room.players) || {};
  const idx = u => x.order.indexOf(u);
  G = {
    mode: 'complet', online: true,
    players: x.order.map(u => ({ name: x.names[u], tokens: x.tokens[u] || 0, out: !!x.out[u], offline: P[u] && P[u].online === false })),
    pot: x.pot, tokenType: (ON.room.meta && ON.room.meta.tokenType) || 'cailloux',
    phase: x.phase, dir: x.dir, roundDir: x.roundDir,
    current: x.cur != null ? idx(x.cur) : 0, prev: x.prev ? idx(x.prev) : null,
    wheel: { done: ON.wheelDone, pick: x.wheel ? idx(x.wheel.pick) : null, rot: x.wheel ? x.wheel.rot : 0 },
    msg: x.msg,
  };
  const mine = myTurn(x);
  O.dice = x.dice.slice(); O.table = x.table.slice();
  // Hors de mon tour, les dés sont figés pour moi (O.mixed les rend non touchables)
  O.open = mine && x.open; O.mixed = x.mixed || !mine; O.last = x.last; O.peeked = x.peeked;
  O.rolled = [];
}

function onlineTopbar(title) {
  return `<div class="topbar">
    <div class="apptitle">${title}</div>
    <div class="tools">
      ${ON.roomId ? `<button class="icon chatbtn" data-act="toggleChat" aria-label="Chat">💬<span id="chatBadge" class="badge-n">${ON.unread || ''}</span></button>` : ''}
      <button class="icon ${shakeOn ? '' : 'off'}" data-act="toggleShake" aria-label="Secouer pour mélanger">📳</button>
      <button class="icon" data-act="mute" aria-label="Son">${S.muted ? '🔇' : '🔊'}</button>
      <button class="icon" data-act="${ON.roomId ? 'onLeave' : 'menu'}" aria-label="Quitter">✕</button>
    </div>
  </div>`;
}

window.onlineHomeHTML = () => {
  const top = `<div class="topbar"><button class="icon" data-act="menu" aria-label="Retour">←</button><div class="apptitle">🌐 Jouer en ligne</div></div>`;
  if (!config) {
    return `${top}<section class="card"><h2>Pas encore configuré</h2>
      <p>Le jeu en ligne a besoin d'un projet Firebase. Suis le guide <b>FIREBASE.md</b> du projet, puis colle la configuration dans <code>firebase-config.js</code>.</p></section>`;
  }
  if (NET.error) return `${top}<section class="card"><h2>Connexion impossible</h2><p>${esc(NET.error)}</p></section>`;
  if (!ready) return `${top}<div class="online-wait">${spinningHat()}<p>Connexion…</p></div>`;
  return `${top}
    ${ON.joinError ? `<p class="errmsg">${esc(ON.joinError)}</p>` : ''}
    ${ON.pendingJoin ? `<section class="card invite"><h2>📨 Invitation reçue</h2><p>Entre ton pseudo ci-dessous puis :</p><button class="btn good big" data-act="onPendingJoin">Rejoindre le salon</button></section>` : ''}
    ${ON.resumeId && !ON.pendingJoin ? `<button class="btn good big" data-act="onResume">▶ Revenir dans mon dernier salon</button>` : ''}
    <section class="card">
      <h2>Ton pseudo</h2>
      <input id="pseudo" class="txt" value="${esc(ON.pseudo)}" maxlength="14" placeholder="Ex. : Hugo" autocomplete="nickname">
    </section>
    <section class="card">
      <h2>Salons publics</h2>
      <div id="roomList" class="roomlist">${roomListHTML()}</div>
    </section>
    <section class="card">
      <h2>Créer un salon</h2>
      <input id="roomName" class="txt" maxlength="24" placeholder="Nom du salon (facultatif)">
      <div class="row2">
        <button class="btn primary" data-act="onCreate" data-arg="1">🌍 Public</button>
        <button class="btn" data-act="onCreate" data-arg="0">🔒 Privé</button>
      </div>
      <p class="hint small">Public : visible dans la liste. Privé : on le rejoint avec une clé que tu partages.</p>
    </section>
    <section class="card">
      <h2>Rejoindre avec une clé</h2>
      <div class="keyrow"><input id="joinKey" class="txt key" maxlength="6" placeholder="ABC123" autocapitalize="characters"><button class="btn primary" data-act="onJoinKey">Rejoindre</button></div>
    </section>`;
};

function spinningHat() {
  return `<div class="spinhat">${HAT_SVG}</div>`;
}

function lobbyHTML() {
  const room = ON.room, m = room.meta, P = room.players || {};
  const list = Object.entries(P).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
  const n = list.length;
  const seats = list.map(([u, p], i) => {
    const { x, y } = seatPos(i, Math.max(n, 2));
    return `<div class="seat ${u === m.host ? 'cur' : ''} ${p.online === false ? 'offline' : ''}" style="left:${x}%;top:${y}%">
      <span class="sname">${u === m.host ? '👑 ' : ''}${esc(p.name)}</span><span class="stoks">${u === me ? 'toi' : p.online === false ? '📵' : 'prêt'}</span></div>`;
  }).join('');
  const host = isHost();
  return `${onlineTopbar(esc(m.name))}
    <div class="ptable lobby">
      <div class="oval"><div class="lobby-hat">${spinningHat()}</div></div>
      ${seats}
      <span class="phase">${m.public ? '🌍 Public' : '🔒 Privé'}</span>
    </div>
    <p class="gmsg">${n < 2 ? 'En attente d\'autres joueurs…' : `${n} joueur${n > 1 ? 's' : ''} dans le salon.`} ${host ? '' : `En attente que ${esc((P[m.host] || {}).name || 'le maître du salon')} lance la partie.`}</p>
    <section class="card share">
      ${m.public ? '' : `<div class="bigkey">Clé : <b>${esc(m.key)}</b></div>`}
      <button class="btn" data-act="onShare">🔗 Inviter des amis</button>
      ${host ? `<button class="toggle ${m.public ? 'on' : ''}" data-act="onVisibility"><span>🌍 Salon public (visible dans la liste)</span><i></i></button>` : ''}
    </section>
    ${host ? `<section class="card"><h2>Fiches</h2><div class="tokens">${Object.keys(TOKEN_TYPES).map(t => `
        <button class="style-opt ${m.tokenType === t ? 'on' : ''}" data-act="onToken" data-arg="${t}"><span class="tok-prev">${pileHTML(t, 5, 5, 1)}</span><b>${TOKEN_TYPES[t]}</b></button>`).join('')}</div></section>
      <button class="btn primary big" data-act="onStart" ${n < 2 ? 'disabled' : ''}>🎲 Lancer la partie</button>` : ''}`;
}

function claimPickerHTML(x) {
  const above = claimsAbove(x.claim), actual = evaluate(x.dice);
  if (!above.length) return '<p class="hint">Plus aucune annonce possible : dis « Chapeau ! ».</p>';
  if (ON.pick.type == null || !above.some(c => c.t === ON.pick.type)) {
    ON.pick.type = (actual.t > 0 && above.some(c => c.t === actual.t)) ? actual.t : above[0].t;
  }
  const types = TYPE_ORDER.map(t => `<button class="chip ${ON.pick.type === t ? 'on' : ''}" data-act="onType" data-arg="${t}" ${above.some(c => c.t === t) ? '' : 'disabled'}>${TYPE_NAMES[t]}</button>`).join('');
  const label = c => c.t === 2 ? `${PLURAL[c.a]} + ${PLURAL[c.b]}` : c.t === 6 ? `${PLURAL[c.a]} par ${PLURAL[c.b]}` : (c.t === 4 || c.t === 5) ? TYPE_NAMES[c.t] : PLURAL[c.a];
  const pick = ON.pick.claim;
  const vals = above.filter(c => c.t === ON.pick.type).map(c => `<button class="val ${pick && score(pick) === score(c) ? 'on' : ''} ${score(c) <= score(actual) ? 'true' : ''}" data-act="onPick" data-arg="${score(c)}">${label(c)}</button>`).join('');
  const bluff = pick && score(pick) > score(actual);
  return `<div class="picker">
    <div class="types">${types}</div>
    <div class="vals ${ON.pick.type === 6 || ON.pick.type === 2 ? 'wide' : ''}">${vals}</div>
    <button class="btn primary" data-act="onAnnounce" ${pick ? '' : 'disabled'}>${pick ? `📣 Annoncer : ${handName(pick)} ${bluff ? '<span class="tag">bluff 😏</span>' : ''}` : 'Choisis ton annonce'}</button>
  </div>`;
}

function playHTML(x) {
  const mine = myTurn(x), cur = x.cur;
  const claimBanner = x.claim
    ? `<div class="banner"><small>Annonce de ${B(x.claimer)}</small><strong>${handName(x.claim)}</strong></div>`
    : '<div class="banner muted">Pas encore d\'annonce dans cette manche</div>';
  let body;
  if (!mine) {
    const doing = x.open ? `👀 ${B(cur)} regarde dans le chapeau`
      : x.announced ? `📣 ${B(cur)} a annoncé et va passer le chapeau`
      : `⏳ À ${B(cur)} de jouer`;
    body = `${lastRollHTML()}${oralFelt(false)}<div class="waiting">${spinningHat()}<p>${doing}</p></div>`;
  } else {
    const t = tableDiceIdx(x).length, h = hatDice(x).length, locked = x.mixed;
    const peek = x.open ? '<button class="btn ghost" data-act="onPeek">🙈 Refermer le chapeau</button>' : '<button class="btn" data-act="onPeek">👀 Regarder dans le chapeau</button>';
    const dice = `<div class="row2">
        <button class="btn" data-act="onShake" ${h && !locked && !x.open ? '' : 'disabled'}>🎩 Mélanger</button>
        <button class="btn" data-act="onRoll" ${t && !locked ? '' : 'disabled'}>🎲 Lancer la table${t ? ` (${t})` : ''}</button>
      </div>
      <p class="hint small">${locked ? '✓ Lancer fait : un seul par tour.' : x.open ? 'Pour mélanger, referme d\'abord le chapeau.' : 'Un seul lancer par tour : mélanger le chapeau ou lancer la table.'}</p>`;
    let pass = '';
    if (x.announced) {
      const d = x.phase === 'decharge' ? x.dir : x.roundDir;
      const cw = nextActive(x, me, 1), ccw = nextActive(x, me, -1), dis = x.open ? 'disabled' : '';
      pass = (d != null || cw === ccw)
        ? `<button class="btn primary" data-act="onPass" data-arg="${d || 1}" ${dis}>📱 Passer à ${nameOf(nextActive(x, me, d || 1))} ${(d || 1) === 1 ? '↻' : '↺'}</button>`
        : `<p class="hint small">À qui tu passes ? Ça fixe le sens pour toute la manche.</p>
           <div class="row2"><button class="btn primary" data-act="onPass" data-arg="1" ${dis}>📱 ↻ ${nameOf(cw)}</button><button class="btn primary" data-act="onPass" data-arg="-1" ${dis}>${nameOf(ccw)} ↺ 📱</button></div>`;
      if (x.open) pass += '<p class="hint small">Referme le chapeau pour passer.</p>';
    }
    const canHat = canCallHat(x);
    const hat = x.claim && x.prev ? `<button class="btn danger big ${O.armed ? 'armed' : ''}" data-act="onHat" ${canHat ? '' : 'disabled'}>${
      O.armed ? 'Sûr ? Touche encore' : canHat ? `🎩 Chapeau à ${nameOf(x.prev)} !` : '🎩 Chapeau ! <small>(tu as accepté l\'annonce)</small>'}</button>` : '';
    body = `${lastRollHTML()}${oralFelt(false)}
      ${x.open ? `<p class="mine">Avec la table : <b>${handName(evaluate(x.dice))}</b>${locked ? '' : ' · <small>touche ou fais glisser un dé</small>'}</p>` : ''}
      <div class="actions">
        <p class="turn">🎩 À toi de jouer !</p>
        ${hat}
        ${peek}
        ${dice}
        ${x.announced ? `<p class="mine">Tu as annoncé : <b>${handName(x.claim)}</b></p>${pass}` : claimPickerHTML(x)}
      </div>`;
  }
  return `${onlineTopbar('🎩 ' + esc(ON.room.meta.name))}
    ${mine ? playersStripHTML(G) : pokerTableHTML(G)}
    ${x.msg && !mine ? `<p class="gmsg">${x.msg}</p>` : ''}
    ${claimBanner}
    ${body}`;
}

function revealHTML(x) {
  const r = x.reveal;
  O.open = true;
  return `${onlineTopbar('🎩 ' + esc(ON.room.meta.name))}
    ${pokerTableHTML(G)}
    <div class="reveal">
      <h2 class="shout">« Chapeau ! »</h2>
      <p>${B(r.caller)} ne croit pas ${B(r.claimer)}, qui annonçait <b>${handName(r.claim)}</b>.</p>
      ${oralFelt(true)}
      <p class="actual">Il y a : <b>${handName(r.actual)}</b></p>
      <div class="verdict ${r.truth ? 'truth' : 'lie'}">${r.truth ? `C'était vrai ! ${B(r.loser)} a perdu.` : `C'était du bluff ! ${B(r.loser)} a perdu.`}<br><small>${x.msg}</small></div>
      <button class="btn primary big" data-act="onContinue">Manche suivante</button>
    </div>`;
}

function wheelHTML(x) {
  const W = x.wheel;
  if (W && ON.wheelSeen !== W.at) {
    ON.wheelSeen = W.at; ON.wheelDone = false;
    const left = Math.max(0, WHEEL_MS - (Date.now() - W.at));
    if (left > 300) {
      // Animation de la roue chez chaque joueur
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = document.getElementById('wheel');
        if (el) { el.style.transition = `transform ${left}ms cubic-bezier(.12,.6,.1,1)`; el.style.transform = `rotate(${W.rot}deg)`; }
      }));
      let t = 0, gap = 45;
      while (t < left - 300) { Sound.click(0.35, t / 1000); t += gap; gap *= 1.07; }
      setTimeout(() => { ON.wheelDone = true; Sound.tada(); render(); }, left + 100);
    } else ON.wheelDone = true;
  }
  G.wheel.done = ON.wheelDone;
  const spinning = W && !ON.wheelDone;
  return `${onlineTopbar('🎩 ' + esc(ON.room.meta.name))}
    <div class="wheel-screen">
      <h2>Qui commence ?</h2>
      <div class="wheel-box">
        <div class="wheel-ptr"></div>
        <div class="wheel" id="wheel" style="transform:rotate(${W && !spinning ? W.rot : 0}deg)">${wheelSVG()}</div>
      </div>
      ${!W ? (isHost() ? '<button class="btn primary big" data-act="onSpin">🎡 Faire tourner la roue</button>' : '<p class="hint big">Le maître du salon va faire tourner la roue…</p>')
        : spinning ? '<p class="hint big">La roue tourne…</p>'
        : `<p class="wheel-res">${B(W.pick)} commence !</p>`}
    </div>`;
}

function dirHTML(x) {
  const c = x.dirChooser;
  return `${onlineTopbar('🎩 ' + esc(ON.room.meta.name))}
    ${pokerTableHTML(G)}
    <div class="reveal">
      <h2 class="shout gold">Décharge !</h2>
      <p class="gmsg">${x.msg}</p>
      ${c === me
        ? `<p>Tu as pris la dernière fiche : choisis le sens du jeu. Ensuite, il ne change plus.</p>
           <button class="btn primary big" data-act="onDir" data-arg="1">↻ Sens des aiguilles d'une montre<br><small>vers ${nameOf(nextActive(x, me, 1))}</small></button>
           <button class="btn primary big" data-act="onDir" data-arg="-1">↺ Sens inverse<br><small>vers ${nameOf(nextActive(x, me, -1))}</small></button>`
        : `<div class="waiting">${spinningHat()}<p>${B(c)} choisit le sens du jeu…</p></div>`}
    </div>`;
}

function overHTML(x) {
  return `${onlineTopbar('🎩 ' + esc(ON.room.meta.name))}
    ${pokerTableHTML(G)}
    <div class="end">
      <div class="trophy">🏁</div>
      <h2>${nameOf(x.loser)} a perdu la partie</h2>
      <p class="gmsg">${x.msg}</p>
      ${isHost() ? '<button class="btn primary big" data-act="onReplay">🔄 Rejouer (retour au salon)</button>' : '<p class="hint">Le maître du salon peut relancer une partie.</p>'}
      <button class="btn ghost" data-act="onLeave">Quitter le salon</button>
    </div>`;
}

window.onlineRoomHTML = () => {
  const room = ON.room;
  if (!room) return `${onlineTopbar('🌐 Salon')}<div class="online-wait">${spinningHat()}<p>Connexion au salon…</p></div>`;
  const x = room.game;
  if (!x || room.meta.status === 'lobby') return lobbyHTML();
  mapToLocal(x);
  switch (x.stage) {
    case 'wheel': return wheelHTML(x);
    case 'reveal': return revealHTML(x);
    case 'dir': return dirHTML(x);
    case 'over': return overHTML(x);
    default: return playHTML(x);
  }
};

// Après l'affichage : dés qui roulent, fiche qui vole, secousse
window.onlineAfterRender = () => {
  if (S.screen !== 'onlineRoom') return;
  window.onlineArmShake();
  if (ON.throwPending) {
    const idx = ON.throwPending;
    ON.throwPending = null; O.throwing = [];
    animateThrow(idx);
  }
  if (ON.anim) {
    const a = ON.anim, x = g();
    ON.anim = null;
    if (x) {
      const id = v => (v === 'pot' ? 'pot' : `seat-${x.order.indexOf(v)}`);
      setTimeout(() => flyToken(G.tokenType, id(a.from), id(a.to)), 400);
    }
  }
  const b = document.getElementById('chatBadge');
  if (b) b.textContent = ON.unread ? String(ON.unread) : '';
};

/* ---------- Chat (panneau sur le côté, hors de l'écran principal pour ne pas perdre la saisie) ---------- */
const chatEl = document.createElement('aside');
chatEl.id = 'chat';
chatEl.innerHTML = `<div class="chat-head"><b>💬 Chat du salon</b><button class="icon" data-act="toggleChat" aria-label="Fermer">✕</button></div>
  <div class="chat-list" id="chatList"></div>
  <div class="chat-quick">${['😂', '🤥', '👏', '🎩', '😱', '🔥'].map(e => `<button data-act="sendChat" data-arg="${e}">${e}</button>`).join('')}</div>
  <div class="chat-input"><input id="chatInput" maxlength="300" placeholder="Écris un message…" autocomplete="off"><button class="btn primary sm" data-act="sendChat">➤</button></div>`;
document.body.appendChild(chatEl);
const chatShade = document.createElement('div');
chatShade.id = 'chatShade';
chatShade.dataset.act = 'toggleChat';
document.body.appendChild(chatShade);

function drawChat() {
  chatEl.classList.toggle('open', ON.chatOpen && !!ON.roomId);
  chatShade.classList.toggle('open', ON.chatOpen && !!ON.roomId);
  const list = document.getElementById('chatList');
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.innerHTML = ON.chat.map(m => m.sys
    ? `<div class="msg-sys">${esc(m.text)}</div>`
    : `<div class="msg ${m.uid === me ? 'me' : ''}"><small>${esc(m.name || '?')}</small><span>${esc(m.text)}</span></div>`).join('')
    || '<p class="empty">Pas encore de message.</p>';
  if (atBottom || ON.chatOpen) list.scrollTop = list.scrollHeight;
  const b = document.getElementById('chatBadge');
  if (b) b.textContent = ON.unread ? String(ON.unread) : '';
}

// Le module se charge après le premier affichage : on rafraîchit si besoin
if (S.screen === 'online' || S.screen === 'onlineRoom') render();

// Lecture seule de l'état, pour les tests automatiques
window.ON_DEBUG = () => {
  const x = g();
  if (!x) return { stage: ON.room ? 'lobby' : null };
  return {
    stage: x.stage, mine: myTurn(x), canHat: !!canCallHat(x), chooser: x.stage === 'dir' && x.dirChooser === me,
    summary: `${x.phase} pot=${x.pot} ` + x.order.map(u => `${x.names[u]}:${x.tokens[u] || 0}${x.out[u] ? '✓' : ''}`).join(' '),
  };
};
