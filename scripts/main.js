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
  btn.title = "Ambiance sonore";
  btn.textContent = muted ? "AMB ✕" : "AMB ♪";
  btn.addEventListener("click", () => {
    muted = !muted;
    Storage.setAmbientMuted(muted);
    Audio2000.setAmbientMuted(muted);
    btn.setAttribute("aria-pressed", String(muted));
    btn.textContent = muted ? "AMB ✕" : "AMB ♪";
  });
}

/**
 * Le décor est un canevas de taille fixe (1280x740 desktop, 390x780 mobile,
 * voir styles/main.css) mis à l'échelle EN BLOC par transform sur .stage,
 * plutôt que "fluidifié" en % — c'est ce qui garde les proportions de la
 * maquette identiques à toutes les tailles d'écran. En mode cinéma, on
 * réutilise le même mécanisme en ciblant le rectangle de la télé (lu via
 * offsetLeft/Top/Width/Height, insensibles au transform déjà en place) au
 * lieu du salon entier.
 */
function initStageScale() {
  const stage = document.getElementById("room-stage");
  const room = document.getElementById("room");
  const tvUnit = document.querySelector(".tv-unit");
  if (!stage || !room) return () => {};

  const SIZE = { desktop: [1280, 740], mobile: [390, 780] };
  const isMobile = () => window.innerWidth <= 760;

  function fit() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let s, tx, ty;

    if (room.classList.contains("cinema-mode") && tvUnit) {
      const tl = tvUnit.offsetLeft;
      const tt = tvUnit.offsetTop;
      const tw = tvUnit.offsetWidth;
      const th = tvUnit.offsetHeight;
      s = Math.min(vw / tw, vh / th) * 0.94;
      tx = vw / 2 - s * (tl + tw / 2);
      ty = vh / 2 - s * (tt + th / 2);
    } else {
      const [w, h] = isMobile() ? SIZE.mobile : SIZE.desktop;
      s = Math.min(vw / w, vh / h);
      tx = (vw - s * w) / 2;
      ty = (vh - s * h) / 2;
    }

    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
  }

  window.addEventListener("resize", fit);
  fit();
  return fit;
}

/**
 * Mode cinéma plein écran : double-clic sur l'écran, ou bouton dédié sur la
 * télécommande. Le reste du décor s'efface (voir
 * .room.cinema-mode > *:not(.tv-unit) dans styles/main.css) et le stage
 * zoome sur la télé via fitStage() ci-dessus.
 */
function initCinemaMode(fitStage) {
  const screen = document.getElementById("tv-screen");
  const room = document.getElementById("room");
  const exitBtn = document.getElementById("cinema-exit");
  if (!screen || !room) return null;

  function disable() {
    room.classList.remove("cinema-mode");
    fitStage();
  }

  function toggle() {
    room.classList.toggle("cinema-mode");
    fitStage();
  }

  screen.addEventListener("dblclick", toggle);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && room.classList.contains("cinema-mode")) disable();
  });
  if (exitBtn) exitBtn.addEventListener("click", disable);

  return toggle;
}

function initApp() {
  window.initDecor();
  initAmbientMuteButton();
  const fitStage = initStageScale();
  const toggleCinema = initCinemaMode(fitStage);

  const remote = new RemoteControl({
    power: document.getElementById("btn-power"),
    volUp: document.getElementById("btn-vol-up"),
    volDown: document.getElementById("btn-vol-down"),
    mute: document.getElementById("btn-mute"),
    fullscreen: document.getElementById("btn-fullscreen"),
    volumeLeds: Array.from(document.querySelectorAll(".remote__led[data-vol]")),
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
    adminPlayerEl: document.getElementById("admin-player-host"),
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
