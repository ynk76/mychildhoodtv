/**
 * ============================================================================
 *  LiveSchedule — applique au lecteur du salon la position "en direct".
 * ============================================================================
 *  Le direct est piloté par l'admin lui-même via un vrai lecteur YouTube
 *  visible dans les réglages (scripts/admin-player.js), dont la position
 *  (chaîne + numéro de vidéo + seconde) est publiée dans Firebase. Ce
 *  fichier se contente de :
 *   - rejoindre une position reçue (au chargement de la page, ou à chaque
 *     mise à jour de l'admin), en calculant le temps écoulé depuis que
 *     l'admin l'a publiée pour "rattraper" le direct,
 *   - si c'est déjà la même vidéo à l'écran, vérifier qu'on n'a pas dérivé
 *     de plus de DRIFT_TOLERANCE_SECONDS par rapport à l'admin, et ne se
 *     resynchroniser (seekTo) que dans ce cas précis — jamais à chaque mise
 *     à jour, pour ne pas perturber une publicité en cours (une pub n'est
 *     pas comptée dans la playlist : voir _looksLikeAd ci-dessous),
 *   - une fois chargée, la playlist YouTube avance ensuite toute seule
 *     nativement.
 *
 *  Sans admin ayant jamais rien publié (ou sans Firebase configuré), on
 *  démarre la chaîne par défaut sur une vidéo aléatoire de la playlist
 *  (voir startDefault) plutôt que toujours au début.
 * ============================================================================
 */

const DRIFT_TOLERANCE_SECONDS = 2;

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
    } else if (!this.paused && !this._looksLikeAd(index)) {
      const actual = this.player.getCurrentTime();
      if (actual != null && Math.abs(actual - currentTime) > DRIFT_TOLERANCE_SECONDS) {
        this.player.seekTo(currentTime);
      }
    }
    if (this.paused) this.player.pause();
    else this.player.play();
  }

  /**
   * Best-effort : une publicité n'apparaît jamais dans la playlist elle-même,
   * donc si la vidéo réellement affichée ne correspond pas à celle attendue à
   * cet index, c'est probablement qu'une pub est en cours — dans ce cas on
   * n'intervient surtout pas (un seekTo pendant une pub la relance).
   */
  _looksLikeAd(index) {
    const ids = this.player.getPlaylistIds();
    if (!ids || index == null || !ids[index]) return false;
    const actual = this.player.getCurrentVideoId();
    return actual != null && actual !== ids[index];
  }

  /** Sans admin/Firebase : démarre la chaîne par défaut sur une vidéo aléatoire. */
  startDefault(channel) {
    this.channel = channel;
    this.index = null;
    this.paused = false;
    this.player.playChannelShuffled(channel);
  }
}

window.LiveSchedule = LiveSchedule;
