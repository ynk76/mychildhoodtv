/**
 * ============================================================================
 *  SharedChannel — la position "en direct" est la même pour TOUT LE MONDE.
 * ============================================================================
 *  Le lecteur "studio" visible dans les réglages admin (mot de passe requis,
 *  voir scripts/admin-player.js) est la source de vérité : tout ce que
 *  l'admin y fait (choisir une vidéo, avancer, mettre en pause) est publié
 *  ici, dans la même base Firebase que le tchat (aucun nouveau service à
 *  créer). Tous les visiteurs (y compris l'admin) reçoivent cette position
 *  en temps réel et la reproduisent sur la télé du salon.
 *
 *  On publie {playlistId, index, currentTime, paused, updatedAt}. Chaque
 *  visiteur calcule le temps écoulé depuis "updatedAt" pour rattraper le
 *  direct même s'il arrive après coup — exactement comme rejoindre une
 *  vraie chaîne de télé en cours de diffusion.
 *
 *  "updatedAt" est une estampille SERVEUR Firebase (ServerValue.TIMESTAMP),
 *  pas l'horloge locale de l'admin : deux appareils n'ont presque jamais la
 *  même heure système (souvent plusieurs minutes d'écart), donc comparer
 *  l'heure locale d'un visiteur à l'heure locale de l'admin aurait rendu le
 *  calcul de rattrapage complètement faux. En passant par l'heure serveur
 *  (et en compensant le décalage d'horloge de CET appareil via
 *  `.info/serverTimeOffset`, voir serverNow()), tout le monde raisonne sur
 *  la même horloge de référence.
 *
 *  Sans Firebase configuré : SharedChannel.available vaut false et le site
 *  revient au fonctionnement local (chaîne par défaut identique pour tous
 *  de toute façon, car codée en dur dans config.js, mais sans garantie de
 *  synchronisation fine entre appareils).
 * ============================================================================
 */

class SharedChannel {
  constructor() {
    this.db = window.getSharedDatabase ? window.getSharedDatabase() : null;
    this.ref = this.db ? this.db.ref("liveChannel") : null;
    this._serverTimeOffset = 0;
    if (this.db) {
      try {
        this.db.ref(".info/serverTimeOffset").on("value", (snapshot) => {
          this._serverTimeOffset = snapshot.val() || 0;
        });
      } catch (e) {
        /* silencieux */
      }
    }
  }

  get available() {
    return !!this.ref;
  }

  /** Heure serveur estimée : compense le décalage d'horloge de cet appareil. */
  serverNow() {
    return Date.now() + this._serverTimeOffset;
  }

  /** Appelé à la connexion, puis à chaque mise à jour de l'admin. */
  onChange(callback) {
    if (!this.ref) return;
    this.ref.on(
      "value",
      (snapshot) => {
        const val = snapshot.val();
        if (val && val.playlistId && typeof val.index === "number" && typeof val.updatedAt === "number") {
          callback(val);
        }
      },
      () => {
        /* règles Firebase pas encore configurées pour "liveChannel" : silencieux */
      }
    );
  }

  /** Admin uniquement (via le lecteur studio) : publie la position actuelle pour tout le monde. */
  publishPosition(channel, index, currentTime, paused) {
    if (!this.ref) return;
    this.ref.set({
      name: channel.name,
      playlistId: channel.playlistId,
      index,
      currentTime,
      paused: !!paused,
      updatedAt: firebase.database.ServerValue.TIMESTAMP,
    });
  }
}

window.SharedChannel = SharedChannel;
