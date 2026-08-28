/**
 * ============================================================================
 *  LiveSchedule — applique au lecteur du salon la position "en direct".
 * ============================================================================
 *  Depuis la version précédente (calcul par créneaux de temps), le direct
 *  est maintenant piloté par l'admin lui-même via un vrai lecteur YouTube
 *  visible dans les réglages (scripts/admin-player.js), dont la position
 *  (chaîne + numéro de vidéo + seconde) est publiée dans Firebase. Ce
 *  fichier se contente de :
 *   - rejoindre une position reçue (au chargement de la page, ou à chaque
 *     mise à jour de l'admin), en calculant le temps écoulé depuis que
 *     l'admin l'a publiée pour "rattraper" le direct,
 *   - ne RIEN faire si c'est déjà la même vidéo à l'écran (pas de seekTo
 *     répété : c'est ce genre d'intervention qui relançait des publicités),
 *   - une fois chargée, la playlist YouTube avance ensuite toute seule
 *     nativement (aucune intervention needed en dehors des mises à jour de
 *     l'admin).
 *
 *  Sans admin ayant jamais rien publié (ou sans Firebase configuré), on se
 *  contente de démarrer la chaîne par défaut au tout début — elle tourne
 *  ensuite en boucle nativement via YouTube (comportement natif d'une
 *  playlist), mais sans garantie de synchronisation exacte entre appareils
 *  tant qu'aucun direct n'a été publié au moins une fois.
 * ============================================================================
 */

class LiveSchedule {
  constructor(player) {
    this.player = player;
    this.channel = null;
    this.index = null;
    this.paused = false;
  }

  /** Rejoint une position (venant de Firebase, ou d'un choix de chaîne local). */
  join(channel, index, currentTime, paused) {
    const sameChannel = this.channel && this.channel.playlistId === channel.playlistId;
    const sameVideo = sameChannel && this.index === index;
    this.channel = channel;
    this.index = index;
    this.paused = !!paused;

    if (!sameVideo) {
      this.player.loadPlaylistAt(channel, index, Math.max(0, currentTime || 0));
    }
    if (this.paused) this.player.pause();
    else this.player.play();
  }

  /** Sans admin/Firebase : démarre simplement la chaîne par défaut depuis le début. */
  startDefault(channel) {
    this.channel = channel;
    this.index = 0;
    this.paused = false;
    this.player.playChannel(channel);
  }
}

window.LiveSchedule = LiveSchedule;
