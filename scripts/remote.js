/**
 * Télécommande : power, volume, plein écran, guide des programmes (public),
 * et réglages protégés par mot de passe (choix de chaîne via un vrai
 * lecteur YouTube "studio", voir scripts/admin-player.js).
 *
 * NB sécurité : le mot de passe est vérifié côté navigateur, dans du code
 * public (comme tout site 100% statique sans serveur). N'importe qui peut le
 * lire dans le code source. C'est un simple verrou "on n'y touche pas sans
 * le vouloir", pas une vraie protection contre quelqu'un de déterminé.
 */

const SETTINGS_PASSWORD = "Foot2Rue";

// L'admin publie sa position toutes les ~4s (voir ADMIN_PUBLISH_INTERVAL_MS
// dans admin-player.js) tant que son lecteur studio tourne. Si la dernière
// publication reçue est plus vieille que ce seuil, personne ne pilote plus
// activement la diffusion (onglet fermé, navigateur éteint...) : on ignore
// cette position périmée (sinon on calculerait un rattrapage de plusieurs
// minutes) et chaque visiteur repart sur une vidéo aléatoire.
const ADMIN_STALE_THRESHOLD_MS = 12000;

/** Essaie d'extraire un ID de playlist YouTube utilisable depuis une URL ou un ID collé. */
function parsePlaylistInput(raw) {
  const value = raw.trim();
  try {
    const url = new URL(value);
    const list = url.searchParams.get("list");
    if (list) return list;
    const v = url.searchParams.get("v");
    if (v) return "RD" + v;
    if (url.hostname === "youtu.be") {
      const id = url.pathname.replace("/", "");
      if (id) return "RD" + id;
    }
  } catch (e) {
    // Ce n'est pas une URL valide : on continue avec la valeur brute.
  }
  if (/^(PL|UU|FL|RD|OL)/.test(value)) return value;
  if (/^[\w-]{11}$/.test(value)) return "RD" + value;
  return value;
}

/** Récupère le titre d'une vidéo YouTube via oEmbed (public, sans clé API). */
async function fetchVideoTitle(videoId) {
  if (!videoId) return "?";
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent("https://www.youtube.com/watch?v=" + videoId)}&format=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("oembed failed");
    const data = await res.json();
    return data.title || "Titre indisponible";
  } catch (e) {
    return "Titre indisponible";
  }
}

class RemoteControl {
  constructor(dom) {
    this.dom = dom;
    this.channels = Storage.getAllChannels();
    this.volume = Storage.getVolume();
    this.muted = Storage.getMuted();
    this.power = Storage.getPower();
    this.currentIndex = this._resolveInitialIndex();
    this.adminSelectedIndex = this.currentIndex;
    this.adminPlayer = null;
    this.sharedChannel = new SharedChannel();

    this.player = new TVPlayer({
      elementId: "player",
      initialVolume: this.volume,
      onReady: () => {
        this._applyVolumeState();
        // Sans diffusion partagée (Firebase), on démarre localement avec la
        // chaîne par défaut ; sinon on attend la position venant de
        // l'admin (voir onChange ci-dessous), qui arrive quasi aussitôt.
        if (!this.sharedChannel.available) this.liveSchedule.startDefault(this.currentChannel());
        if (!this.power) this.player.pause();
      },
    });
    this.liveSchedule = new LiveSchedule(this.player);

    this.minigameOverlay = new MinigameOverlay({ containerEl: dom.minigameMount });
    this.adDetector = new AdDetector({
      player: this.player,
      liveSchedule: this.liveSchedule,
      onAdSequenceStart: () => this._onAdSequenceStart(),
      onAdSequenceEnd: () => this._onAdSequenceEnd(),
    });
    this.adDetector.start();

    if (this.sharedChannel.available) {
      this.sharedChannel.onChange((shared) => this._applySharedChannel(shared));
      // Filet de sécurité : si l'admin n'a encore jamais rien publié, on ne
      // reste pas silencieux indéfiniment — on démarre avec la chaîne par
      // défaut en attendant.
      setTimeout(() => {
        if (!this.liveSchedule.channel) this.liveSchedule.startDefault(this.currentChannel());
      }, 3000);
    }

    this._bindButtons();
    this._bindSettings();
    this._bindGuide();
    this._renderVolume();
    this._updatePowerUI(false);

    if (this.power) {
      this._showBanner(this.currentChannel());
    }
  }

  /** Reçu de Firebase : l'admin a choisi/avancé/mis en pause la diffusion, pour tout le monde. */
  _applySharedChannel(shared) {
    const age = this.sharedChannel.serverNow() - shared.updatedAt;
    if (age > ADMIN_STALE_THRESHOLD_MS) {
      if (!this._noAdminMode) {
        this._noAdminMode = true;
        this.liveSchedule.startDefault(this.currentChannel());
        if (!this.power) this.player.pause();
      }
      this._renderLiveStatus();
      return;
    }
    this._noAdminMode = false;

    let idx = this.channels.findIndex((c) => c.playlistId === shared.playlistId);
    if (idx === -1) {
      this.channels = this.channels.concat([{ name: shared.name, playlistId: shared.playlistId, number: -1 }]);
      idx = this.channels.length - 1;
    }
    const isNewVideo = !(
      this.liveSchedule.channel &&
      this.liveSchedule.channel.playlistId === shared.playlistId &&
      this.liveSchedule.index === shared.index
    );
    this.currentIndex = idx;

    // On rattrape le temps écoulé depuis que l'admin a publié cette
    // position, pour rejoindre "en cours" comme une vraie chaîne de télé.
    const elapsed = Math.max(0, age / 1000);
    const currentTime = (shared.currentTime || 0) + (shared.paused ? 0 : elapsed);

    if (isNewVideo && this.power) {
      Audio2000.staticBurst(0.3);
      this.dom.staticOverlay.hidden = false;
      setTimeout(() => (this.dom.staticOverlay.hidden = true), 350);
    }

    this.liveSchedule.join(this.channels[idx], shared.index, currentTime, shared.paused);
    if (!this.power) this.player.pause();
    else this._showBanner(this.channels[idx]);

    this._renderLiveStatus();
    this._renderChannelList();
  }

  _resolveInitialIndex() {
    const last = Storage.getLastChannel();
    const idx = this.channels.findIndex((c) => c.number === last);
    return idx >= 0 ? idx : 0;
  }

  currentChannel() {
    return this.channels[this.currentIndex];
  }

  _bindButtons() {
    const d = this.dom;
    d.power.addEventListener("click", () => this.togglePower());
    d.volUp.addEventListener("click", () => this.changeVolume(10));
    d.volDown.addEventListener("click", () => this.changeVolume(-10));
    d.mute.addEventListener("click", () => this.toggleMute());
    d.fullscreen.addEventListener("click", () => {
      Audio2000.remoteClick();
      if (typeof this.onFullscreenRequest === "function") this.onFullscreenRequest();
    });

    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      switch (e.key) {
        case "ArrowRight":
          this.changeVolume(10);
          break;
        case "ArrowLeft":
          this.changeVolume(-10);
          break;
        case "m":
        case "M":
          this.toggleMute();
          break;
      }
    });
  }

  togglePower() {
    this.power = !this.power;
    Storage.setPower(this.power);
    Audio2000.remoteClick();
    this._updatePowerUI(true);
    if (this.power) {
      this.player.play();
      this._showBanner(this.currentChannel());
    } else {
      this.player.pause();
      this._onAdSequenceEnd();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Détection de pub + mini-jeux                                        */
  /* ---------------------------------------------------------------- */

  _onAdSequenceStart() {
    if (!this.power) return;
    this.dom.minigameOverlay.hidden = false;
    this.minigameOverlay.show();
  }

  _onAdSequenceEnd() {
    this.dom.minigameOverlay.hidden = true;
    this.minigameOverlay.hide();
  }

  _updatePowerUI(animate) {
    const { screen, powerOff } = this.dom;
    this.dom.power.setAttribute("aria-pressed", String(this.power));
    if (this.power) {
      screen.classList.remove("tv-screen--off");
      powerOff.classList.remove("power-off--playing");
      powerOff.hidden = true;
    } else {
      powerOff.hidden = false;
      if (animate) {
        powerOff.classList.remove("power-off--playing");
        // force reflow pour rejouer l'animation
        void powerOff.offsetWidth;
        powerOff.classList.add("power-off--playing");
      }
      screen.classList.add("tv-screen--off");
    }
  }

  _showBanner(channel) {
    const { bannerName, banner } = this.dom;
    bannerName.textContent = channel.name;
    banner.classList.add("channel-banner--visible");
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => {
      banner.classList.remove("channel-banner--visible");
    }, 2500);
  }

  changeVolume(delta) {
    this.volume = Math.max(0, Math.min(100, this.volume + delta));
    this.muted = false;
    Storage.setVolume(this.volume);
    Storage.setMuted(false);
    this._applyVolumeState();
    Audio2000.hoverBlip();
  }

  toggleMute() {
    this.muted = !this.muted;
    Storage.setMuted(this.muted);
    this._applyVolumeState();
    Audio2000.remoteClick();
  }

  _applyVolumeState() {
    this.player.setVolume(this.volume);
    if (this.muted) this.player.mute();
    else this.player.unmute();
    this._renderVolume();
  }

  _renderVolume() {
    this.dom.mute.setAttribute("aria-pressed", String(this.muted));
    this.dom.volumeBar.style.width = (this.muted ? 0 : this.volume) + "%";
    this.dom.volumeLabel.textContent = this.muted ? "MUET" : `VOL ${this.volume}`;
  }

  /* ---------------------------------------------------------------- */
  /* Réglages protégés par mot de passe                                 */
  /* ---------------------------------------------------------------- */

  _bindSettings() {
    const d = this.dom;

    d.settingsToggle.addEventListener("click", () => {
      Audio2000.hoverBlip();
      const opening = d.settingsModal.hidden;
      d.settingsModal.hidden = !d.settingsModal.hidden;
      if (opening) this._openSettings();
      else this._positionAdminPlayer();
    });
    d.settingsClose.addEventListener("click", () => {
      d.settingsModal.hidden = true;
      this._positionAdminPlayer();
    });
    window.addEventListener("resize", () => {
      if (!d.settingsModal.hidden && !d.settingsBody.hidden) this._positionAdminPlayer();
    });

    d.settingsAuthForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (d.settingsPassword.value === SETTINGS_PASSWORD) {
        Storage.setSettingsUnlocked(true);
        d.settingsAuthError.hidden = true;
        d.settingsPassword.value = "";
        this._showSettingsBody();
      } else {
        d.settingsAuthError.hidden = false;
        Audio2000.staticBurst(0.2);
      }
    });

    d.settingsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = d.settingsName.value.trim();
      const urlValue = d.settingsUrl.value.trim();
      if (!name || !urlValue) return;
      const playlistId = parsePlaylistInput(urlValue);
      Storage.addCustomChannel({ name, playlistId });
      this.channels = Storage.getAllChannels();
      d.settingsForm.reset();
      this._renderChannelList();
    });
  }

  _openSettings() {
    if (Storage.getSettingsUnlocked()) this._showSettingsBody();
    else this._showSettingsAuth();
  }

  _showSettingsAuth() {
    this.dom.settingsAuth.hidden = false;
    this.dom.settingsBody.hidden = true;
    this.dom.settingsAuthError.hidden = true;
    this._positionAdminPlayer();
  }

  _showSettingsBody() {
    this.dom.settingsAuth.hidden = true;
    this.dom.settingsBody.hidden = false;
    if (!this.adminPlayer) {
      this.adminPlayer = new AdminPlayer({ elementId: "admin-player", sharedChannel: this.sharedChannel });
      this.adminSelectedIndex = this.currentIndex;
      this.adminPlayer.load(this.currentChannel());
    }
    this._renderChannelList();
    this._renderLiveStatus();
    this._positionAdminPlayer();
  }

  /**
   * Le vrai lecteur studio (#admin-player) vit en dehors du panneau de
   * réglages (voir styles/main.css) pour ne jamais être mis en display:none
   * — ce qui interromprait sa lecture — quand on ferme les réglages. On le
   * superpose donc "à la main" par-dessus son emplacement réservé
   * (#admin-player-slot) tant que les réglages sont ouverts et déverrouillés,
   * et on le réduit à un coin de 2x2px sinon (toujours techniquement
   * "visible" pour le navigateur, juste imperceptible).
   */
  _positionAdminPlayer() {
    const el = this.dom.adminPlayerEl;
    const slot = this.dom.adminPlayerSlot;
    if (!el) return;
    const docked = !this.dom.settingsModal.hidden && !this.dom.settingsBody.hidden;
    if (docked && slot) {
      const r = slot.getBoundingClientRect();
      Object.assign(el.style, {
        top: r.top + "px",
        left: r.left + "px",
        width: r.width + "px",
        height: r.height + "px",
        bottom: "auto",
        right: "auto",
        opacity: "1",
        pointerEvents: "auto",
        border: "2px solid var(--wood-mid)",
      });
    } else {
      Object.assign(el.style, {
        top: "auto",
        left: "auto",
        bottom: "0",
        right: "0",
        width: "2px",
        height: "2px",
        opacity: "0.01",
        pointerEvents: "none",
        border: "none",
      });
    }
  }

  _renderLiveStatus() {
    if (!this.sharedChannel.available) {
      this.dom.liveStatus.textContent = "🔴 Chaîne par défaut (pas de synchro entre appareils, Firebase non configuré)";
    } else if (this._noAdminMode) {
      this.dom.liveStatus.textContent = "🎲 Personne ne pilote la diffusion : vidéo aléatoire";
    } else {
      this.dom.liveStatus.textContent = this.liveSchedule.paused ? "⏸ En pause" : "🔴 En direct";
    }
  }

  /** Choisir une chaîne dans les réglages charge le lecteur studio (admin), pas directement le salon. */
  selectChannel(index) {
    this.adminSelectedIndex = index;
    const channel = this.channels[index];
    Storage.setLastChannel(channel.number);
    if (this.adminPlayer) this.adminPlayer.load(channel);
    this._renderChannelList();
  }

  _renderChannelList() {
    const list = this.dom.settingsList;
    list.innerHTML = "";
    this.channels.forEach((channel, index) => {
      const li = document.createElement("li");
      li.className = "settings-item";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "settings-item__select";
      btn.textContent = channel.name;
      if (index === this.adminSelectedIndex) btn.classList.add("settings-item__select--current");
      btn.addEventListener("click", () => this.selectChannel(index));
      li.appendChild(btn);

      if (channel.isCustom) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "settings-item__delete";
        del.textContent = "Supprimer";
        del.addEventListener("click", () => {
          Storage.removeCustomChannel(channel.number);
          this.channels = Storage.getAllChannels();
          if (this.adminSelectedIndex >= this.channels.length) {
            this.adminSelectedIndex = 0;
            if (this.adminPlayer) this.adminPlayer.load(this.channels[0]);
          }
          this._renderChannelList();
        });
        li.appendChild(del);
      }

      list.appendChild(li);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Guide des programmes (public, lecture seule)                       */
  /* ---------------------------------------------------------------- */

  _bindGuide() {
    this.dom.guideClose.addEventListener("click", () => (this.dom.guideOverlay.hidden = true));
  }

  async openGuide() {
    Audio2000.hoverBlip();
    this.dom.guideOverlay.hidden = false;
    this.dom.guideNow.textContent = "Chargement...";
    this.dom.guideNext.textContent = "Chargement...";

    const ids = this.player.getPlaylistIds();
    const idx = this.player.getPlaylistIndex();
    const liveTitle = this.player.getVideoTitle();

    this.dom.guideNow.textContent = liveTitle || "?";
    if (ids && ids.length && idx != null && idx >= 0) {
      this.dom.guideNext.textContent = await fetchVideoTitle(ids[(idx + 1) % ids.length]);
    } else {
      this.dom.guideNext.textContent = "?";
    }
  }
}

window.RemoteControl = RemoteControl;
