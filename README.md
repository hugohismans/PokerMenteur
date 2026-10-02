# Poker Menteur 🎲

Jeu de poker menteur aux dés (9, 10, Valet, Dame, Roi, As) pour mobile, sous forme de page web installable (PWA).

- **Mélange le chapeau** ou **lance les dés de la table** d'une touche.
- Pour chaque dé : le garder **caché sous le gobelet**, le poser **sur la table** (visible par tous) ou le **relancer**.
- Annonce une combinaison toujours plus forte. Le joueur suivant dit **« Menteur ! »** ou **« Je te crois »**.
- On joue à plusieurs en se passant le téléphone, et/ou contre l'ordinateur.

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

Fichiers : `index.html`, `style.css`, `game.js` (règles + ordinateur), `app.js` (interface, secousse, sons), `oral.js` (mode à voix haute avec le chapeau), `sw.js` (hors-ligne).
Après une modification, incrémenter `VERSION` dans `sw.js`.
