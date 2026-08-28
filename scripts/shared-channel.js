/**
 * ============================================================================
 *  SharedChannel — la chaîne "en direct" est la même pour TOUT LE MONDE.
 * ============================================================================
 *  Sans backend, chaque appareil gardait sa propre chaîne en mémoire locale
 *  (localStorage) : deux visiteurs sur deux appareils différents pouvaient
 *  donc se retrouver chacun sur une chaîne différente, ce qui n'a rien de
 *  "en direct". SharedChannel stocke la chaîne active dans la même base
 *  Firebase que le tchat (aucun nouveau service à créer) :
 *    - l'admin (mot de passe requis, voir remote.js) est seul à pouvoir
 *      changer la chaîne pour tout le monde,
 *    - tous les visiteurs (y compris l'admin) reçoivent ce changement en
 *      temps réel.
 *
 *  On y stocke aussi la LISTE EXACTE des vidéos de la playlist au moment de
 *  la sélection (pas seulement son ID). Sans ça, deux appareils qui
 *  interrogent YouTube séparément peuvent obtenir une liste légèrement
 *  différente (région, playlist encore en cours de chargement...), et donc
 *  calculer un index différent pour la même minute — exactement la cause du
 *  "chacun voit une vidéo différente". En partageant la liste elle-même,
 *  tout le monde fait le même calcul sur les mêmes données.
 *
 *  Sans Firebase configuré : SharedChannel.available vaut false et le site
 *  revient au fonctionnement local précédent (chaîne par défaut identique
 *  pour tous de toute façon, car codée en dur dans config.js).
 * ============================================================================
 */

class SharedChannel {
  constructor() {
    this.db = window.getSharedDatabase ? window.getSharedDatabase() : null;
    this.ref = this.db ? this.db.ref("liveChannel") : null;
  }

  get available() {
    return !!this.ref;
  }

  /** Appelé à la connexion, puis à chaque fois que l'admin change de chaîne. */
  onChange(callback) {
    if (!this.ref) return;
    this.ref.on(
      "value",
      (snapshot) => {
        const val = snapshot.val();
        if (val && val.playlistId && Array.isArray(val.videoIds) && val.videoIds.length) {
          callback(val);
        }
      },
      () => {
        /* règles Firebase pas encore configurées pour "liveChannel" : silencieux */
      }
    );
  }

  /** Admin uniquement : diffuse une nouvelle chaîne (+ sa liste de vidéos) à tout le monde. */
  publish(channel, videoIds) {
    if (!this.ref) return;
    this.ref.set({
      name: channel.name,
      playlistId: channel.playlistId,
      videoIds,
      updatedAt: Date.now(),
    });
  }
}

window.SharedChannel = SharedChannel;
