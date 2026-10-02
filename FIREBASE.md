# Configurer le jeu en ligne (Firebase)

Environ 5 minutes, à faire une seule fois. Tout est gratuit (offre « Spark »).

## 1. Créer le projet
1. Va sur https://console.firebase.google.com et clique **Créer un projet**.
2. Nom : `poker-menteur` (ou ce que tu veux). Google Analytics : pas nécessaire.

## 2. Ajouter l'application web
1. Sur la page du projet, clique l'icône **`</>` (Web)**.
2. Surnom : `Poker Menteur`. Ne coche pas « Firebase Hosting ».
3. Firebase affiche un bloc `const firebaseConfig = { … }`. **Copie-le** : c'est ce qu'il faut me donner
   (ou coller toi-même dans `firebase-config.js`, à la place de `null`).

## 3. Activer la connexion anonyme
1. Menu **Build → Authentication → Commencer**.
2. Onglet **Sign-in method** → **Anonyme** → Activer → Enregistrer.
3. Onglet **Settings → Domaines autorisés** → **Ajouter un domaine** : `hugohismans.github.io`.

## 4. Créer la base de données
1. Menu **Build → Realtime Database → Créer une base de données**.
2. Emplacement : **Belgique (europe-west1)**.
3. Mode : **verrouillé** (on remplace les règles juste après).
4. Onglet **Règles** : colle le contenu du fichier `database.rules.json` du projet, puis **Publier**.

## Mise à jour des règles
Quand le fichier `database.rules.json` change, recolle-le dans **Realtime Database → Règles** puis **Publier**.

## 5. Vérifier la configuration
La configuration copiée doit contenir une ligne `databaseURL` (qui apparaît après l'étape 4 ;
si elle manque, recopie la configuration depuis **Paramètres du projet → Vos applications**).

C'est tout : une fois `firebase-config.js` rempli et publié, le bouton **🌐 Jouer en ligne** fonctionne.
