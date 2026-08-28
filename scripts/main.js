/**
 * Point d'entrée : séquence de démarrage rétro, puis initialisation de
 * tous les modules (décor, télécommande, écran de veille, plein écran, tchat).
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

/** Mode cinéma plein écran : double-clic sur l'écran, ou bouton dédié sur la télécommande. */
function initCinemaMode() {
  const screen = document.getElementById("tv-screen");
  const room = document.getElementById("room");
  if (!screen || !room) return null;

  function toggle() {
    room.classList.toggle("cinema-mode");
  }

  screen.addEventListener("dblclick", toggle);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && room.classList.contains("cinema-mode")) {
      room.classList.remove("cinema-mode");
    }
  });

  return toggle;
}

function initApp() {
  window.initDecor();
  initAmbientMuteButton();
  const toggleCinema = initCinemaMode();

  const remote = new RemoteControl({
    power: document.getElementById("btn-power"),
    volUp: document.getElementById("btn-vol-up"),
    volDown: document.getElementById("btn-vol-down"),
    mute: document.getElementById("btn-mute"),
    fullscreen: document.getElementById("btn-fullscreen"),
    volumeBar: document.getElementById("volume-bar"),
    volumeLabel: document.getElementById("volume-label"),
    screen: document.getElementById("tv-screen"),
    powerOff: document.getElementById("power-off-overlay"),
    staticOverlay: document.getElementById("static-overlay"),
    banner: document.getElementById("channel-banner"),
    bannerName: document.getElementById("channel-banner-name"),
    settingsToggle: document.getElementById("settings-toggle"),
    settingsModal: document.getElementById("settings-modal"),
    settingsClose: document.getElementById("settings-close"),
    settingsAuth: document.getElementById("settings-auth"),
    settingsAuthForm: document.getElementById("settings-auth-form"),
    settingsPassword: document.getElementById("settings-password"),
    settingsAuthError: document.getElementById("settings-auth-error"),
    settingsBody: document.getElementById("settings-body"),
    adminPlayerEl: document.getElementById("admin-player"),
    adminPlayerSlot: document.getElementById("admin-player-slot"),
    settingsForm: document.getElementById("settings-form"),
    settingsName: document.getElementById("settings-name"),
    settingsUrl: document.getElementById("settings-url"),
    settingsList: document.getElementById("settings-list"),
    liveStatus: document.getElementById("settings-live-status"),
    guideOverlay: document.getElementById("guide-overlay"),
    guideNow: document.getElementById("guide-now"),
    guideNext: document.getElementById("guide-next"),
    guideClose: document.getElementById("guide-close"),
    minigameOverlay: document.getElementById("minigame-overlay"),
    minigameMount: document.getElementById("minigame-mount"),
  });

  remote.onFullscreenRequest = toggleCinema;

  const guideItem = document.getElementById("tv-guide-item");
  if (guideItem) guideItem.addEventListener("click", () => remote.openGuide());

  if (typeof window.initChat === "function") window.initChat();

  window.initScreensaver({
    overlayEl: document.getElementById("screensaver-overlay"),
    canvasEl: document.getElementById("screensaver-canvas"),
    isPowerOn: () => remote.power,
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initBoot(initApp);
});
