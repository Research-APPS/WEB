/**
 * H7–H8 Story Lab — character selector, scenes, Go/Chess encounters, handoff.
 */
(function () {
  "use strict";

  const state = {
    run: null,
    game: "none", // none|chess|go
    // go
    goBoard: null,
    goTurn: "b",
    goPrevKey: null,
    goPasses: 0,
    goFrames: [],
    goStates: [],
    goSession: null,
    goPly: 0,
    // shared music
    harmonicWorld: null,
    lastComment: null,
  };

  const el = {};
  function $(id) {
    return document.getElementById(id);
  }

  function initDom() {
    el.root = $("airam-story-lab");
    if (!el.root) return false;
    el.root.innerHTML = `
<div class="story-lab">
  <header class="sl-top">
    <div>
      <strong>AIRAM Story Lab</strong>
      <span>H7 Go · H8 WorldState / CharacterState / PerspectiveHandoff</span>
    </div>
    <a class="sl-link" href="/chess-lab/">Chess Lab →</a>
  </header>

  <section class="sl-panel" id="sl-select">
    <h2>Elige perspectiva</h2>
    <p class="sl-note">El personaje fija CharacterState + perfil musical. El WorldState se comparte en el arco.</p>
    <div class="sl-chars" id="sl-chars"></div>
  </section>

  <section class="sl-panel" id="sl-run" hidden>
    <div class="sl-meta">
      <span id="sl-char-chip"></span>
      <span id="sl-world-chip"></span>
      <button type="button" id="sl-reset">Reiniciar arco</button>
    </div>
    <article class="sl-scene">
      <h3 id="sl-scene-title"></h3>
      <p id="sl-scene-body"></p>
      <div class="sl-choices" id="sl-choices"></div>
    </article>
    <div class="sl-knowledge">
      <strong>Conocimiento</strong>
      <ul id="sl-know"></ul>
    </div>
    <div class="sl-handoff-log" id="sl-handoff-log"></div>
  </section>

  <section class="sl-panel sl-game" id="sl-game" hidden>
    <h3 id="sl-game-title">Encuentro</h3>
    <div class="sl-game-grid">
      <div>
        <div class="go-board" id="go-board" hidden></div>
        <div id="chess-embed-note" class="sl-note" hidden>
          Usa <a href="/chess-lab/">Chess Lab</a> para el encuentro completo de ajedrez.
          Aquí el arco registra el flag <code>played_chess</code> al cerrar.
        </div>
        <div class="go-toolbar" id="go-toolbar" hidden>
          <button type="button" id="go-pass">Pasar</button>
          <button type="button" id="go-bot">Bot responde</button>
          <button type="button" id="go-new">Nuevo tablero</button>
          <span id="go-status"></span>
        </div>
      </div>
      <div>
        <div class="sl-comment" id="sl-comment">—</div>
        <div class="sl-score" id="sl-score"></div>
        <button type="button" id="sl-play-score">▶ Score del ply</button>
      </div>
    </div>
  </section>
</div>`;
    el.chars = $("sl-chars");
    el.select = $("sl-select");
    el.run = $("sl-run");
    el.charChip = $("sl-char-chip");
    el.worldChip = $("sl-world-chip");
    el.sceneTitle = $("sl-scene-title");
    el.sceneBody = $("sl-scene-body");
    el.choices = $("sl-choices");
    el.know = $("sl-know");
    el.handoffLog = $("sl-handoff-log");
    el.game = $("sl-game");
    el.gameTitle = $("sl-game-title");
    el.goBoard = $("go-board");
    el.goToolbar = $("go-toolbar");
    el.goStatus = $("go-status");
    el.chessNote = $("chess-embed-note");
    el.comment = $("sl-comment");
    el.scoreBox = $("sl-score");
    return true;
  }

  function fillChars() {
    const profiles = window.AiramH2.CharacterProfiles.list().filter(function (p) {
      return p.id !== "neutral";
    });
    el.chars.innerHTML = profiles
      .map(function (p) {
        return (
          '<button type="button" class="sl-char" data-id="' +
          p.id +
          '" style="border-color:' +
          p.color +
          '">' +
          "<strong>" +
          p.label +
          "</strong>" +
          "<span>" +
          p.blurb +
          "</span>" +
          "</button>"
        );
      })
      .join("");
    el.chars.querySelectorAll("[data-id]").forEach(function (btn) {
      btn.onclick = function () {
        startWith(btn.getAttribute("data-id"));
      };
    });
  }

  function startWith(characterId) {
    state.run = window.AiramH2.Story.startRun(characterId);
    el.select.hidden = true;
    el.run.hidden = false;
    seedMusic();
    renderRun();
  }

  function seedMusic() {
    if (!window.AiramH2.HarmonicWorld) return;
    const profile = window.AiramH2.CharacterProfiles.get(
      state.run.character.music_profile_id
    );
    state.harmonicWorld = window.AiramH2.HarmonicWorld.seed(
      "story",
      profile,
      null
    );
  }

  function renderRun() {
    const run = state.run;
    const scene = window.AiramH2.Story.currentScene(run);
    const profile = window.AiramH2.CharacterProfiles.get(
      run.character.character_id
    );
    el.charChip.textContent =
      profile.label + " · " + (run.character.mood || "");
    el.charChip.style.borderColor = profile.color || "";
    el.worldChip.textContent =
      "World · " +
      run.world.chapter_id +
      "/" +
      run.world.scene_id +
      " · arco " +
      Math.round(run.world.tension_arc * 100) +
      "%";

    if (!scene) {
      el.sceneTitle.textContent = "Sin escena";
      el.sceneBody.textContent = "";
      el.choices.innerHTML = "";
      return;
    }
    el.sceneTitle.textContent = scene.title + " · " + scene.type;
    el.sceneBody.textContent = scene.body;
    el.choices.innerHTML = (scene.choices || [])
      .map(function (c) {
        return (
          '<button type="button" data-choice="' +
          c.id +
          '">' +
          c.label +
          "</button>"
        );
      })
      .join("");
    el.choices.querySelectorAll("[data-choice]").forEach(function (btn) {
      btn.onclick = function () {
        const id = btn.getAttribute("data-choice");
        const choice = (scene.choices || []).find(function (c) {
          return c.id === id;
        });
        const prevChar = state.run.character.character_id;
        state.run = window.AiramH2.Story.applyChoice(state.run, choice);
        if (state.run.character.character_id !== prevChar) {
          seedMusic();
        }
        syncGamePanel();
        renderRun();
      };
    });

    el.know.innerHTML = (run.character.knowledge || [])
      .map(function (k) {
        return "<li><code>" + k + "</code></li>";
      })
      .join("");

    el.handoffLog.innerHTML = (run.handoff_log || [])
      .map(function (h) {
        return (
          "<div>Handoff <strong>" +
          h.from +
          " → " +
          h.to +
          "</strong> @ " +
          h.scene_id +
          "</div>"
        );
      })
      .join("") || "<div class='sl-muted'>Sin handoffs aún.</div>";

    syncGamePanel();
  }

  function syncGamePanel() {
    const scene = window.AiramH2.Story.currentScene(state.run);
    const game =
      (scene && scene.game) ||
      (state.run.world.flags && state.run.world.flags.active_game) ||
      null;
    if (scene && scene.type === "encounter" && game) {
      el.game.hidden = false;
      state.game = game;
      el.gameTitle.textContent =
        "Encuentro · " + (game === "go" ? "Go 9×9" : "Ajedrez");
      if (game === "go") {
        el.goBoard.hidden = false;
        el.goToolbar.hidden = false;
        el.chessNote.hidden = true;
        if (!state.goBoard) newGoGame();
        else drawGo();
      } else {
        el.goBoard.hidden = true;
        el.goToolbar.hidden = true;
        el.chessNote.hidden = false;
      }
    } else {
      el.game.hidden = true;
      state.game = "none";
    }
  }

  function newGoGame() {
    const G = window.AiramH2.GoCore;
    state.goBoard = G.emptyBoard();
    state.goTurn = "b";
    state.goPrevKey = null;
    state.goPasses = 0;
    state.goPly = 0;
    state.goSession = window.AiramH2.createSession({ mode: "go", source: "go" });
    const f0 = window.AiramH2.GoAdapter.buildInitialFrame(
      state.goSession.id,
      state.goBoard
    );
    state.goFrames = [f0];
    state.goStates = [window.AiramH2.RulesetV01.frameToState(f0, null, [])];
    drawGo();
    el.goStatus.textContent = "Negras juegan";
  }

  function drawGo() {
    const G = window.AiramH2.GoCore;
    const b = state.goBoard;
    let html = "";
    for (let r = 0; r < G.SIZE; r++) {
      for (let c = 0; c < G.SIZE; c++) {
        const v = b[r][c];
        const cls =
          "go-cell" +
          (v === G.colorCode("b")
            ? " stone-b"
            : v === G.colorCode("w")
              ? " stone-w"
              : "");
        html +=
          '<button type="button" class="' +
          cls +
          '" data-r="' +
          r +
          '" data-c="' +
          c +
          '"></button>';
      }
    }
    el.goBoard.style.gridTemplateColumns =
      "repeat(" + G.SIZE + ", 1fr)";
    el.goBoard.innerHTML = html;
    el.goBoard.querySelectorAll(".go-cell").forEach(function (cell) {
      cell.onclick = function () {
        placeGo(+cell.getAttribute("data-r"), +cell.getAttribute("data-c"));
      };
    });
    const sc = G.score(b);
    el.goStatus.textContent =
      (state.goTurn === "b" ? "Negras" : "Blancas") +
      " · B " +
      sc.black +
      " / W " +
      sc.white;
  }

  function placeGo(r, c) {
    const G = window.AiramH2.GoCore;
    const before = G.cloneBoard(state.goBoard);
    const trial = G.tryPlace(state.goBoard, r, c, state.goTurn, state.goPrevKey);
    if (!trial.ok) {
      el.goStatus.textContent = "Ilegal: " + trial.reason;
      return;
    }
    state.goPrevKey = G.boardKey(state.goBoard);
    state.goBoard = trial.board;
    state.goPasses = 0;
    commitGoMove({
      r: r,
      c: c,
      captured: trial.captured,
      pass: false,
    }, before, trial.key);
  }

  function passGo() {
    const G = window.AiramH2.GoCore;
    const before = G.cloneBoard(state.goBoard);
    state.goPasses += 1;
    const key = G.boardKey(state.goBoard);
    commitGoMove({ pass: true, captured: 0 }, before, key);
  }

  function commitGoMove(move, before, nextKey) {
    const G = window.AiramH2.GoCore;
    const sideMoved = state.goTurn;
    state.goPly += 1;
    const frame = window.AiramH2.GoAdapter.buildFrameAfterMove(
      state.goSession.id,
      state.goPly,
      before,
      state.goBoard,
      move,
      {
        sideMoved: sideMoved,
        prevKey: state.goPrevKey,
        nextKey: nextKey,
        consecutivePasses: state.goPasses,
      }
    );
    const prev = state.goStates[state.goStates.length - 1];
    const st = window.AiramH2.RulesetV01.frameToState(
      frame,
      prev,
      state.goFrames
    );
    state.goFrames.push(frame);
    state.goStates.push(st);
    state.goTurn = sideMoved === "b" ? "w" : "b";
    state.goPrevKey = nextKey;

    // music + comment
    if (window.AiramH2.MusicalMapV01 && window.AiramH2.ScorePlanner) {
      const { musicalState, causalTrace } =
        window.AiramH2.MusicalMapV01.fromGameState(st, frame);
      const profileId = state.run.character.music_profile_id;
      const profile = window.AiramH2.CharacterProfiles.get(profileId);
      const worldView = window.AiramH2.HarmonicWorld
        ? window.AiramH2.HarmonicWorld.viewForAgent(
            state.harmonicWorld,
            sideMoved === "b" ? "b" : "w"
          )
        : null;
      const score = window.AiramH2.ScorePlanner.planVariant(
        st,
        musicalState,
        frame,
        profile,
        "A",
        { world: worldView }
      );
      if (window.AiramH2.HarmonicWorld && state.harmonicWorld) {
        window.AiramH2.HarmonicWorld.commit(
          state.harmonicWorld,
          score,
          sideMoved === "b" ? "b" : "w",
          state.goPly
        );
      }
      state.lastScore = score;
      el.scoreBox.textContent = score.label;
      if (window.AiramH2.CharacterCommenter) {
        const ctx = window.AiramH2.CharacterCommenter.buildContext({
          profileId: profileId,
          frame: frame,
          gameState: st,
          musicalState: musicalState,
          causalTrace: causalTrace,
          world: state.harmonicWorld,
          scoreA: score,
        });
        state.lastComment = window.AiramH2.CharacterCommenter.commentLive(ctx);
        el.comment.innerHTML = state.lastComment.lines
          .map(function (l) {
            return "<p>" + l.text + "</p>";
          })
          .join("");
      }
    }

    drawGo();
    if (frame.ended) {
      el.goStatus.textContent =
        "Fin · " +
        JSON.stringify(frame.go && frame.go.score) +
        " · doble pase";
    }
  }

  function botGo() {
    const G = window.AiramH2.GoCore;
    const m = G.chooseBotMove(state.goBoard, state.goTurn, state.goPrevKey);
    if (!m) {
      passGo();
      return;
    }
    placeGo(m.r, m.c);
  }

  function bind() {
    $("sl-reset").onclick = function () {
      el.select.hidden = false;
      el.run.hidden = true;
      el.game.hidden = true;
      state.run = null;
      state.goBoard = null;
    };
    $("go-pass").onclick = function () {
      passGo();
    };
    $("go-bot").onclick = function () {
      botGo();
    };
    $("go-new").onclick = function () {
      newGoGame();
    };
    $("sl-play-score").onclick = function () {
      if (!state.lastScore || !window.AiramH2.Piano) return;
      window.AiramH2.Piano.warm();
      window.AiramH2.Piano.setEnabled(true);
      window.AiramH2.Piano.playScore(state.lastScore, "all");
    };
  }

  function boot() {
    if (!initDom()) return;
    fillChars();
    bind();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
