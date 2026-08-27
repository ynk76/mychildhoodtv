/**
 * Télécommande : power, volume, plein écran, et choix de la chaîne
 * (la chaîne par défaut ou une playlist YouTube personnalisée) via le
 * panneau Réglages.
 */

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
        if (this.power) this.player.playChannel(this.currentChannel());
      },
    });

    this._bindButtons();
    this._bindSettings();
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
      this.player.playChannel(this.currentChannel());
      this._showBanner(this.currentChannel());
    } else {
      this.player.pause();
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
      if (this.power) this.player.playChannel(channel);
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

  _bindSettings() {
    const d = this.dom;
    d.settingsToggle.addEventListener("click", () => {
      Audio2000.hoverBlip();
      d.settingsModal.hidden = !d.settingsModal.hidden;
      if (!d.settingsModal.hidden) this._renderChannelList();
    });
    d.settingsClose.addEventListener("click", () => (d.settingsModal.hidden = true));

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

  _renderChannelList() {
    const list = this.dom.settingsList;
    list.innerHTML = "";
    this.channels.forEach((channel, index) => {
      const li = document.createElement("li");
      li.className = "settings-item";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "settings-item__select";
      btn.dataset.blip = "true";
      btn.textContent = channel.name;
      if (index === this.currentIndex) btn.classList.add("settings-item__select--current");
      btn.addEventListener("click", () => {
        this.selectChannel(index);
        this._renderChannelList();
      });
      btn.addEventListener("mouseenter", () => Audio2000.hoverBlip());
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
            if (this.power) this.player.playChannel(this.currentChannel());
          }
          this._renderChannelList();
        });
        li.appendChild(del);
      }

      list.appendChild(li);
    });
  }
}

window.RemoteControl = RemoteControl;
