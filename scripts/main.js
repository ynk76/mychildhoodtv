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
 * maquette identiques à toutes les tailles d'écran. On utilise un cadrage
 * "cover" (on remplit tout l'écran, quitte à rogner un peu les bords) plutôt
 * que "contain" (qui laisserait des bandes noires sur les côtés).
 *
 * En mode cinéma desktop, on réutilise le même mécanisme en ciblant le
 * rectangle de la télé SEULE (.tv-set, sans le meuble — voir
 * offsetLeft/Top/Width/Height, insensibles au transform déjà en place).
 *
 * En mode cinéma MOBILE, la télé pivote de 90° pour un grand format
 * paysage (à regarder en tournant le téléphone) : on neutralise alors le
 * transform de .stage (une transform sur un ancêtre change le référentiel
 * de position:fixed — voir .tv-set--rotated dans styles/main.css) et on
 * positionne/pivote .tv-set nous-mêmes, en fixed par rapport au vrai
 * viewport.
 */
function initStageScale() {
  const stage = document.getElementById("room-stage");
  const room = document.getElementById("room");
  const tvSet = document.getElementById("tv-set");
  if (!stage || !room || !tvSet) return () => {};

  const SIZE = { desktop: [1280, 740], mobile: [390, 780] };
  const TV_ASPECT = 380 / 242; // proportions naturelles de .tv-set (desktop)
  const isMobile = () => window.innerWidth <= 760;

  // .tv-set est niché dans .tv-unit (lui-même enfant direct de #room) :
  // offsetLeft/Top seuls ne donnent que la position LOCALE à .tv-unit, pas
  // la position réelle dans #room. On remonte la chaîne offsetParent pour
  // cumuler le bon décalage, quel que soit le niveau d'imbrication.
  function offsetWithin(el, ancestor) {
    let x = 0,
      y = 0,
      node = el;
    while (node && node !== ancestor) {
      x += node.offsetLeft;
      y += node.offsetTop;
      node = node.offsetParent;
    }
    return { x, y };
  }

  function fitRotatedMobile() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 0.94;
    stage.style.transform = "none";
    tvSet.classList.add("tv-set--rotated");
    // .tv-set garde sa forme "paysage" naturelle (largeur bw > hauteur bh,
    // ratio TV_ASPECT) — c'est la ROTATION de 90° qui, une fois appliquée,
    // échange visuellement largeur et hauteur : la largeur AFFICHÉE devient
    // bh (doit tenir dans la largeur du viewport), la hauteur AFFICHÉE
    // devient bw (doit tenir dans sa hauteur).
    let bh = vw * margin;
    let bw = bh * TV_ASPECT;
    if (bw > vh * margin) {
      bw = vh * margin;
      bh = bw / TV_ASPECT;
    }
    tvSet.style.width = bw + "px";
    tvSet.style.height = bh + "px";
    tvSet.style.transform = "translate(-50%, -50%) rotate(90deg)";
  }

  function resetRotatedTvSet() {
    tvSet.classList.remove("tv-set--rotated");
    tvSet.style.width = "";
    tvSet.style.height = "";
    tvSet.style.transform = "";
  }

  function fit() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cinema = room.classList.contains("cinema-mode");

    if (cinema && isMobile()) {
      fitRotatedMobile();
      return;
    }
    resetRotatedTvSet();

    if (cinema) {
      // Ici la fidélité de la vidéo (pas de déformation) prime sur le
      // remplissage total : on garde un facteur UNIQUE (contain), avec une
      // marge un peu plus généreuse (0.90) pour éviter l'effet "trop
      // zoomé" — quitte à garder une fine bordure sur les côtés.
      const { x: tl, y: tt } = offsetWithin(tvSet, room);
      const tw = tvSet.offsetWidth;
      const th = tvSet.offsetHeight;
      const s = Math.min(vw / tw, vh / th) * 0.9;
      const tx = vw / 2 - s * (tl + tw / 2);
      const ty = vh / 2 - s * (tt + th / 2);
      stage.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      return;
    }

    // Hors mode cinéma, le décor n'est qu'un fond : on étire le canevas
    // avec deux facteurs INDÉPENDANTS (largeur/hauteur) pour remplir tout
    // l'écran exactement, sans bande noire ET sans rogner le moindre
    // élément (contrairement à un "cover" à facteur unique). La légère
    // déformation que ça introduit est imperceptible tant le ratio du
    // canevas (1280x740, 390x780) reste proche de celui de l'écran.
    const [w, h] = isMobile() ? SIZE.mobile : SIZE.desktop;
    const sx = vw / w;
    const sy = vh / h;
    stage.style.transform = `scale(${sx}, ${sy})`;
  }

  window.addEventListener("resize", fit);
  fit();
  return fit;
}

/**
 * Mode cinéma plein écran : double-clic sur l'écran, ou bouton dédié sur la
 * télécommande. Le reste du décor s'efface (voir
 * .room.cinema-mode > *:not(.tv-unit) dans styles/main.css) et le stage (ou,
 * sur mobile, .tv-set directement — voir fitStage()) zoome sur la télé.
 */
function initCinemaMode(fitStage) {
  const screen = document.getElementById("tv-screen");
  const room = document.getElementById("room");
  const exitBtn = document.getElementById("cinema-exit");
  if (!screen || !room) return null;

  // #cinema-exit est un sibling de #viewport (pas un descendant de #room),
  // pour que son position:fixed reste relatif à la vraie fenêtre — son
  // affichage se pilote donc directement ici, pas via un sélecteur CSS
  // ".cinema-mode ..." qui ne pourrait plus le cibler.
  function disable() {
    room.classList.remove("cinema-mode");
    if (exitBtn) exitBtn.hidden = true;
    fitStage();
  }

  function toggle() {
    const active = room.classList.toggle("cinema-mode");
    if (exitBtn) exitBtn.hidden = !active;
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
    settingsPanel: document.querySelector("#settings-modal .settings-panel"),
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
    minigameHint: document.getElementById("minigame-hint"),
  });

  remote.onFullscreenRequest = toggleCinema;

  const guideItem = document.getElementById("tv-guide-item");
  if (guideItem) guideItem.addEventListener("click", () => remote.openGuide());

  // Le chat noir (le chat du salon) donne aussi accès aux mini-jeux à la
  // demande, sans attendre une pub — en plus de son animation existante
  // (miaulement/réveil, voir scripts/decor.js).
  const catEl = document.getElementById("room-cat");
  if (catEl) catEl.addEventListener("click", () => remote.toggleMinigameMenu());
  const minigameClose = document.getElementById("minigame-close");
  if (minigameClose) minigameClose.addEventListener("click", () => remote.toggleMinigameMenu());

  if (typeof window.initChat === "function") window.initChat();

  window.initScreensaver({
    overlayEl: document.getElementById("screensaver-overlay"),
    canvasEl: document.getElementById("screensaver-canvas"),
    isPowerOn: () => remote.power,
    // 2 = YT.PlayerState.PAUSED (valeur stable de l'API YouTube) : évite
    // une dépendance à window.YT étant déjà chargé à cet instant précis.
    isPaused: () => remote.player.getPlayerState() === 2,
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initBoot(initApp);
});
