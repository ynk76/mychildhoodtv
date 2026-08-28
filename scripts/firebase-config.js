/**
 * ============================================================================
 *  Configuration Firebase pour le tchat en direct
 * ============================================================================
 *  Le tchat a besoin d'un endroit partagé où stocker les messages : c'est le
 *  rôle de Firebase Realtime Database (gratuit). Sans cette configuration,
 *  le tchat affiche "non configuré" mais le reste du site fonctionne
 *  normalement.
 *
 *  Comment obtenir ces valeurs (5 minutes, gratuit, sans carte bancaire) :
 *   1. Va sur https://console.firebase.google.com et crée un projet.
 *   2. Dans le projet, va dans "Créer une application" > icône "</>" (web).
 *      Donne-lui un nom, pas besoin de configurer l'hébergement Firebase.
 *   3. Copie l'objet `firebaseConfig` affiché et colle ses valeurs ci-dessous.
 *   4. Dans le menu de gauche, va dans "Realtime Database" > "Créer une
 *      base de données" (choisis une région proche, par ex. europe-west1).
 *   5. Démarre en "mode test" (règles ouvertes 30 jours), ou colle ces
 *      règles pour un accès public en lecture/écriture (pas d'authentification
 *      dans ce projet) :
 *        {
 *          "rules": {
 *            "messages": { ".read": true, ".write": true }
 *          }
 *        }
 *      (Ces règles sont volontairement simples pour un petit projet perso :
 *      n'importe qui peut écrire dans le tchat, comme un vrai tchat public.)
 *  ============================================================================
 */

window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};
