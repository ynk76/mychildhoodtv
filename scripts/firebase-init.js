/**
 * Initialise Firebase une seule fois et expose la base de données partagée,
 * utilisée à la fois par le tchat (scripts/chat.js) et par la
 * synchronisation de la chaîne en direct (scripts/shared-channel.js).
 * Retourne null si Firebase n'est pas configuré ou pas disponible : tout le
 * reste du site continue de fonctionner en mode local uniquement.
 */
window.getSharedDatabase = function getSharedDatabase() {
  const config = window.FIREBASE_CONFIG;
  if (!config || !config.apiKey || !config.databaseURL) return null;
  if (typeof firebase === "undefined") return null;
  try {
    if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(config);
    return firebase.database();
  } catch (e) {
    return null;
  }
};
