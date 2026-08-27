/**
 * Point d'entrée : séquence de démarrage rétro, puis initialisation de
 * tous les modules (décor, télécommande, écran de veille, plein écran).
 */

function initBoot(onDone) {
  const boot = document.getElementById("boot-screen");
  if (!boot) return onDone();

  let done = false;
  function finish() {
    if (done) return;
    done = true;
    Audio2000.unlock();
    Audio2000.startAmbient();
    boot.classList.add("boot-screen--hidden");
    setTimeout(() => {
      boot.hidden = true;
      onDone();
    }, 600);
  }

  boot.addEventListener("click", finish);
  boot.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") finish();
  });
  setTimeout(finish, 3200);
}

function initAmbientMuteButton() {
  const btn = document.getElementById("ambient-mute");
  if (!btn) return;
  let muted = Storage.getAmbientMuted();
  Audio2000.setAmbientMuted(muted);
  btn.setAttribute("aria-pressed", String(muted));
  btn.textContent = muted ? "🔇 Ambiance" : "🔊 Ambiance";
  btn.addEventListener("click", () => {
    muted = !muted;
    Storage.setAmbientMuted(muted);
    Audio2000.setAmbientMuted(muted);
    btn.setAttribute("aria-pressed", String(muted));
    btn.textContent = muted ? "🔇 Ambiance" : "🔊 Ambiance";
  });
}

function initCinemaMode() {
  const screen = document.getElementById("tv-screen");
  const room = document.getElementById("room");
  if (!screen || !room) return;
  function toggle() {
    const enteringCinema = room.classList.toggle("cinema-mode");
    if (enteringCinema) screen.closest("[data-depth]").style.transform = "";
  }
  screen.addEventListener("dblclick", toggle);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && room.classList.contains("cinema-mode")) {
      room.classList.remove("cinema-mode");
    }
  });
}

function initApp() {
  window.initDecor();
  initAmbientMuteButton();
  initCinemaMode();

  const remote = new RemoteControl({
    power: document.getElementById("btn-power"),
    chUp: document.getElementById("btn-ch-up"),
    chDown: document.getElementById("btn-ch-down"),
    volUp: document.getElementById("btn-vol-up"),
    volDown: document.getElementById("btn-vol-down"),
    mute: document.getElementById("btn-mute"),
    guide: document.getElementById("btn-guide"),
    volumeBar: document.getElementById("volume-bar"),
    volumeLabel: document.getElementById("volume-label"),
    screen: document.getElementById("tv-screen"),
    powerOff: document.getElementById("power-off-overlay"),
    staticOverlay: document.getElementById("static-overlay"),
    banner: document.getElementById("channel-banner"),
    bannerNumber: document.getElementById("channel-banner-number"),
    bannerName: document.getElementById("channel-banner-name"),
    epgOverlay: document.getElementById("epg-overlay"),
    epgList: document.getElementById("epg-list"),
    epgClose: document.getElementById("epg-close"),
    settingsToggle: document.getElementById("settings-toggle"),
    settingsModal: document.getElementById("settings-modal"),
    settingsClose: document.getElementById("settings-close"),
    settingsForm: document.getElementById("settings-form"),
    settingsName: document.getElementById("settings-name"),
    settingsUrl: document.getElementById("settings-url"),
    settingsList: document.getElementById("settings-list"),
  });

  window.initScreensaver({
    overlayEl: document.getElementById("screensaver-overlay"),
    canvasEl: document.getElementById("screensaver-canvas"),
    isPowerOn: () => remote.power,
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initBoot(initApp);
});
