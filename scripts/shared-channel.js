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
  }

  get available() {
    return !!this.ref;
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
      updatedAt: Date.now(),
    });
  }
}

window.SharedChannel = SharedChannel;
