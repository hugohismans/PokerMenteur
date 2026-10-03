'use strict';
/* Tutoriel pas à pas : les règles du poker menteur et comment se servir de l'écran. */

const tdice = (faces, cls = '') => `<span class="t-dice ${cls}">${faces.map(v => `<span class="die f${v}">${faceInner(v)}</span>`).join('')}</span>`;
const thint = (icon, html) => `<div class="t-row"><span class="t-ico">${icon}</span><span>${html}</span></div>`;

const TUTO = [
  {
    title: 'Bienvenue au Poker Menteur',
    art: () => `<div class="t-art">${tdice([0, 1, 2, 3, 4, 5])}<div class="t-hat">${HAT_SVG}</div></div>`,
    body: () => `<p>On joue avec <b>5 dés</b> à six faces : <b>9, 10, Valet, Dame, Roi, As</b>, et un <b>chapeau</b> qui cache les dés.</p>
      <p>Chacun à son tour annonce ce qu'il y a sous le chapeau… <b>en disant la vérité ou en bluffant</b>. Le suivant le croit, ou crie <b>« Chapeau ! »</b>.</p>
      <p>Le but : <b>ne pas se faire prendre</b> et ne plus avoir de fiches à la fin.</p>`,
  },
  {
    title: 'Les combinaisons',
    art: () => `<ol class="t-combos">${[
      ['Paire', [5, 5]], ['Double paire', [4, 4, 1, 1]], ['Petite suite', [0, 1, 2, 3, 4]], ['Brelan', [3, 3, 3]],
      ['Grande suite', [1, 2, 3, 4, 5]], ['Full', [5, 5, 5, 2, 2]], ['Carré', [4, 4, 4, 4]], ['Poker', [5, 5, 5, 5, 5]],
    ].map(([n, f]) => `<li><b>${n}</b>${tdice(f, 'sm')}</li>`).join('')}</ol>`,
    body: () => `<p>De la plus faible (en haut) à la plus forte. À combinaison égale, la plus haute valeur gagne : <b>As &gt; Roi &gt; Dame &gt; Valet &gt; 10 &gt; 9</b>.</p>`,
  },
  {
    title: 'Ton tour, en bref',
    art: () => `<div class="t-art"><div class="banner compact"><small>Léa :</small><strong>Brelan de Rois</strong>${tdice([4, 4, 4], 'sm')}</div></div>`,
    body: () => `<p>Le chapeau arrive chez toi avec l'annonce du joueur précédent. Tu as deux choix :</p>
      ${thint('🎩', '<b>« Chapeau ! »</b> : tu ne le crois pas. On soulève le chapeau et on regarde.')}
      ${thint('✅', '<b>Tu acceptes</b> : tu regardes, tu peux relancer des dés, puis tu annonces <b>plus fort</b> et tu passes le chapeau.')}
      <p class="t-note">Regarder dans le chapeau ou lancer des dés, c'est accepter : ensuite, plus de « Chapeau ! ».</p>`,
  },
  {
    title: 'Regarder dans le chapeau',
    art: () => `<div class="t-art"><div class="t-hat lift">${HAT_SVG}</div>${tdice([5, 4, 4, 1, 0])}</div>`,
    body: () => `${thint('👆', '<b>Touche le chapeau</b> pour regarder les dés : toi seul les vois. Touche <b>Refermer ✕</b> pour le reposer.')}
      ${thint('🔁', 'Tu peux regarder <b>autant de fois</b> que tu veux.')}
      ${thint('🎲', 'En <b>début de manche</b>, il faut d\'abord <b>mélanger</b> avant de regarder.')}`,
  },
  {
    title: 'Relancer : un seul lancer par tour',
    art: () => `<div class="t-art t-felt"><div><small>Sur la table · tout le monde les voit</small>${tdice([5, 5])}</div><div class="t-hat sm">${HAT_SVG}</div></div>`,
    body: () => `${thint('🎩', '<b>Mélanger</b> (chapeau fermé) : on relance <b>les dés du chapeau</b>.')}
      ${thint('🎲', '<b>Lancer la table</b> : on relance <b>les dés posés sur la table</b>, visibles par tous.')}
      ${thint('↕️', 'Avant ton lancer, <b>touche ou fais glisser</b> un dé pour le passer du chapeau à la table, ou l\'inverse. Une fois le lancer fait, les dés ne bougent plus.')}
      ${thint('📳', 'Option : <b>secoue le téléphone</b> pour mélanger.')}`,
  },
  {
    title: 'Annoncer',
    art: () => `<div class="t-art"><div class="t-compose">${tdice([4, 4, 4, 5])}<b>Brelan de Rois, As</b></div><div class="t-facebar">${tdice([0, 1, 2, 3, 4, 5])}</div></div>`,
    body: () => `${thint('👆', 'En ligne, <b>touche les dés</b> de la barre (de 1 à 5) : l\'appli trouve la combinaison. Puis <b>📣 Annoncer</b> : le chapeau passe tout seul.')}
      ${thint('⬆️', 'Il faut annoncer <b>plus fort</b>. Les dés en plus départagent : après « Brelan de Rois, As », il faut au moins « Brelan de Rois, As, 9 ».')}
      ${thint('🤫', 'Tu peux <b>sous-annoncer</b> : l\'annonce est vraie si les dés valent <b>au moins</b> ce qui est annoncé.')}
      ${thint('💥', 'Après un <b>Poker</b>, plus rien n\'est possible : le suivant fait « Chapeau ! » automatiquement.')}
      <p class="t-note">En local, les annonces se font à voix haute.</p>`,
  },
  {
    title: '« Chapeau ! » et les fiches',
    art: () => `<div class="t-art"><div class="verdict lie">C'était du bluff ! Léa a perdu.</div><div class="t-toks">${pileHTML('cailloux', 7, 7, 2)}</div></div>`,
    body: () => `<p>On soulève le chapeau : si l'annonce est <b>vraie</b>, celui qui a dit « Chapeau ! » perd. Si c'était <b>du bluff</b>, c'est l'annonceur qui perd.</p>
      ${thint('➕', '<b>La charge</b> : au départ il y a 2 × le nombre de joueurs + 1 fiches au milieu. Le perdant en prend une.')}
      ${thint('➖', '<b>La décharge</b> (quand le pot est vide) : le gagnant remet une de ses fiches au milieu. Sans fiche, on est <b>sauvé</b>.')}
      ${thint('🏁', 'Le <b>dernier</b> qui a encore des fiches a perdu la partie. Le perdant commence la manche suivante.')}`,
  },
  {
    title: 'L\'écran de jeu',
    art: () => `<div class="t-art">${pokerTableHTML({ players: [{ name: 'Toi', tokens: 2 }, { name: 'Léa', tokens: 1 }, { name: 'Tom', tokens: 0 }], current: 1, prev: 0, phase: 'charge', roundDir: 1, pot: 4, tokenType: 'cailloux', hatAt: 1, tableFaces: [5, 5], claimAt: 0, claimFaces: [4, 4, 4] }).replace(/data-act="seatTap"/g, '')}</div>`,
    body: () => `${thint('🎩', 'La <b>table vue du dessus</b> : le chapeau passe de joueur en joueur, se soulève quand quelqu\'un regarde, la bulle montre la dernière annonce.')}
      ${thint('📜', 'Touche le <b>bandeau d\'annonce</b> pour voir l\'<b>historique des annonces</b> de la manche.')}
      ${thint('🍅', 'Touche un <b>joueur</b> pour lui lancer une tomate, des fleurs, un café…')}
      ${thint('💬', '<b>Chat</b>, 🔊 son, ⏱ temps pour jouer, et dans les options : <b>🔠 taille du texte</b>.')}`,
  },
  {
    title: 'Trois façons de jouer',
    art: () => `<div class="t-art t-modes"><span>📱<small>Simple</small></span><span>🪙<small>Complet</small></span><span>🌐<small>En ligne</small></span></div>`,
    body: () => `${thint('📱', '<b>Simple</b> : un seul téléphone qu\'on se passe, l\'appli gère les dés et le chapeau, vos fiches sont sur la vraie table.')}
      ${thint('🪙', '<b>Complet</b> : l\'appli gère aussi les joueurs et les fiches ; une roue tire au sort qui commence.')}
      ${thint('🌐', '<b>En ligne</b> : chacun sur son téléphone, salon public ou privé (avec une clé), et des spectateurs.')}
      <p class="t-go">Bon jeu… et méfie-toi des menteurs ! 🎩</p>`,
  },
];

let tutoStep = 0;
function tutoHTML() {
  const s = TUTO[tutoStep], last = tutoStep === TUTO.length - 1;
  return `<div class="topbar"><button class="icon" data-act="tutoExit" aria-label="Fermer">←</button><div class="apptitle">📖 Tutoriel</div>
      <span class="t-count">${tutoStep + 1} / ${TUTO.length}</span></div>
    <section class="card tuto" id="tutoCard">
      <h2>${s.title}</h2>
      ${s.art()}
      <div class="t-body">${s.body()}</div>
    </section>
    <div class="t-dots">${TUTO.map((_, i) => `<button class="${i === tutoStep ? 'on' : ''}" data-act="tutoGo" data-arg="${i}" aria-label="Étape ${i + 1}"></button>`).join('')}</div>
    <div class="row2 t-nav">
      <button class="btn ghost" data-act="tutoGo" data-arg="${tutoStep - 1}" ${tutoStep ? '' : 'disabled'}>← Précédent</button>
      ${last ? '<button class="btn primary" data-act="tutoExit">C\'est parti !</button>'
        : `<button class="btn primary" data-act="tutoGo" data-arg="${tutoStep + 1}">Suivant →</button>`}
    </div>`;
}

Object.assign(actions, {
  tuto() { tutoStep = 0; S.screen = 'tuto'; try { localStorage.setItem('pm-tuto', '1'); } catch (e) {} render(); window.scrollTo(0, 0); },
  tutoGo(i) {
    i = +i;
    if (i < 0 || i >= TUTO.length) return;
    const dir = i > tutoStep ? 1 : -1;
    tutoStep = i; render();
    const c = document.getElementById('tutoCard');
    if (c) c.classList.add(dir > 0 ? 'in-right' : 'in-left');
  },
  tutoExit() { S.screen = 'setup'; render(); },
});

// Glisser à gauche / à droite pour changer d'étape
let tutoSwipe = null;
document.addEventListener('pointerdown', e => { tutoSwipe = S.screen === 'tuto' ? { x: e.clientX, y: e.clientY } : null; });
document.addEventListener('pointerup', e => {
  const d = tutoSwipe; tutoSwipe = null;
  if (!d || S.screen !== 'tuto') return;
  const dx = e.clientX - d.x, dy = e.clientY - d.y;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) actions.tutoGo(tutoStep + (dx < 0 ? 1 : -1));
});
