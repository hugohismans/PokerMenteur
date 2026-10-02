# Poker Menteur 🎲

Jeu de poker menteur aux dés (9, 10, Valet, Dame, Roi, As) pour mobile, sous forme de page web installable (PWA).

- **Mélange le chapeau** ou **lance les dés de la table** d'une touche.
- Pour chaque dé : le garder **caché dans le chapeau** ou le poser **sur la table** (visible par tous) ; un seul lancer par tour : mélanger le chapeau (fermé) ou lancer la table.
- Annonce une combinaison toujours plus forte. Le joueur suivant dit **« Menteur ! »** ou **« Je te crois »**.
- On joue à plusieurs en se passant le téléphone, et/ou contre l'ordinateur.

## Jouer en ligne

Bouton **🌐 Jouer en ligne** : pseudo, salons publics ou privés (avec une clé), le maître du salon lance la partie,
annonces dans l'appli, chat, temps limité par tour (réglable), spectateurs (parties publiques en cours, ou avec la clé). Utilise Firebase (Realtime Database + connexion anonyme) : voir **FIREBASE.md**.
Pour tester en local avec l'émulateur Firebase : ouvrir le jeu avec `?emu=1`.

## Jouer sur le téléphone

1. Activer GitHub Pages : *Settings → Pages → Source : Deploy from a branch → `main` / `(root)`*.
2. Chaque push sur `main` publie le jeu sur `https://hugohismans.github.io/PokerMenteur/`.
3. Ouvrir ce lien sur le téléphone, puis :
   - **Android (Chrome)** : menu ⋮ → *Ajouter à l'écran d'accueil* / *Installer l'application*.
   - **iPhone (Safari)** : bouton Partager → *Sur l'écran d'accueil*.

Le jeu fonctionne ensuite hors-ligne.

## En local

```sh
npx http-server -p 8080
```

Fichiers : `index.html`, `style.css`, `game.js` (règles + ordinateur), `app.js` (interface, secousse, sons), `oral.js` (mode à voix haute avec le chapeau), `online.js` + `firebase-config.js` + `database.rules.json` (jeu en ligne), `sw.js` (hors-ligne).
Après une modification, incrémenter `VERSION` dans `sw.js`.
