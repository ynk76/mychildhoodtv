/**
 * ============================================================================
 *  Détection de publicité (best-effort) + mini-jeux pendant les pubs.
 * ============================================================================
 *  YouTube n'expose aucune API officielle pour détecter une publicité
 *  (volontaire de leur part, pour protéger leurs revenus pub). L'heuristique
 *  utilisée ici est la même que pour la correction de dérive dans
 *  scripts/schedule.js : une publicité n'apparaît jamais dans la playlist
 *  elle-même, donc si la vidéo réellement affichée par le lecteur du salon
 *  ne correspond pas à celle attendue à l'index en cours, c'est
 *  probablement qu'une pub (ou un enchaînement de plusieurs pubs) est en
 *  train de jouer. Une ou plusieurs pubs qui se suivent sans retour au
 *  contenu entre les deux comptent comme UNE seule "séquence" de pub — un
 *  seul mini-jeu est proposé pour toute la séquence, jusqu'au retour du
 *  contenu normal.
 * ============================================================================
 */

(function () {
  const POLL_MS = 500;
  const DEBOUNCE_TICKS = 2; // évite de réagir à un simple instant de transition

  class AdDetector {
    constructor({ player, liveSchedule, onAdSequenceStart, onAdSequenceEnd }) {
      this.player = player;
      this.liveSchedule = liveSchedule;
      this.onAdSequenceStart = onAdSequenceStart;
      this.onAdSequenceEnd = onAdSequenceEnd;
      this._adTicks = 0;
      this._contentTicks = 0;
      this._inAd = false;
      this._timer = null;
    }

    start() {
      clearInterval(this._timer);
      this._timer = setInterval(() => this._tick(), POLL_MS);
    }

    stop() {
      clearInterval(this._timer);
    }

    _tick() {
      const index = this.liveSchedule.index;
      const ids = this.player.getPlaylistIds();
      if (index == null || !ids || !ids[index]) return;
      const expected = ids[index];
      const actual = this.player.getCurrentVideoId();
      // YouTube restreint souvent l'accès aux métadonnées vidéo pendant une
      // pub (getVideoData()/getCurrentVideoId() renvoie alors null) : un
      // retour vide compte donc AUSSI comme "ça ressemble à une pub", pas
      // seulement un ID différent de celui attendu — sinon une pub qui
      // masque son ID n'était jamais détectée et le mini-jeu n'apparaissait
      // jamais.
      const looksAd = actual == null || actual !== expected;

      if (looksAd) {
        this._adTicks++;
        this._contentTicks = 0;
        if (!this._inAd && this._adTicks >= DEBOUNCE_TICKS) {
          this._inAd = true;
          if (typeof this.onAdSequenceStart === "function") this.onAdSequenceStart();
        }
      } else {
        this._contentTicks++;
        this._adTicks = 0;
        if (this._inAd && this._contentTicks >= DEBOUNCE_TICKS) {
          this._inAd = false;
          if (typeof this.onAdSequenceEnd === "function") this.onAdSequenceEnd();
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Morpion (tic-tac-toe) contre un ordinateur qui joue au hasard        */
  /* ------------------------------------------------------------------ */

  const TTT_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  class TicTacToeGame {
    constructor(root) {
      this.root = root;
      this.board = Array(9).fill(null);
      this.over = false;
      this._restartTimer = null;
    }

    mount() {
      this.status = document.createElement("div");
      this.status.className = "minigame-status";
      this.boardEl = document.createElement("div");
      this.boardEl.className = "ttt-board";
      this.cells = [];
      for (let i = 0; i < 9; i++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ttt-cell";
        btn.addEventListener("click", () => this._play(i));
        this.boardEl.appendChild(btn);
        this.cells.push(btn);
      }
      this.root.appendChild(this.status);
      this.root.appendChild(this.boardEl);
      this._setStatus("Morpion — à toi de jouer (X) !");
    }

    _setStatus(text) {
      if (this.status) this.status.textContent = text;
    }

    _play(i) {
      if (this.over || this.board[i]) return;
      this.board[i] = "X";
      this._render();
      if (this._checkEnd("X")) return;
      setTimeout(() => this._aiPlay(), 350);
    }

    _aiPlay() {
      if (this.over) return;
      const empty = this.board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
      if (!empty.length) return;
      const i = empty[Math.floor(Math.random() * empty.length)];
      this.board[i] = "O";
      this._render();
      this._checkEnd("O");
    }

    _render() {
      this.board.forEach((v, i) => {
        this.cells[i].textContent = v || "";
        this.cells[i].disabled = !!v || this.over;
      });
    }

    _checkEnd(lastPlayer) {
      const win = TTT_LINES.some((line) => line.every((i) => this.board[i] === lastPlayer));
      if (win) {
        this.over = true;
        this._setStatus(lastPlayer === "X" ? "Bien joué, tu gagnes ! 🎉" : "L'ordi gagne cette fois...");
        this._render();
        this._scheduleRestart();
        return true;
      }
      if (this.board.every((v) => v)) {
        this.over = true;
        this._setStatus("Match nul !");
        this._render();
        this._scheduleRestart();
        return true;
      }
      return false;
    }

    _scheduleRestart() {
      this._restartTimer = setTimeout(() => {
        this.board = Array(9).fill(null);
        this.over = false;
        this._setStatus("Morpion — à toi de jouer (X) !");
        this._render();
      }, 1800);
    }

    destroy() {
      clearTimeout(this._restartTimer);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Puissance 4 contre un ordinateur qui joue au hasard                  */
  /* ------------------------------------------------------------------ */

  class ConnectFourGame {
    constructor(root) {
      this.root = root;
      this.cols = 7;
      this.rows = 6;
      this.grid = Array.from({ length: this.cols }, () => []);
      this.over = false;
      this._restartTimer = null;
    }

    mount() {
      this.status = document.createElement("div");
      this.status.className = "minigame-status";
      this.boardEl = document.createElement("div");
      this.boardEl.className = "c4-board";
      this.columns = [];
      for (let c = 0; c < this.cols; c++) {
        const col = document.createElement("button");
        col.type = "button";
        col.className = "c4-col";
        col.addEventListener("click", () => this._play(c));
        const cells = [];
        for (let r = 0; r < this.rows; r++) {
          const cell = document.createElement("div");
          cell.className = "c4-cell";
          col.appendChild(cell);
          cells.push(cell);
        }
        this.boardEl.appendChild(col);
        this.columns.push(cells);
      }
      this.root.appendChild(this.status);
      this.root.appendChild(this.boardEl);
      this._setStatus("Puissance 4 — à toi (jaune) : clique une colonne !");
    }

    _setStatus(text) {
      if (this.status) this.status.textContent = text;
    }

    _play(c) {
      if (this.over) return;
      if (!this._drop(c, "player")) return;
      if (this._checkEnd("player", "Bien joué, tu gagnes ! 🎉")) return;
      setTimeout(() => this._aiPlay(), 400);
    }

    _aiPlay() {
      if (this.over) return;
      const options = [];
      for (let c = 0; c < this.cols; c++) if (this.grid[c].length < this.rows) options.push(c);
      if (!options.length) return;
      const c = options[Math.floor(Math.random() * options.length)];
      this._drop(c, "ai");
      this._checkEnd("ai", "L'ordi gagne cette fois...");
    }

    _drop(c, who) {
      if (this.grid[c].length >= this.rows) return false;
      this.grid[c].push(who);
      const r = this.grid[c].length - 1;
      this.columns[c][r].classList.add(who === "player" ? "c4-cell--player" : "c4-cell--ai");
      return true;
    }

    _checkEnd(who, winMessage) {
      if (this._hasFour(who)) {
        this.over = true;
        this._setStatus(winMessage);
        this._scheduleRestart();
        return true;
      }
      if (this.grid.every((col) => col.length >= this.rows)) {
        this.over = true;
        this._setStatus("Match nul !");
        this._scheduleRestart();
        return true;
      }
      return false;
    }

    _hasFour(who) {
      const get = (c, r) => (this.grid[c] && this.grid[c][r]) || null;
      const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
      for (let c = 0; c < this.cols; c++) {
        for (let r = 0; r < this.rows; r++) {
          if (get(c, r) !== who) continue;
          for (const [dc, dr] of dirs) {
            let count = 1;
            for (let k = 1; k < 4; k++) {
              if (get(c + dc * k, r + dr * k) === who) count++;
              else break;
            }
            if (count >= 4) return true;
          }
        }
      }
      return false;
    }

    _scheduleRestart() {
      this._restartTimer = setTimeout(() => {
        this.grid = Array.from({ length: this.cols }, () => []);
        this.over = false;
        this.columns.forEach((cells) => cells.forEach((cell) => (cell.className = "c4-cell")));
        this._setStatus("Puissance 4 — à toi (jaune) : clique une colonne !");
      }, 1800);
    }

    destroy() {
      clearTimeout(this._restartTimer);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pong contre un ordinateur                                            */
  /* ------------------------------------------------------------------ */

  class PongGame {
    constructor(root) {
      this.root = root;
      this._raf = null;
      this._onMove = this._onMove.bind(this);
      this._onTouchMove = this._onTouchMove.bind(this);
    }

    mount() {
      this.status = document.createElement("div");
      this.status.className = "minigame-status";
      this.status.textContent = "Pong — bouge la souris (ou le doigt) !";
      this.canvas = document.createElement("canvas");
      this.canvas.className = "pong-canvas";
      this.canvas.width = 300;
      this.canvas.height = 180;
      this.root.appendChild(this.status);
      this.root.appendChild(this.canvas);
      this.ctx = this.canvas.getContext("2d");

      this.playerY = this.canvas.height / 2;
      this.aiY = this.canvas.height / 2;
      this.paddleH = 34;
      this.paddleW = 6;
      this.playerScore = 0;
      this.aiScore = 0;
      this._resetBall(true);

      this.canvas.addEventListener("mousemove", this._onMove);
      this.canvas.addEventListener("touchmove", this._onTouchMove, { passive: false });

      this._loop();
    }

    _onMove(e) {
      const rect = this.canvas.getBoundingClientRect();
      const scaleY = this.canvas.height / rect.height;
      this.playerY = (e.clientY - rect.top) * scaleY;
    }

    _onTouchMove(e) {
      e.preventDefault();
      if (!e.touches[0]) return;
      const rect = this.canvas.getBoundingClientRect();
      const scaleY = this.canvas.height / rect.height;
      this.playerY = (e.touches[0].clientY - rect.top) * scaleY;
    }

    _loop() {
      this._update();
      this._draw();
      this._raf = requestAnimationFrame(() => this._loop());
    }

    _update() {
      this.ballX += this.ballVX;
      this.ballY += this.ballVY;

      if (this.ballY <= 0 || this.ballY >= this.canvas.height) this.ballVY *= -1;

      this.aiY += Math.max(-2, Math.min(2, this.ballY - this.aiY));

      const pTop = this.playerY - this.paddleH / 2;
      const pBot = this.playerY + this.paddleH / 2;
      const aiTop = this.aiY - this.paddleH / 2;
      const aiBot = this.aiY + this.paddleH / 2;

      if (this.ballX <= this.paddleW + 4 && this.ballY >= pTop && this.ballY <= pBot) {
        this.ballVX = Math.abs(this.ballVX);
      } else if (
        this.ballX >= this.canvas.width - this.paddleW - 4 &&
        this.ballY >= aiTop &&
        this.ballY <= aiBot
      ) {
        this.ballVX = -Math.abs(this.ballVX);
      } else if (this.ballX < 0) {
        this.aiScore++;
        this._resetBall();
      } else if (this.ballX > this.canvas.width) {
        this.playerScore++;
        this._resetBall();
      }
    }

    _resetBall(silent) {
      this.ballX = this.canvas.width / 2;
      this.ballY = this.canvas.height / 2;
      this.ballVX = (this.ballVX > 0 ? -1 : 1) * 2.4 || 2.4;
      this.ballVY = 1.6 * (Math.random() > 0.5 ? 1 : -1);
      if (!silent && this.status) this.status.textContent = `Toi ${this.playerScore} — ${this.aiScore} Ordi`;
    }

    _draw() {
      const ctx = this.ctx;
      ctx.fillStyle = "#08130c";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = "#fff8ec";
      ctx.fillRect(4, this.playerY - this.paddleH / 2, this.paddleW, this.paddleH);
      ctx.fillRect(
        this.canvas.width - 4 - this.paddleW,
        this.aiY - this.paddleH / 2,
        this.paddleW,
        this.paddleH
      );
      ctx.beginPath();
      ctx.arc(this.ballX, this.ballY, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    destroy() {
      cancelAnimationFrame(this._raf);
      this.canvas.removeEventListener("mousemove", this._onMove);
      this.canvas.removeEventListener("touchmove", this._onTouchMove);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Overlay : choisit un mini-jeu au hasard par séquence de pub           */
  /* ------------------------------------------------------------------ */

  class MinigameOverlay {
    constructor({ containerEl }) {
      this.containerEl = containerEl;
      this.currentGame = null;
    }

    show() {
      if (!this.containerEl) return;
      const games = [TicTacToeGame, ConnectFourGame, PongGame];
      const GameClass = games[Math.floor(Math.random() * games.length)];
      this.containerEl.innerHTML = "";
      this.currentGame = new GameClass(this.containerEl);
      this.currentGame.mount();
    }

    hide() {
      if (this.currentGame && typeof this.currentGame.destroy === "function") this.currentGame.destroy();
      this.currentGame = null;
      if (this.containerEl) this.containerEl.innerHTML = "";
    }
  }

  window.AdDetector = AdDetector;
  window.MinigameOverlay = MinigameOverlay;
})();
