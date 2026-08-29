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
 * En mode cinéma (desktop ET mobile), on réutilise le même mécanisme en
 * ciblant le rectangle de la télé SEULE (.tv-set, sans le meuble — voir
 * offsetLeft/Top/Width/Height, insensibles au transform déjà en place).
 *
 * Pas de pivot CSS manuel pour le mobile : une version précédente pivotait
 * .tv-set de 90° en supposant que window.innerWidth/innerHeight restaient
 * figés sur l'orientation "portrait" une fois le téléphone tourné à
 * l'horizontale. En réalité, les navigateurs mobiles rafraîchissent bien
 * ces valeurs (et déclenchent un vrai "resize") dès que l'utilisateur
 * tourne physiquement son appareil — le pivot CSS s'ajoutait alors à la
 * rotation déjà faite par l'OS/le navigateur, doublant l'effet (écran
 * réduit à une bande, boutons mal placés). En laissant simplement le
 * "resize" naturel redéclencher ce fit() (comme n'importe quel site vidéo
 * responsive), la télé se recadre correctement dans le nouveau viewport
 * réel, quelle que soit son orientation.
 */
function initStageScale() {
  const stage = document.getElementById("room-stage");
  const room = document.getElementById("room");
  const tvSet = document.getElementById("tv-set");
  if (!stage || !room || !tvSet) return () => {};

  const SIZE = { desktop: [1280, 740], mobile: [390, 780] };
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

  function fit() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cinema = room.classList.contains("cinema-mode");

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
  const fullscreenBtn = document.getElementById("cinema-fullscreen");
  if (!screen || !room) return null;

  // Si le plein écran natif (bouton #cinema-fullscreen) est actif, il faut
  // aussi le quitter explicitement en sortant du mode cinéma : sinon la
  // page reste "coincée" sous l'overlay plein écran du navigateur (qui ne
  // montre QUE l'élément fullscreen, tout le reste devient inatteignable)
  // même une fois la classe cinema-mode retirée côté CSS.
  function exitNativeFullscreenIfAny() {
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (document.fullscreenElement && typeof exit === "function") {
      try {
        const result = exit.call(document);
        if (result && typeof result.catch === "function") result.catch(() => {});
      } catch (err) {
        /* silencieux */
      }
    }
  }

  // #cinema-exit est un sibling de #viewport (pas un descendant de #room),
  // pour que son position:fixed reste relatif à la vraie fenêtre — son
  // affichage se pilote donc directement ici, pas via un sélecteur CSS
  // ".cinema-mode ..." qui ne pourrait plus le cibler.
  function disable() {
    room.classList.remove("cinema-mode");
    if (exitBtn) exitBtn.hidden = true;
    if (fullscreenBtn) fullscreenBtn.hidden = true;
    exitNativeFullscreenIfAny();
    fitStage();
  }

  function toggle() {
    const active = room.classList.toggle("cinema-mode");
    if (exitBtn) exitBtn.hidden = !active;
    if (fullscreenBtn) fullscreenBtn.hidden = !active;
    if (!active) exitNativeFullscreenIfAny();
    fitStage();
  }

  screen.addEventListener("dblclick", toggle);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && room.classList.contains("cinema-mode")) disable();
  });
  if (exitBtn) exitBtn.addEventListener("click", disable);

  // Plein écran NATIF de la vidéo (Fullscreen API du navigateur), utile
  // surtout sur mobile où le mode cinéma n'est qu'une mise à l'échelle/
  // rotation CSS, pas un vrai plein écran système.
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", () => {
      // On demande le plein écran sur #tv-screen (notre propre élément),
      // pas directement sur l'iframe YouTube (cross-origin) : certains
      // navigateurs mobiles refusent silencieusement requestFullscreen()
      // sur un iframe cross-origin même avec allowfullscreen, alors qu'ils
      // l'acceptent sur un élément normal de la page (qui contient
      // l'iframe, donc la vidéo apparaît quand même en grand).
      const iframe = screen.querySelector("iframe");
      const targets = [screen, iframe].filter(Boolean);
      for (const el of targets) {
        const request = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitEnterFullscreen || el.msRequestFullscreen;
        if (typeof request !== "function") continue;
        try {
          const result = request.call(el);
          // Certains navigateurs renvoient une Promise qui peut être
          // rejetée (ex: pas d'interaction utilisateur reconnue) : on
          // l'intercepte pour ne pas laisser une erreur non gérée, et on
          // essaie la cible suivante si elle échoue.
          if (result && typeof result.catch === "function") {
            result.catch(() => {});
          }
          break; // la première cible qui accepte l'appel suffit
        } catch (err) {
          /* on essaie la cible suivante */
        }
      }
    });
  }

  // Bouton de sortie posé DANS #tv-screen (voir la note dans index.html) :
  // #cinema-exit, en dehors du sous-arbre fullscreen, devient inatteignable
  // tant que le plein écran natif est actif. On le montre/masque en
  // écoutant "fullscreenchange" plutôt qu'au clic sur #cinema-fullscreen,
  // pour rester correct même si le plein écran est quitté autrement
  // (touche Échap gérée nativement par le navigateur, geste système...).
  const inlineExitBtn = document.getElementById("fullscreen-exit-inline");
  if (inlineExitBtn) {
    const events = ["fullscreenchange", "webkitfullscreenchange", "MSFullscreenChange"];
    events.forEach((evt) => document.addEventListener(evt, () => {
      inlineExitBtn.hidden = !document.fullscreenElement;
    }));
    inlineExitBtn.addEventListener("click", exitNativeFullscreenIfAny);
  }

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
