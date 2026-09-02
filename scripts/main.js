/**
 * Point d'entrée : séquence de démarrage rétro, puis initialisation de
 * tous les modules (décor, télécommande, écran de veille, plein écran, tchat).
 */

function initBoot(onDone, onFirstGesture) {
  const boot = document.getElementById("boot-screen");
  if (!boot) {
    onDone();
    return;
  }

  let done = false;
  function finish() {
    if (done) return;
    done = true;
    Audio2000.unlock();
    Audio2000.startAmbient();
    // Vrai clic direct de l'utilisateur (contrairement au chargement du
    // lecteur YouTube, lancé en parallèle de cet écran de boot — voir
    // DOMContentLoaded plus bas — mais forcément asynchrone) : la
    // meilleure chance de faire accepter playVideo() par les navigateurs
    // mobiles les plus stricts si l'autoplay ne s'est pas déjà déclenché.
    if (typeof onFirstGesture === "function") onFirstGesture();
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
 * En mode cinéma, on réutilise le même mécanisme en ciblant le rectangle
 * de la télé SEULE (.tv-set, sans le meuble — voir
 * offsetLeft/Top/Width/Height, insensibles au transform déjà en place).
 *
 * Sur mobile, tant que le téléphone reste en portrait (l'écran du
 * navigateur, pas forcément l'appareil — voir isMobile()/rotate plus bas),
 * on ajoute une rotation de 90° à ce même transform pour un grand format
 * paysage à regarder en tournant la tête/le téléphone : c'est le SEUL
 * moyen d'obtenir un grand écran sur un appareil dont la rotation est
 * verrouillée par l'utilisateur (réglage très courant), le navigateur ne
 * rapportant alors jamais un viewport paysage.
 *
 * Une version précédente appliquait cette rotation en sortant .tv-set du
 * transform de .stage (position:fixed + rotation posée directement sur
 * .tv-set), pour la positionner "à la main" par rapport au vrai viewport.
 * Deux problèmes en découlaient :
 *  - Sans le transform de .stage, le décor (#room, fond beige/nuit) ne
 *    remplissait plus le viewport réel : l'espace restant montrait le
 *    fond sombre de la page en dessous — la fameuse "barre noire".
 *  - En supposant que window.innerWidth/innerHeight restaient figés sur
 *    "portrait" même une fois le téléphone physiquement tourné : sur un
 *    appareil dont la rotation n'est PAS verrouillée, le navigateur
 *    rafraîchit bien ces valeurs (et déclenche un vrai "resize") dans ce
 *    cas précis, ce qui doublait la rotation.
 * En intégrant la rotation directement dans le MÊME transform que le
 * zoom (appliqué à .stage, donc à tout #room y compris son fond), les
 * deux problèmes disparaissent : le fond zoomé déborde largement du
 * viewport dans tous les sens (comme en mode cinéma desktop, jamais de
 * bord visible), et la rotation ne s'applique que quand le viewport
 * rapporté est encore plus haut que large (vh > vw) — une fois un vrai
 * passage en paysage détecté (rotation non verrouillée), elle s'efface
 * d'elle-même au profit du même zoom "contain" non pivoté que le desktop.
 */
function initStageScale() {
  const stage = document.getElementById("room-stage");
  const room = document.getElementById("room");
  const tvSet = document.getElementById("tv-set");
  if (!stage || !room || !tvSet) return () => {};

  const SIZE = { desktop: [1280, 740], mobile: [390, 780] };
  const isMobile = () => viewportSize().vw <= 760;

  // window.innerWidth/innerHeight ne bougent pas toujours en phase avec la
  // barre d'adresse mobile (masquée/affichée dynamiquement) : quand elle
  // est disponible, visualViewport reflète plus fidèlement l'espace
  // réellement visible, ce qui évite un espace vide (barre noire) en haut
  // ou en bas de l'écran juste après un changement d'orientation.
  function viewportSize() {
    if (window.visualViewport) {
      return { vw: window.visualViewport.width, vh: window.visualViewport.height };
    }
    return { vw: window.innerWidth, vh: window.innerHeight };
  }

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
    const { vw, vh } = viewportSize();
    const cinema = room.classList.contains("cinema-mode");

    if (cinema) {
      // Ici la fidélité de la vidéo (pas de déformation) prime sur le
      // remplissage total : on garde un facteur UNIQUE (contain), avec une
      // marge un peu plus généreuse pour éviter l'effet "trop zoomé" —
      // quitte à garder une fine bordure sur les côtés.
      const { x: tl, y: tt } = offsetWithin(tvSet, room);
      const tw = tvSet.offsetWidth;
      const th = tvSet.offsetHeight;
      const px = tl + tw / 2;
      const py = tt + th / 2;
      const rotate = isMobile() && vh > vw;

      if (rotate) {
        // .stage a transform-origin:0 0 (voir styles/main.css) : la
        // rotation s'applique donc directement autour de (0,0), pas du
        // centre de #room — d'où cette formule (dérivée de la matrice de
        // rotation 90°) plutôt que celle, plus simple, du cas non pivoté
        // ci-dessous.
        const s = Math.min(vh / tw, vw / th) * 0.94;
        const tx = vw / 2 + s * py;
        const ty = vh / 2 - s * px;
        stage.style.transform = `translate(${tx}px, ${ty}px) rotate(90deg) scale(${s})`;
      } else {
        const s = Math.min(vw / tw, vh / th) * 0.9;
        const tx = vw / 2 - s * px;
        const ty = vh / 2 - s * py;
        stage.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      }
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
  // "resize" ne se déclenche pas toujours de façon fiable sur mobile quand
  // seule la barre d'adresse apparaît/disparaît (sans changement de
  // largeur) : visualViewport le détecte, lui, de façon plus cohérente.
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fit);
  }
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
  function flashFullscreenUnavailable() {
    if (!fullscreenBtn) return;
    // Certains navigateurs mobiles (ex : Safari iOS pas assez récent)
    // n'exposent tout simplement pas l'API plein écran sur un élément qui
    // n'est pas une balise <video> — la demande échoue alors forcément,
    // silencieusement. Un bouton qui ne réagit jamais visuellement à un
    // clic est indiscernable d'un bouton cassé : ce petit "non" (secousse +
    // teinte rouge) confirme au moins que le clic a été pris en compte.
    fullscreenBtn.classList.add("cinema-fullscreen-btn--unavailable");
    setTimeout(() => fullscreenBtn.classList.remove("cinema-fullscreen-btn--unavailable"), 1500);
  }

  function anyFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", () => {
      // Plein écran de la VIDÉO elle-même (l'iframe YouTube), pas de la
      // page : demander requestFullscreen() directement sur l'iframe fait
      // passer le LECTEUR YouTube natif en plein écran (comme le ferait
      // son propre bouton plein écran), pas notre décor. C'est la cible
      // prioritaire ; #tv-screen (notre conteneur) ne sert que de repli si
      // jamais l'iframe refusait l'appel pour une raison quelconque.
      const iframe = screen.querySelector("iframe");
      const targets = [iframe, screen].filter(Boolean);
      let succeeded = false;
      for (const el of targets) {
        const request = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitEnterFullscreen || el.msRequestFullscreen;
        if (typeof request !== "function") continue;
        try {
          const result = request.call(el);
          // Certains navigateurs renvoient une Promise qui peut être
          // rejetée (ex: pas d'interaction utilisateur reconnue) : on
          // l'intercepte pour donner un retour visuel plutôt que laisser
          // une erreur non gérée ET un bouton silencieusement inerte.
          if (result && typeof result.catch === "function") {
            result.catch(() => flashFullscreenUnavailable());
          }
          succeeded = true;
          break; // la première cible qui accepte l'appel (pas forcément qui réussit) suffit
        } catch (err) {
          /* on essaie la cible suivante */
        }
      }
      if (!succeeded) {
        flashFullscreenUnavailable();
        return;
      }
      // Sur certains navigateurs (WebKit mobile en particulier), l'appel
      // peut ne renvoyer ni erreur ni Promise rejetée et pourtant ne JAMAIS
      // passer en plein écran (silencieusement no-op) — le cas exact
      // signalé comme "on clique et rien ne se passe". On vérifie donc
      // pour de vrai, un instant plus tard, que le plein écran a
      // réellement démarré.
      setTimeout(() => {
        if (!anyFullscreenElement()) flashFullscreenUnavailable();
      }, 700);
    });
  }

  // Bouton de sortie posé DANS #tv-screen (voir la note dans index.html) :
  // utile UNIQUEMENT si le plein écran a fini par se poser sur #tv-screen
  // lui-même (repli, voir la liste de cibles ci-dessus) — dans ce cas
  // précis, le navigateur ne rend QUE ce sous-arbre et #cinema-exit, en
  // dehors, devient inatteignable. Quand c'est l'iframe qui est la cible
  // (cas normal), ce bouton est un sibling de l'iframe, donc lui aussi
  // hors du sous-arbre rendu — inutile de l'afficher, il serait tout aussi
  // inatteignable (voir Escape/le propre bouton de sortie de YouTube pour
  // quitter dans ce cas).
  const inlineExitBtn = document.getElementById("fullscreen-exit-inline");
  if (inlineExitBtn) {
    const events = ["fullscreenchange", "webkitfullscreenchange", "MSFullscreenChange"];
    events.forEach((evt) => document.addEventListener(evt, () => {
      inlineExitBtn.hidden = anyFullscreenElement() !== screen;
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
    adWaitingOverlay: document.getElementById("ad-waiting-overlay"),
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

  return remote;
}

document.addEventListener("DOMContentLoaded", () => {
  // initApp() lance tout de suite le chargement du lecteur YouTube (API +
  // création du player), EN PARALLÈLE de l'écran de boot (lui-même un
  // simple cache opaque par-dessus tout le décor, voir .boot-screen dans
  // styles/crt.css — rien n'est donc visible en dessous entre-temps) :
  // plus ce chargement démarre tôt, plus vite la lecture peut réellement
  // commencer, au lieu d'attendre que le boot ait fini de se refermer.
  const remote = initApp();
  initBoot(
    // Appelé une fois l'écran de démarrage VRAIMENT masqué (fondu de 600ms
    // terminé, boot.hidden=true) : c'est ici, pas plus tôt, qu'on autorise
    // le son — sinon on l'entendrait pendant que ce cache est encore
    // visible (même en train de s'estomper).
    () => {
      if (remote) remote.onBootDismissed();
    },
    () => {
      if (remote && remote.power) remote.player.play();
    }
  );
});
