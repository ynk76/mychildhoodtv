/**
 * Télécommande : power, volume, plein écran, guide des programmes (public),
 * et réglages protégés par mot de passe (choix de chaîne + pilotage de la
 * diffusion en direct).
 *
 * NB sécurité : le mot de passe est vérifié côté navigateur, dans du code
 * public (comme tout site 100% statique sans serveur). N'importe qui peut le
 * lire dans le code source. C'est un simple verrou "on n'y touche pas sans
 * le vouloir", pas une vraie protection contre quelqu'un de déterminé.
 */

const SETTINGS_PASSWORD = "Foot2Rue";

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

    this.player = new TVPlayer({
      elementId: "player",
      initialVolume: this.volume,
      onReady: () => {
        this._applyVolumeState();
        // on démarre toujours la diffusion en arrière-plan (pour être déjà
        // synchronisé dès l'allumage), mais elle ne joue/affiche rien tant
        // que la télé est éteinte (voir LiveSchedule.active)
        this.liveSchedule.start(this.currentChannel());
        if (!this.power) this.player.pause();
      },
    });
    this.liveSchedule = new LiveSchedule(this.player);
    this.liveSchedule.active = this.power;

    this._bindButtons();
    this._bindSettings();
    this._bindGuide();
    this._renderVolume();
    this._updatePowerUI(false);

    if (this.power) {
      this._showBanner(this.currentChannel());
    }
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
      this.liveSchedule.resume();
      this._showBanner(this.currentChannel());
    } else {
      this.liveSchedule.suspend();
    }
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

  selectChannel(index) {
    if (index === this.currentIndex) return;
    this.currentIndex = index;
    const channel = this.currentChannel();
    Storage.setLastChannel(channel.number);
    Audio2000.remoteClick();
    const staticEl = this.dom.staticOverlay;
    staticEl.hidden = false;
    Audio2000.staticBurst(0.4);
    setTimeout(() => {
      staticEl.hidden = true;
      this.liveSchedule.start(channel);
      this._showBanner(channel);
    }, 400);
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
      d.settingsModal.hidden = !d.settingsModal.hidden;
      if (!d.settingsModal.hidden) this._openSettings();
    });
    d.settingsClose.addEventListener("click", () => (d.settingsModal.hidden = true));

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

    d.adminPause.addEventListener("click", () => {
      Audio2000.remoteClick();
      this.liveSchedule.pauseLocal();
      this._renderLiveStatus();
    });
    d.adminNext.addEventListener("click", () => {
      Audio2000.remoteClick();
      this.liveSchedule.skipNext();
      this._renderLiveStatus();
    });
    d.adminLive.addEventListener("click", () => {
      Audio2000.remoteClick();
      this.liveSchedule.resumeLive();
      this._renderLiveStatus();
    });
    d.adminSkipAd.addEventListener("click", () => {
      Audio2000.remoteClick();
      this.liveSchedule.reloadCurrent();
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
  }

  _showSettingsBody() {
    this.dom.settingsAuth.hidden = true;
    this.dom.settingsBody.hidden = false;
    this._renderChannelList();
    this._renderLiveStatus();
  }

  _renderLiveStatus() {
    this.dom.liveStatus.textContent = this.liveSchedule.live ? "🔴 En direct" : "⏸ En pause (local)";
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
      if (index === this.currentIndex) btn.classList.add("settings-item__select--current");
      btn.addEventListener("click", () => {
        this.selectChannel(index);
        this._renderChannelList();
        this._renderLiveStatus();
      });
      li.appendChild(btn);

      if (channel.isCustom) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "settings-item__delete";
        del.textContent = "Supprimer";
        del.addEventListener("click", () => {
          Storage.removeCustomChannel(channel.number);
          this.channels = Storage.getAllChannels();
          if (this.currentIndex >= this.channels.length) {
            this.currentIndex = 0;
            Storage.setLastChannel(this.currentChannel().number);
            if (this.power) this.liveSchedule.start(this.currentChannel());
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
    const { nowId, nextId } = this.liveSchedule.getNowAndNextIds();
    const [nowTitle, nextTitle] = await Promise.all([fetchVideoTitle(nowId), fetchVideoTitle(nextId)]);
    this.dom.guideNow.textContent = nowTitle;
    this.dom.guideNext.textContent = nextTitle;
  }
}

window.RemoteControl = RemoteControl;
