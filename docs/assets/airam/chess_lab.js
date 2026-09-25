/**
 * AIRAM H−2 Chess Lab — UI only for game semantics.
 * No music / CHORDIA / Web Audio / Story Mode.
 */
(function () {
  "use strict";

  const DIMS = window.AiramH2.DIMENSIONS;
  const COLORS = {
    advantage: "#7aa2ff",
    tension: "#ef2b2b",
    surprise: "#f0bf59",
    urgency: "#ff6b67",
    forcing: "#c084fc",
    instability: "#69d38b",
    ambiguity: "#5eead4",
  };
  const DIM_META = {
    advantage: {
      label: "Ventaja",
      blurb: "Quién va mejor (−1 negras … +1 blancas). En cada gráfico, arriba = mejor para ese jugador.",
    },
    tension: {
      label: "Tensión",
      blurb: "Presión táctica, rey expuesto, jaque y volatilidad de la eval.",
    },
    surprise: {
      label: "Sorpresa",
      blurb: "Salto brusco de evaluación (proxy sin MultiPV todavía).",
    },
    urgency: {
      label: "Urgencia",
      blurb: "Hay que actuar ya: jaque, pocas jugadas útiles, material colgando.",
    },
    forcing: {
      label: "Forzamiento",
      blurb: "La posición empuja a líneas concretas (jaques, capturas fuertes).",
    },
    instability: {
      label: "Inestabilidad",
      blurb: "La posición puede cambiar mucho de un ply a otro.",
    },
    ambiguity: {
      label: "Ambigüedad",
      blurb: "Muchas opciones plausibles; no hay un único plan claro.",
    },
  };
  const MODES = {
    pvb: {
      id: "pvb",
      label: "Vs Bot",
      chip: "1 jugador",
      desc: "Tú con blancas · Bot con negras",
      white: { name: "Tú", role: "Blancas · humano", kind: "human", avatar: "♟" },
      black: { name: "Bot", role: "Negras · IA local", kind: "bot", avatar: "🤖" },
    },
    pvp: {
      id: "pvp",
      label: "2 jugadores",
      chip: "Local / tablet",
      desc: "Pasan el dispositivo · ideal en tablet",
      white: { name: "Jugador 1", role: "Blancas", kind: "human", avatar: "♟" },
      black: { name: "Jugador 2", role: "Negras", kind: "human", avatar: "♟" },
    },
    bvb: {
      id: "bvb",
      label: "Bot vs Bot",
      chip: "Análisis",
      desc: "Ambos lados automáticos · para el lab de curvas",
      white: { name: "Bot Alfa", role: "Blancas · IA", kind: "bot", avatar: "🤖" },
      black: { name: "Bot Beta", role: "Negras · IA", kind: "bot", avatar: "🤖" },
    },
  };

  const state = {
    session: null,
    frames: [],
    states: [],
    reviews: [],
    board: null,
    castling: null,
    turn: "w",
    ply: 0,
    selectedPly: 0,
    selected: null,
    legalDest: [],
    lastMove: null,
    mode: "pvb",
    botTimer: null,
    botDepth: 2,
    moveLock: false,
    posHistory: [],
    replay: {
      active: false,
      timer: null,
      cursor: 0,
      fromPly: 0,
      toPly: 0,
    },
    summary: null,
    selectedPassage: null,
    profileId: "sismico",
    scorePair: null,
    abVerdict: null,
    harmonicWorld: null,
    musicalHorizon: null,
    comments: [],
    studyComment: null,
    selectedDim: "tension",
    visibleDims: Object.fromEntries(DIMS.map((d) => [d, true])),
  };

  const el = {};

  function $(id) {
    return document.getElementById(id);
  }

  function initDom() {
    el.root = $("airam-chess-lab");
    if (!el.root) return false;
    el.root.innerHTML = `
<div class="airam-lab">
  <div class="lab-top">
    <div class="lab-brand">
      <strong>AIRAM Chess Lab</strong>
      <span>H−1 + piano · acorde por jugada (MusyngKite)</span>
    </div>
    <div class="mode-switch" id="mode-switch" role="tablist" aria-label="Modalidad de partida">
      <button type="button" data-mode="pvb" class="active">Vs Bot</button>
      <button type="button" data-mode="pvp">2 jugadores</button>
      <button type="button" data-mode="bvb">Bot vs Bot</button>
    </div>
  </div>
  <div class="mode-banner" id="mode-banner">
    <span class="chip" id="mode-chip">1 jugador</span>
    <span class="desc" id="mode-desc">Tú con blancas · Bot con negras</span>
  </div>
  <div class="lab-grid">
    <div class="panel">
      <h3>Partida</h3>
      <div class="board-shell">
        <div class="player-row" id="row-b">
          <div class="player-meta">
            <div class="avatar" id="av-b">🤖</div>
            <div class="player-text">
              <div class="name" id="name-b">Bot</div>
              <div class="role" id="role-b">Negras · IA local</div>
            </div>
          </div>
          <div class="clock-ish" id="clock-b">●</div>
        </div>
        <div class="board-wrap" id="board"></div>
        <div class="player-row" id="row-w">
          <div class="player-meta">
            <div class="avatar" id="av-w">♟</div>
            <div class="player-text">
              <div class="name" id="name-w">Tú</div>
              <div class="role" id="role-w">Blancas · humano</div>
            </div>
          </div>
          <div class="clock-ish" id="clock-w">●</div>
        </div>
      </div>
      <div class="toolbar">
        <button class="primary" id="btn-new">Nueva partida</button>
        <button id="btn-undo" title="Deshacer última jugada">Deshacer</button>
        <button id="btn-export">Exportar</button>
        <button id="btn-import">Importar</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
        <button type="button" id="btn-sessions" title="Replay Lab">Sesiones</button>
        <button type="button" id="btn-reanalyze" title="H0 PASS A≠B">Reanalizar H0</button>
        <button type="button" id="btn-verify" title="Verificar replay">Verificar</button>
        <span class="audio-bar">
          <button type="button" id="btn-audio" title="Piano on/off">♪ Piano</button>
          <input type="range" id="audio-vol" min="0" max="1" step="0.05" title="Volumen">
          <span class="chord-label" id="chord-label">—</span>
        </span>
      </div>
      <div class="status" id="status"></div>
      <div class="health-bar" id="health-bar" aria-label="Salud material">
        <div class="health-row"><span id="health-label-w">Blancas</span><div class="health-track"><i id="health-w"></i></div><em id="health-pct-w">100%</em></div>
        <div class="health-row"><span id="health-label-b">Negras</span><div class="health-track"><i id="health-b"></i></div><em id="health-pct-b">100%</em></div>
      </div>
    </div>
    <div class="panel">
      <h3>Curvas por jugador</h3>
      <p class="curves-hint">Cada gráfico muestra solo los plies de ese color. Arriba = más alto el valor (en ventaja: mejor para ese jugador).</p>
      <div class="curves-duo">
        <div class="curves-block">
          <div class="curves-head" id="curves-head-w">Blancas</div>
          <canvas class="curves" id="curves-w" width="800" height="200"></canvas>
        </div>
        <div class="curves-block">
          <div class="curves-head" id="curves-head-b">Negras</div>
          <canvas class="curves" id="curves-b" width="800" height="200"></canvas>
        </div>
      </div>
      <div class="legend" id="legend"></div>
      <div class="ply-nav">
        <button type="button" id="ply-prev">◀</button>
        <input type="range" id="ply-range" min="0" max="0" value="0">
        <button type="button" id="ply-next">▶</button>
        <span id="ply-label">ply 0</span>
      </div>
    </div>
    <div class="panel">
      <h3>Inspector</h3>
      <div class="dim-list" id="dim-list"></div>
      <div class="inspector" id="inspector"></div>
      <div class="review-bar" id="review-bar">
        <button data-v="accept">✅</button>
        <button data-v="reject">❌</button>
        <button data-v="unsure">🤔</button>
        <button data-v="modify">✏️</button>
        <input class="human-val" id="human-val" type="number" step="0.01" min="-1" max="1" placeholder="≈valor">
        <textarea id="review-comment" placeholder="Motivo / comentario…"></textarea>
        <button class="primary" id="btn-save-review">Guardar review (juego)</button>
        <button type="button" id="btn-save-music" title="Validez musical">♪ Música OK/KO</button>
        <button type="button" id="btn-save-identity" title="Identidad de personaje">🎭 Identidad</button>
      </div>
    </div>
    <div class="panel panel-h1">
      <h3>H−1 · CausalTrace ∥ MusicalState</h3>
      <p class="h1-note">Sin audio de stems. Misma observación del juego → params musicales + reason. CHORDIA = anclas teóricas.</p>
      <div class="h1-split">
        <div>
          <h4>CausalTrace</h4>
          <div class="inspector" id="causal-trace"></div>
        </div>
        <div>
          <h4>MusicalState</h4>
          <div class="inspector" id="musical-state"></div>
        </div>
      </div>
    </div>
    <div class="panel panel-score">
      <h3>H1–H2 · Score Planner + A/B</h3>
      <p class="h1-note">Propuesta simbólica por CharacterMusicProfile. A/B audible (mismo ply, distinta resolución).</p>
      <div class="score-controls">
        <label>Perfil
          <select id="profile-select"></select>
        </label>
        <button type="button" id="btn-score-plan">Planificar</button>
        <button type="button" id="btn-play-a">▶ A</button>
        <button type="button" id="btn-play-b">▶ B</button>
        <button type="button" id="btn-play-harm">Armonía</button>
        <button type="button" id="btn-play-mel">Melodía</button>
        <button type="button" id="btn-stop-score">Stop</button>
      </div>
      <div class="ab-bar">
        <span>¿Cuál suena mejor aquí?</span>
        <button type="button" data-ab="prefer_a">Prefiero A</button>
        <button type="button" data-ab="prefer_b">Prefiero B</button>
        <button type="button" data-ab="unsure">🤔</button>
        <span class="ab-status" id="ab-status"></span>
      </div>
      <div class="score-label" id="score-label">Sin propuesta aún.</div>
      <div class="score-split">
        <div>
          <h4>Variante A</h4>
          <div class="inspector" id="score-a"></div>
        </div>
        <div>
          <h4>Variante B</h4>
          <div class="inspector" id="score-b"></div>
        </div>
      </div>
      <div class="dim-block">
        <strong>Decisiones (A)</strong>
        <ul class="comps" id="score-decisions"></ul>
      </div>
    </div>
    <div class="panel panel-horizon">
      <h3>H3–H4 · Horizonte + Mundo Alfa/Beta</h3>
      <p class="h1-note">Futuros musicales por candidato PASS B. Alfa (blancas) y Beta (negras) comparten tonic/mode y deudas.</p>
      <div class="world-banner" id="world-banner">Mundo aún no sembrado.</div>
      <div class="horizon-list" id="horizon-list"></div>
    </div>
    <div class="panel panel-character">
      <h3>H5 · Personaje AIRAM</h3>
      <div class="char-head">
        <div class="char-avatar" id="char-avatar"></div>
        <div>
          <div class="char-name" id="char-name">—</div>
          <div class="char-tone" id="char-tone"></div>
          <div class="char-blurb" id="char-blurb"></div>
        </div>
      </div>
      <div class="char-actions">
        <button type="button" id="btn-char-live">Comentar ply</button>
        <button type="button" id="btn-char-study">Estudio profundo</button>
        <button type="button" id="btn-char-clear">Limpiar feed</button>
      </div>
      <div class="char-study" id="char-study" hidden></div>
      <div class="char-feed" id="char-feed"></div>
    </div>
    <div class="panel panel-h6">
      <h3>H6 · Datasets + rankings</h3>
      <p class="h1-note" id="h6-policy">Rankings supervisados. Nunca auto-reglas.</p>
      <div class="h6-actions">
        <button type="button" id="btn-h6-refresh">Actualizar ranking</button>
        <button type="button" id="btn-h6-export">Exportar datasets JSON</button>
      </div>
      <div class="h6-report" id="h6-report"></div>
    </div>
    <div class="panel panel-story">
      <h3>AIRAM · Relato de la partida</h3>
      <div class="story-head" id="story-head">Todavía no hay partida que contar.</div>
      <div class="story-body" id="story-body"></div>
      <div class="story-replay-bar">
        <button type="button" class="primary" id="btn-replay-stop" disabled>Detener relato</button>
        <span class="story-replay-status" id="story-replay-status"></span>
      </div>
      <div class="passage-list" id="passage-list"></div>
      <div class="passage-explain" id="passage-explain" hidden>
        <div class="passage-explain-head" id="passage-explain-head"></div>
        <div class="passage-explain-grid">
          <section class="voice voice-robotic">
            <h4 id="voice-robotic-title">Voz logística</h4>
            <div id="voice-robotic-body"></div>
          </section>
          <section class="voice voice-emotional">
            <h4 id="voice-emotional-title">Voz afectiva</h4>
            <div id="voice-emotional-tags" class="emotion-tags"></div>
            <div id="voice-emotional-body"></div>
            <div id="voice-emotional-dims" class="emotion-dims"></div>
          </section>
        </div>
      </div>
    </div>
    <div class="panel panel-replay-lab" id="panel-replay-lab" hidden>
      <h3>H0 · Replay Lab</h3>
      <p class="replay-lab-blurb">Sesiones IndexedDB · PASS A (best) ≠ PASS B (top-3) · verificar fingerprints</p>
      <div class="replay-lab-status" id="replay-lab-status"></div>
      <div class="session-list" id="session-list"></div>
    </div>
  </div>
</div>`;
    el.board = $("board");
    el.curvesW = $("curves-w");
    el.curvesB = $("curves-b");
    el.curvesHeadW = $("curves-head-w");
    el.curvesHeadB = $("curves-head-b");
    el.legend = $("legend");
    el.inspector = $("inspector");
    el.causalTrace = $("causal-trace");
    el.musicalState = $("musical-state");
    el.status = $("status");
    el.plyRange = $("ply-range");
    el.plyLabel = $("ply-label");
    el.dimList = $("dim-list");
    el.humanVal = $("human-val");
    el.comment = $("review-comment");
    el.modeChip = $("mode-chip");
    el.modeDesc = $("mode-desc");
    el.rowW = $("row-w");
    el.rowB = $("row-b");
    el.nameW = $("name-w");
    el.nameB = $("name-b");
    el.roleW = $("role-w");
    el.roleB = $("role-b");
    el.avW = $("av-w");
    el.avB = $("av-b");
    el.clockW = $("clock-w");
    el.clockB = $("clock-b");
    el.btnAudio = $("btn-audio");
    el.audioVol = $("audio-vol");
    el.chordLabel = $("chord-label");
    el.storyHead = $("story-head");
    el.storyBody = $("story-body");
    el.passageList = $("passage-list");
    el.passageExplain = $("passage-explain");
    el.passageExplainHead = $("passage-explain-head");
    el.voiceRoboticTitle = $("voice-robotic-title");
    el.voiceRoboticBody = $("voice-robotic-body");
    el.voiceEmotionalTitle = $("voice-emotional-title");
    el.voiceEmotionalTags = $("voice-emotional-tags");
    el.voiceEmotionalBody = $("voice-emotional-body");
    el.voiceEmotionalDims = $("voice-emotional-dims");
    el.btnReplayStop = $("btn-replay-stop");
    el.storyReplayStatus = $("story-replay-status");
    el.healthW = $("health-w");
    el.healthB = $("health-b");
    el.healthPctW = $("health-pct-w");
    el.healthPctB = $("health-pct-b");
    el.healthLabelW = $("health-label-w");
    el.healthLabelB = $("health-label-b");
    el.panelReplayLab = $("panel-replay-lab");
    el.sessionList = $("session-list");
    el.replayLabStatus = $("replay-lab-status");
    el.profileSelect = $("profile-select");
    el.scoreLabel = $("score-label");
    el.scoreA = $("score-a");
    el.scoreB = $("score-b");
    el.scoreDecisions = $("score-decisions");
    el.abStatus = $("ab-status");
    el.worldBanner = $("world-banner");
    el.horizonList = $("horizon-list");
    el.charAvatar = $("char-avatar");
    el.charName = $("char-name");
    el.charTone = $("char-tone");
    el.charBlurb = $("char-blurb");
    el.charFeed = $("char-feed");
    el.charStudy = $("char-study");
    el.h6Policy = $("h6-policy");
    el.h6Report = $("h6-report");
    return true;
  }

  function syncAudioUI() {
    const P = window.AiramH2.Piano;
    if (!P || !el.btnAudio) return;
    const on = P.isEnabled();
    el.btnAudio.classList.toggle("active", on);
    el.btnAudio.textContent = on ? "♪ Piano" : "♪ Mute";
    if (el.audioVol) el.audioVol.value = String(P.getVolume());
  }

  function warmPiano() {
    const P = window.AiramH2.Piano;
    if (!P) return Promise.resolve();
    return P.warm().catch(function () {});
  }

  function voiceCurrentChord(sideMoved) {
    const P = window.AiramH2.Piano;
    const CV = window.AiramH2.ChordVoice;
    const Map = window.AiramH2.MusicalMapV01;
    if (!P || !CV || !Map) return;
    const frame = state.frames[state.frames.length - 1];
    const st = state.states[state.states.length - 1];
    if (!frame || !st || frame.ply < 1) return;
    const { musicalState } = Map.fromGameState(st, frame);
    const chord = CV.chordForPly(st, musicalState, frame, sideMoved);
    if (el.chordLabel) {
      el.chordLabel.textContent =
        chord.label + " · " + chord.mode + (chord.arpeggio ? " · arp" : "");
      el.chordLabel.title = (chord.reason || []).join(" · ");
    }
    if (!P.isEnabled()) return;
    P.playChord(chord.midis, {
      duration: chord.duration,
      velocity: chord.velocity,
      arpeggio: chord.arpeggio,
    }).catch(function () {});
  }

  function setStatus(msg) {
    el.status.textContent = msg;
  }

  async function newSession() {
    clearBotTimer();
    stopReplay();
    clearPassageExplain();
    state.session = window.AiramH2.createSession({ mode: state.mode });
    state.frames = [];
    state.states = [];
    state.reviews = [];
    state.board = window.AiramH2.ChessCore.initialBoard();
    state.castling = window.AiramH2.ChessCore.defaultCastling();
    state.turn = "w";
    state.ply = 0;
    state.selected = null;
    state.legalDest = [];
    state.lastMove = null;
    state.moveLock = false;
    state.posHistory = [
      window.AiramH2.ChessCore.positionKey(
        state.board,
        "w",
        state.castling
      ),
    ];
    // Bot vs Bot: a bit deeper to reduce shuffle
    state.botDepth = state.mode === "bvb" ? 3 : 2;

    const frame0 = window.AiramH2.ChessAdapter.buildInitialFrame(
      state.session.id,
      state.board,
      state.castling
    );
    const st0 = window.AiramH2.RulesetV01.frameToState(frame0, null, []);
    state.frames.push(frame0);
    state.states.push(st0);
    state.session.frame_ids.push(frame0.id);
    state.selectedPly = 0;
    state.scorePair = null;
    state.musicalHorizon = null;
    state.comments = [];
    state.studyComment = null;
    // H4: seed shared harmonic world from profile
    if (window.AiramH2.HarmonicWorld && window.AiramH2.MusicalMapV01) {
      const { musicalState } = window.AiramH2.MusicalMapV01.fromGameState(
        st0,
        frame0
      );
      const profile = window.AiramH2.CharacterProfiles.get(state.profileId);
      state.harmonicWorld = window.AiramH2.HarmonicWorld.seed(
        state.session.id,
        profile,
        musicalState
      );
    } else {
      state.harmonicWorld = null;
    }

    await persistAll();
    refreshAll();
    setStatus(modeLabel() + " · sesión " + state.session.id);
    maybeScheduleBot();
  }

  function modeLabel() {
    return MODES[state.mode].label;
  }

  function isBotSide(color) {
    if (state.mode === "bvb") return true;
    if (state.mode === "pvb") return color === "b";
    return false;
  }

  function humanCanMove() {
    if (state.mode === "bvb") return false;
    if (state.mode === "pvb") return state.turn === "w";
    return true; // pvp
  }

  function clearBotTimer() {
    if (state.botTimer) clearTimeout(state.botTimer);
    state.botTimer = null;
  }

  function setMode(mode) {
    if (!MODES[mode] || mode === state.mode) {
      // still refresh UI if same
      if (MODES[mode]) {
        state.mode = mode;
        updateModeUI();
      }
      return;
    }
    state.mode = mode;
    updateModeUI();
    newSession();
  }

  function updateModeUI() {
    const m = MODES[state.mode];
    document.querySelectorAll("#mode-switch button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === state.mode);
    });
    if (el.modeChip) el.modeChip.textContent = m.chip;
    if (el.modeDesc) el.modeDesc.textContent = m.desc;
    el.nameW.textContent = m.white.name;
    el.nameB.textContent = m.black.name;
    el.roleW.textContent = m.white.role;
    el.roleB.textContent = m.black.role;
    el.avW.textContent = m.white.avatar;
    el.avB.textContent = m.black.avatar;
    el.avW.className = "avatar " + m.white.kind;
    el.avB.className = "avatar " + m.black.kind;
  }

  async function persistAll() {
    state.session.frame_ids = state.frames.map((f) => f.id);
    state.session.review_event_ids = state.reviews.map((r) => r.id);
    state.session.ruleset_version = window.AiramH2.RULESET_VERSION;
    state.session.mode = state.mode;
    await window.AiramH2.Store.saveSessionBundle(
      state.session,
      state.frames,
      state.states,
      state.reviews
    );
  }

  function refreshAll() {
    updateModeUI();
    drawBoard();
    drawCurves();
    renderLegend();
    renderDimList();
    updatePlyNav();
    renderInspector();
    renderH1();
    renderScore();
    renderHorizon();
    renderCharacter();
    renderH6();
    renderStory();
    renderHealth();
  }

  function snapshotAtPly(ply) {
    const C = window.AiramH2.ChessCore;
    let board = C.initialBoard();
    let castling = C.defaultCastling();
    let turn = "w";
    let lastMove = null;
    const max = Math.max(0, Math.min(ply, state.frames.length - 1));
    for (let i = 1; i <= max; i++) {
      const f = state.frames[i];
      if (!f || !f.move_uci || f.move_uci.length < 4) continue;
      const from = algebraicToRC(f.move_uci.slice(0, 2));
      const to = algebraicToRC(f.move_uci.slice(2, 4));
      const applied = C.applyMove(board, from, to, castling);
      board = applied.board;
      castling = applied.rights;
      turn = f.side_to_move;
      lastMove = { from: from, to: to };
    }
    if (state.frames[max] && state.frames[max].castling_rights) {
      castling = C.cloneCastling(state.frames[max].castling_rights);
    }
    return { board: board, castling: castling, turn: turn, lastMove: lastMove, ply: max };
  }

  function isLiveView() {
    return state.selectedPly >= state.frames.length - 1 && !state.replay.active;
  }

  function voiceChordAtPly(ply) {
    const P = window.AiramH2.Piano;
    const CV = window.AiramH2.ChordVoice;
    const Map = window.AiramH2.MusicalMapV01;
    if (!P || !CV || !Map || ply < 1) return;
    const frame = state.frames[ply];
    const st = state.states[ply];
    if (!frame || !st) return;
    const sideMoved = frame.side_to_move === "w" ? "b" : "w";
    const { musicalState } = Map.fromGameState(st, frame);
    const chord = CV.chordForPly(st, musicalState, frame, sideMoved);
    if (el.chordLabel) {
      el.chordLabel.textContent =
        chord.label + " · " + chord.mode + (chord.arpeggio ? " · arp" : "");
      el.chordLabel.title = (chord.reason || []).join(" · ");
    }
    if (!P.isEnabled()) return;
    P.playChord(chord.midis, {
      duration: Math.min(0.85, chord.duration),
      velocity: chord.velocity,
      arpeggio: chord.arpeggio,
    }).catch(function () {});
  }

  function renderHealth() {
    if (!el.healthW) return;
    const f = state.frames[state.selectedPly] || state.frames[state.frames.length - 1];
    const N = window.AiramH2.Narrative;
    if (!f || !N) return;
    const m = MODES[state.mode];
    const hw = N.healthPct((f.material && f.material.w) || 3900);
    const hb = N.healthPct((f.material && f.material.b) || 3900);
    el.healthW.style.width = hw + "%";
    el.healthB.style.width = hb + "%";
    el.healthPctW.textContent = hw + "%";
    el.healthPctB.textContent = hb + "%";
    if (el.healthLabelW) el.healthLabelW.textContent = m.white.name;
    if (el.healthLabelB) el.healthLabelB.textContent = m.black.name;
  }

  function renderStory() {
    if (!el.storyHead || !window.AiramH2.Narrative) return;
    const m = MODES[state.mode];
    const summary = window.AiramH2.Narrative.buildSummary(state.frames, state.states, {
      white: m.white.name,
      black: m.black.name,
    });
    state.summary = summary;
    el.storyHead.textContent = summary.headline;
    el.storyBody.innerHTML = (summary.paragraphs || [])
      .map(function (p) {
        return "<p>" + p + "</p>";
      })
      .join("");
    const selectedStart =
      state.selectedPassage && state.selectedPassage.startPly;
    el.passageList.innerHTML = (summary.passages || [])
      .map(function (p, idx) {
        const active =
          selectedStart != null && selectedStart === p.startPly
            ? " is-active"
            : "";
        return (
          '<article class="passage-card' +
          active +
          '" data-start="' +
          p.startPly +
          '" data-index="' +
          idx +
          '" tabindex="0" role="button">' +
          "<header><strong>" +
          p.title +
          "</strong><span>ply " +
          p.startPly +
          "–" +
          p.endPly +
          "</span></header>" +
          "<p>" +
          p.summary +
          "</p>" +
          '<div class="passage-health">Salud fin: B ' +
          p.healthEnd.w +
          "% · N " +
          p.healthEnd.b +
          "%</div>" +
          '<div class="passage-actions">' +
          '<button type="button" data-explain="' +
          idx +
          '">Preguntar a AIRAM</button>' +
          '<button type="button" data-replay-from="' +
          p.startPly +
          '">▶ Reproducir</button>' +
          "</div>" +
          "</article>"
        );
      })
      .join("");
    el.passageList.querySelectorAll("[data-replay-from]").forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.stopPropagation();
        startReplayFrom(+btn.getAttribute("data-replay-from"));
      };
    });
    el.passageList.querySelectorAll("[data-explain]").forEach(function (btn) {
      btn.onclick = function (ev) {
        ev.stopPropagation();
        explainPassageAt(+btn.getAttribute("data-explain"));
      };
    });
    el.passageList.querySelectorAll(".passage-card").forEach(function (card) {
      card.onclick = function (ev) {
        if (ev.target.closest("button")) return;
        explainPassageAt(+card.getAttribute("data-index"));
      };
      card.onkeydown = function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          explainPassageAt(+card.getAttribute("data-index"));
        }
      };
    });
    if (el.btnReplayStop) {
      el.btnReplayStop.disabled = !state.replay.active;
    }
    if (state.selectedPassage) {
      const still = (summary.passages || []).find(function (p) {
        return p.startPly === state.selectedPassage.startPly;
      });
      if (still) renderPassageExplain(still);
      else clearPassageExplain();
    }
  }

  function clearPassageExplain() {
    state.selectedPassage = null;
    if (!el.passageExplain) return;
    el.passageExplain.hidden = true;
    if (el.passageExplainHead) el.passageExplainHead.textContent = "";
    if (el.voiceRoboticBody) el.voiceRoboticBody.innerHTML = "";
    if (el.voiceEmotionalBody) el.voiceEmotionalBody.innerHTML = "";
    if (el.voiceEmotionalTags) el.voiceEmotionalTags.innerHTML = "";
    if (el.voiceEmotionalDims) el.voiceEmotionalDims.innerHTML = "";
  }

  function explainPassageAt(index) {
    const passages = (state.summary && state.summary.passages) || [];
    const passage = passages[index];
    if (!passage) return;
    state.selectedPassage = passage;
    state.selectedPly = passage.startPly;
    renderPassageExplain(passage);
    el.passageList.querySelectorAll(".passage-card").forEach(function (card, i) {
      card.classList.toggle("is-active", i === index);
    });
    refreshAll();
  }

  function renderPassageExplain(passage) {
    if (!el.passageExplain || !window.AiramH2.Narrative.explainPassage) return;
    const m = MODES[state.mode];
    const expl = window.AiramH2.Narrative.explainPassage(
      state.frames,
      state.states,
      passage,
      { white: m.white.name, black: m.black.name }
    );
    el.passageExplain.hidden = false;
    el.passageExplainHead.textContent =
      "AIRAM sobre «" +
      passage.title +
      "» · ply " +
      passage.startPly +
      "–" +
      passage.endPly;
    el.voiceRoboticTitle.textContent = expl.robotic.title;
    el.voiceRoboticBody.innerHTML =
      (expl.robotic.paragraphs || [])
        .map(function (p) {
          return "<p>" + p + "</p>";
        })
        .join("") +
      '<ul class="voice-events">' +
      (expl.robotic.events || [])
        .map(function (e) {
          return "<li>" + e + "</li>";
        })
        .join("") +
      "</ul>";
    el.voiceEmotionalTitle.textContent = expl.emotional.title;
    el.voiceEmotionalTags.innerHTML = (expl.emotional.emotions || [])
      .map(function (e) {
        return (
          '<span class="emotion-tag" title="' +
          (e.onyx_ref || "") +
          '">' +
          e.label +
          " · " +
          Math.round(e.weight * 100) +
          "%</span>"
        );
      })
      .join("");
    el.voiceEmotionalBody.innerHTML = (expl.emotional.paragraphs || [])
      .map(function (p) {
        return "<p>" + p + "</p>";
      })
      .join("");
    const d = expl.emotional.dimensions || {};
    el.voiceEmotionalDims.innerHTML =
      '<span>V ' +
      (d.valence != null ? d.valence.toFixed(2) : "—") +
      "</span>" +
      "<span>A " +
      (d.arousal != null ? d.arousal.toFixed(2) : "—") +
      "</span>" +
      "<span>I " +
      (d.intensity != null ? d.intensity.toFixed(2) : "—") +
      "</span>" +
      "<span>D " +
      (d.dominance != null ? d.dominance.toFixed(2) : "—") +
      "</span>" +
      (expl.emotional.lexicon
        ? '<span class="lex-src">' + expl.emotional.lexicon + "</span>"
        : "");
  }

  function stopReplay() {
    if (state.replay.timer) clearTimeout(state.replay.timer);
    state.replay.timer = null;
    state.replay.active = false;
    if (el.btnReplayStop) el.btnReplayStop.disabled = true;
    if (el.storyReplayStatus) el.storyReplayStatus.textContent = "";
  }

  function startReplayFrom(fromPly) {
    clearBotTimer();
    stopReplay();
    warmPiano();
    const toPly = Math.max(0, state.frames.length - 1);
    const start = Math.max(0, Math.min(fromPly, toPly));
    state.replay.active = true;
    state.replay.fromPly = start;
    state.replay.toPly = toPly;
    state.replay.cursor = start;
    if (el.btnReplayStop) el.btnReplayStop.disabled = false;
    if (el.storyReplayStatus) {
      el.storyReplayStatus.textContent =
        "Reproduciendo ply " + start + " → " + toPly + " (Detener para parar)";
    }
    stepReplay();
  }

  function stepReplay() {
    if (!state.replay.active) return;
    const ply = state.replay.cursor;
    if (ply > state.replay.toPly) {
      stopReplay();
      if (el.storyReplayStatus) el.storyReplayStatus.textContent = "Relato terminado.";
      return;
    }
    state.selectedPly = ply;
    refreshAll();
    if (ply >= 1) voiceChordAtPly(ply);
    if (el.storyReplayStatus) {
      el.storyReplayStatus.textContent =
        "Relato · ply " + ply + " / " + state.replay.toPly;
    }
    state.replay.cursor = ply + 1;
    state.replay.timer = setTimeout(stepReplay, state.mode === "bvb" ? 520 : 650);
  }

  function drawBoard() {
    const FILES = "abcdefgh";
    el.board.innerHTML = "";
    const snap = snapshotAtPly(state.selectedPly);
    const viewBoard = snap.board;
    const viewLast = snap.lastMove;
    const atLive = state.selectedPly >= state.frames.length - 1 && !state.replay.active;
    const legalSet = new Set(
      atLive ? state.legalDest.map((d) => d[0] + "," + d[1]) : []
    );
    const lastFrom =
      viewLast && viewLast.from
        ? viewLast.from[0] + "," + viewLast.from[1]
        : null;
    const lastTo =
      viewLast && viewLast.to ? viewLast.to[0] + "," + viewLast.to[1] : null;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement("div");
        const light = (r + c) % 2 === 0;
        const key = r + "," + c;
        const p = viewBoard[r][c];
        sq.className = "sq " + (light ? "light" : "dark");
        if (p) sq.classList.add("has-piece");
        if (
          atLive &&
          state.selected &&
          state.selected[0] === r &&
          state.selected[1] === c
        )
          sq.classList.add("sel");
        if (legalSet.has(key)) sq.classList.add("legal");
        if (key === lastFrom || key === lastTo) sq.classList.add("last");

        if (r === 7) {
          const lab = document.createElement("span");
          lab.className = "coord file";
          lab.textContent = FILES[c];
          sq.appendChild(lab);
        }
        if (c === 0) {
          const lab = document.createElement("span");
          lab.className = "coord rank";
          lab.textContent = String(8 - r);
          sq.appendChild(lab);
        }

        if (p && window.AiramH2.Pieces) {
          sq.insertAdjacentHTML("beforeend", window.AiramH2.Pieces.pieceHtml(p));
        }
        sq.dataset.r = r;
        sq.dataset.c = c;
        sq.addEventListener("click", onSquareClick);
        el.board.appendChild(sq);
      }
    }

    const viewTurn = atLive ? state.turn : snap.turn;
    if (el.rowW && el.rowB) {
      el.rowW.classList.toggle("active", viewTurn === "w");
      el.rowB.classList.toggle("active", viewTurn === "b");
      el.clockW.textContent = viewTurn === "w" ? "▶" : "·";
      el.clockB.textContent = viewTurn === "b" ? "▶" : "·";
    }
    if (el.board) {
      el.board.classList.toggle(
        "board-locked",
        !humanCanMove() || !atLive || state.replay.active
      );
    }
  }

  function onSquareClick(ev) {
    if (state.replay.active) return;
    if (!isLiveView()) {
      // Jump back to live tip to allow play
      state.selectedPly = state.frames.length - 1;
      refreshAll();
      return;
    }
    if (!humanCanMove()) return;
    const r = +ev.currentTarget.dataset.r;
    const c = +ev.currentTarget.dataset.c;
    const C = window.AiramH2.ChessCore;
    const p = state.board[r][c];
    if (state.selected) {
      const dest = state.legalDest.find((d) => d[0] === r && d[1] === c);
      if (dest) {
        playMove(state.selected, dest);
        return;
      }
    }
    if (p && C.pieceColor(p) === state.turn) {
      state.selected = [r, c];
      state.legalDest = C.legalMovesFor(state.board, r, c, state.castling);
    } else {
      state.selected = null;
      state.legalDest = [];
    }
    drawBoard();
  }

  async function playMove(from, to) {
    if (state.moveLock) return;
    state.moveLock = true;
    const C = window.AiramH2.ChessCore;
    try {
      // Reject illegal moves (guards bot / UI races)
      const legal = C.legalMovesFor(
        state.board,
        from[0],
        from[1],
        state.castling
      );
      if (!legal.some((d) => d[0] === to[0] && d[1] === to[1])) {
        setStatus("Jugada ilegal ignorada · " + modeLabel());
        return;
      }

      const before = C.cloneBoard(state.board);
      const sideMoved = state.turn;
      const rightsBefore = C.cloneCastling(state.castling);
      const { board, captured, piece, rights, isCastle } = C.applyMove(
        state.board,
        from,
        to,
        state.castling
      );
      state.board = board;
      state.castling = rights;
      state.turn = sideMoved === "w" ? "b" : "w";
      state.ply += 1;
      state.selected = null;
      state.legalDest = [];
      state.lastMove = { from: from.slice(), to: to.slice() };

      const posKey = C.positionKey(state.board, state.turn, state.castling);
      state.posHistory.push(posKey);
      const repeats = state.posHistory.filter((k) => k === posKey).length;

      const frame = window.AiramH2.ChessAdapter.buildFrameAfterMove(
        state.session.id,
        state.ply,
        before,
        board,
        { from, to, captured, piece, isCastle },
        {
          sideMoved,
          botDepth: isBotSide(sideMoved) ? state.botDepth : null,
          rightsAfter: rights,
          rightsBefore: rightsBefore,
          horizonDepth: 2,
          multipv: 3,
        }
      );

      if (repeats >= 3) {
        frame.ended = "repetition";
        frame.tags = (frame.tags || []).concat(["repetition"]);
      }
      if (state.ply >= 200) {
        frame.ended = frame.ended || "ply_limit";
        frame.tags = (frame.tags || []).concat(["ply_limit"]);
      }

      const prev = state.states[state.states.length - 1] || null;
      const hist = state.frames.slice();
      const st = window.AiramH2.RulesetV01.frameToState(frame, prev, hist);
      state.frames.push(frame);
      state.states.push(st);
      state.selectedPly = state.ply;

      // H4: commit score A into shared harmonic world
      if (
        window.AiramH2.HarmonicWorld &&
        window.AiramH2.ScorePlanner &&
        window.AiramH2.MusicalMapV01
      ) {
        if (!state.harmonicWorld) {
          const profile = window.AiramH2.CharacterProfiles.get(state.profileId);
          const { musicalState: ms0 } =
            window.AiramH2.MusicalMapV01.fromGameState(st, frame);
          state.harmonicWorld = window.AiramH2.HarmonicWorld.seed(
            state.session.id,
            profile,
            ms0
          );
        }
        const { musicalState } = window.AiramH2.MusicalMapV01.fromGameState(
          st,
          frame
        );
        const agentView = window.AiramH2.HarmonicWorld.viewForAgent(
          state.harmonicWorld,
          sideMoved
        );
        const scored = window.AiramH2.ScorePlanner.planVariant(
          st,
          musicalState,
          frame,
          window.AiramH2.CharacterProfiles.get(state.profileId),
          "A",
          { world: agentView }
        );
        window.AiramH2.HarmonicWorld.commit(
          state.harmonicWorld,
          scored,
          sideMoved,
          state.ply
        );
      }

      refreshAll();
      pushLiveComment(true);
      voiceCurrentChord(sideMoved);
      // Persist in background — don't stall the bot loop on IndexedDB
      persistAll().catch(function (err) {
        console.warn("AIRAM persist", err);
      });

      if (frame.ended) {
        clearBotTimer();
        const endLabel = {
          checkmate: "Jaque mate",
          stalemate: "Tablas (ahogado)",
          repetition: "Tablas (triple repetición)",
          ply_limit: "Partida cortada (límite de plies)",
        };
        setStatus(
          (endLabel[frame.ended] || frame.ended) +
            " · " +
            modeLabel() +
            " · ply " +
            state.ply
        );
        return;
      }
      maybeScheduleBot();
    } finally {
      state.moveLock = false;
    }
  }

  function recentAvoidKeys() {
    // Avoid recreating positions seen in the last few plies (anti ping-pong)
    const set = new Set();
    const hist = state.posHistory || [];
    const start = Math.max(0, hist.length - 8);
    for (let i = start; i < hist.length; i++) set.add(hist[i]);
    return set;
  }

  function maybeScheduleBot() {
    clearBotTimer();
    if (!isBotSide(state.turn)) return;
    const last = state.frames[state.frames.length - 1];
    if (last && last.ended) return;
    const delay = state.mode === "bvb" ? 380 : 420;
    state.botTimer = setTimeout(async () => {
      if (state.moveLock) {
        maybeScheduleBot();
        return;
      }
      if (!isBotSide(state.turn)) return;
      const C = window.AiramH2.ChessCore;
      const move = C.chooseBotMove(
        state.board,
        state.turn,
        state.botDepth,
        state.castling,
        { avoidKeys: recentAvoidKeys(), preferDiverse: true }
      );
      if (!move) {
        // No legal move but frame not marked — force end state
        const check = C.inCheck(state.board, state.turn);
        setStatus(
          (check ? "Jaque mate" : "Tablas") +
            " · " +
            modeLabel() +
            " · ply " +
            state.ply
        );
        return;
      }
      await playMove(move.from, move.to);
    }, delay);
  }

  function stopBot() {
    // legacy no-op kept for any stray calls
    clearBotTimer();
  }

  function updatePlyNav() {
    const max = Math.max(0, state.frames.length - 1);
    el.plyRange.max = String(max);
    el.plyRange.value = String(state.selectedPly);
    el.plyLabel.textContent = "ply " + state.selectedPly;
  }

  function playerLabel(side) {
    const m = MODES[state.mode];
    if (side === "w") return m.white.name + " · Blancas";
    return m.black.name + " · Negras";
  }

  /** Ply indices belonging to a side (0 = start on white chart only). */
  function pliesForSide(side) {
    const out = [];
    for (let i = 0; i < state.frames.length; i++) {
      if (i === 0) {
        if (side === "w") out.push(0);
        continue;
      }
      const f = state.frames[i];
      const mover = f.side_to_move === "w" ? "b" : "w";
      if (mover === side) out.push(i);
    }
    return out;
  }

  function dimValueForSide(dim, raw, side) {
    if (dim === "advantage") return side === "w" ? raw : -raw;
    return raw;
  }

  function renderLegend() {
    el.legend.innerHTML = DIMS.map((d) => {
      const on = state.visibleDims[d];
      const meta = DIM_META[d] || { label: d, blurb: "" };
      return `<button type="button" class="legend-item${on ? "" : " off"}${
        state.selectedDim === d ? " selected" : ""
      }" data-dim="${d}" title="Clic: mostrar/ocultar · doble uso en inspector">
        <i style="background:${COLORS[d]}"></i>
        <span class="legend-text">
          <strong>${meta.label}</strong>
          <em>${d}</em>
          <small>${meta.blurb}</small>
        </span>
      </button>`;
    }).join("");
    el.legend.querySelectorAll(".legend-item").forEach((btn) => {
      btn.onclick = () => {
        const d = btn.dataset.dim;
        state.visibleDims[d] = !state.visibleDims[d];
        state.selectedDim = d;
        renderLegend();
        renderDimList();
        renderInspector();
        drawCurves();
      };
    });
  }

  function renderDimList() {
    el.dimList.innerHTML = DIMS.map((d) => {
      const meta = DIM_META[d] || { label: d };
      return `<button type="button" data-dim="${d}" class="${
        state.selectedDim === d ? "active" : ""
      }" title="${(DIM_META[d] && DIM_META[d].blurb) || ""}">${meta.label}</button>`;
    }).join("");
    el.dimList.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        state.selectedDim = b.dataset.dim;
        renderDimList();
        renderLegend();
        renderInspector();
        drawCurves();
      };
    });
  }

  function drawOneCurve(canvas, side) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "#0c0d0f";
    ctx.fillRect(0, 0, w, h);

    // zero / mid guides
    ctx.strokeStyle = "#2c2c2f";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.fillStyle = "#3a3a3e";
    ctx.font = "10px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(side === "w" ? "mejor blancas ↑" : "mejor negras ↑", 8, 14);
    ctx.fillText("0", 8, h / 2 - 4);

    const idxs = pliesForSide(side);
    const n = idxs.length;
    if (n < 1) {
      ctx.fillStyle = "#6a6a70";
      ctx.fillText("Sin plies aún", 8, h / 2 + 16);
      return;
    }

    function yFor(dim, value) {
      if (dim === "advantage") return h / 2 - value * (h / 2 - 10);
      return h - 10 - value * (h - 20);
    }

    for (const d of DIMS) {
      if (!state.visibleDims[d]) continue;
      ctx.strokeStyle = COLORS[d];
      ctx.lineWidth = d === state.selectedDim ? 2.6 : 1.3;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const st = state.states[idxs[i]];
        if (!st || !st.current[d]) continue;
        const raw = st.current[d].value;
        const v = dimValueForSide(d, raw, side);
        const x = n === 1 ? w / 2 : (i / (n - 1)) * (w - 1);
        const y = yFor(d, v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // selected ply marker if this side owns it (or ply 0 on white)
    const selIdx = idxs.indexOf(state.selectedPly);
    if (selIdx >= 0) {
      const x = n === 1 ? w / 2 : (selIdx / (n - 1)) * (w - 1);
      ctx.strokeStyle = "#f4f4f5";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function drawCurves() {
    if (el.curvesHeadW) el.curvesHeadW.textContent = playerLabel("w");
    if (el.curvesHeadB) el.curvesHeadB.textContent = playerLabel("b");
    drawOneCurve(el.curvesW, "w");
    drawOneCurve(el.curvesB, "b");
  }

  function pickPlyFromCanvas(ev, canvas, side) {
    stopReplay();
    const idxs = pliesForSide(side);
    if (idxs.length < 1) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = (ev.clientX - rect.left) / Math.max(1, rect.width);
    if (idxs.length === 1) {
      state.selectedPly = idxs[0];
    } else {
      const i = Math.round(ratio * (idxs.length - 1));
      state.selectedPly = idxs[Math.max(0, Math.min(idxs.length - 1, i))];
    }
    refreshAll();
  }

  function renderInspector() {
    const frame = state.frames[state.selectedPly];
    const st = state.states[state.selectedPly];
    if (!frame || !st) {
      el.inspector.textContent = "Sin datos";
      return;
    }
    const d = state.selectedDim;
    const meta = DIM_META[d] || { label: d, blurb: "" };
    const dim = st.current[d];
    const trendArrow =
      d in st.trend
        ? st.trend[d] > 0.02
          ? '<span class="up">↑</span>'
          : st.trend[d] < -0.02
            ? '<span class="down">↓</span>'
            : "→"
        : "";

    const comps = Object.entries(dim.components || {})
      .filter(([k]) => k !== "note")
      .map(([k, v]) => {
        if (typeof v === "number") {
          const sign = v > 0 ? "+" : "";
          return `<li>${k}: ${sign}${v}</li>`;
        }
        return `<li>${k}: ${v}</li>`;
      })
      .join("");
    const note = dim.components && dim.components.note
      ? `<p class="debt">${dim.components.note}</p>`
      : "";

    el.inspector.innerHTML = `
<div class="dim-block">
  <div><strong>${meta.label}</strong> <code>${d}</code> ${Number(dim.value).toFixed(2)} ${trendArrow}</div>
  <p class="dim-blurb">${meta.blurb || ""}</p>
  <div>rule_version: ${dim.rule_version}</div>
  <ul class="comps">${comps}</ul>
  ${note}
</div>
<div class="dim-block">
  <strong>TREND</strong>
  <pre>${JSON.stringify(st.trend, null, 2)}</pre>
</div>
<div class="dim-block">
  <strong>MEMORY</strong>
  <pre>${JSON.stringify(st.memory, null, 2)}</pre>
</div>
<div class="dim-block">
  <strong>GAME FRAME</strong>
  <pre>ply ${frame.ply}  ${frame.move_uci || "(start)"}  tags: ${(frame.tags || []).join(", ")}
eval ${frame.eval_before_cp} → ${frame.eval_cp} (Δ ${frame.eval_delta_cp})
check ${frame.check}  capture ${frame.capture}  legal ${frame.legal_move_count}
fen ${frame.fen}
best ${frame.best_move || "—"}  pv ${(frame.pv || []).join(" ") || "—"}
PASS B ${(frame.candidates || [])
  .map(function (c) {
    return "#" + c.rank + " " + c.uci + " (" + c.score_cp + ")";
  })
  .join(" · ") || "—"}
horizon rank ${
      frame.horizon && frame.horizon.played_rank != null
        ? frame.horizon.played_rank
        : "—"
    }  gap→best ${
      frame.horizon && frame.horizon.score_gap_to_best_cp != null
        ? frame.horizon.score_gap_to_best_cp
        : "—"
    } cp
wdl ${
      frame.wdl
        ? "W" + frame.wdl.w + " D" + frame.wdl.d + " L" + frame.wdl.l
        : "—"
    }
engine ${
      (frame.engine && frame.engine.kind) || "?"
    } d${(frame.engine && frame.engine.depth) || "?"} mpv${
      (frame.engine && frame.engine.multipv) || "?"
    }
session_id ${frame.session_id}
frame_id ${frame.id}
source_frame_id (state) ${st.source_frame_id}
ruleset_version ${st.ruleset_version}</pre>
</div>`;
  }

  function renderH1() {
    if (!el.causalTrace || !el.musicalState) return;
    const frame = state.frames[state.selectedPly];
    const st = state.states[state.selectedPly];
    if (!frame || !st || !window.AiramH2.MusicalMapV01) {
      el.causalTrace.textContent = "Sin datos";
      el.musicalState.textContent = "Sin datos";
      return;
    }
    const { causalTrace, musicalState } = window.AiramH2.MusicalMapV01.fromGameState(
      st,
      frame
    );
    const obs = (causalTrace.observations || [])
      .map((o) => `<li><code>${o}</code></li>`)
      .join("");
    const ev = (causalTrace.evidence || [])
      .map(
        (e) =>
          `<li><strong>${e.feature}</strong> ${e.value} ← ${(e.causes || []).join(", ")}</li>`
      )
      .join("");
    el.causalTrace.innerHTML = `
<div class="dim-block">
  <strong>observations</strong>
  <ul class="comps">${obs || "<li>—</li>"}</ul>
</div>
<div class="dim-block">
  <strong>evidence</strong>
  <ul class="comps">${ev || "<li>—</li>"}</ul>
</div>
<div class="dim-block"><pre>map ${causalTrace.map_version} · ruleset ${causalTrace.ruleset_version}</pre></div>`;

    const params = Object.entries(musicalState.params || {})
      .map(([k, p]) => {
        const pct = Math.round((p.value || 0) * 100);
        return `<li><strong>${k}</strong> ${Number(p.value).toFixed(2)}
          <span class="meter"><i style="width:${pct}%"></i></span></li>`;
      })
      .join("");
    const reasons = (musicalState.reason || [])
      .map(
        (r) =>
          `<li><code>${r.observation}</code> → ${(r.maps_to || []).join(", ")}</li>`
      )
      .join("");
    el.musicalState.innerHTML = `
<div class="dim-block">
  <strong>params</strong>
  <ul class="comps meter-list">${params}</ul>
</div>
<div class="dim-block">
  <strong>reason</strong>
  <ul class="comps">${reasons || "<li>—</li>"}</ul>
</div>
<div class="dim-block"><pre>map ${musicalState.map_version} · H1 Score debajo</pre></div>`;
  }

  function fillProfileSelect() {
    if (!el.profileSelect || !window.AiramH2.CharacterProfiles) return;
    const list = window.AiramH2.CharacterProfiles.list();
    el.profileSelect.innerHTML = list
      .map(function (p) {
        return (
          '<option value="' +
          p.id +
          '"' +
          (p.id === state.profileId ? " selected" : "") +
          ">" +
          p.label +
          "</option>"
        );
      })
      .join("");
  }

  function planScoreAtPly() {
    if (!window.AiramH2.ScorePlanner || !window.AiramH2.MusicalMapV01) return null;
    const frame = state.frames[state.selectedPly];
    const st = state.states[state.selectedPly];
    if (!frame || !st) return null;
    const { musicalState } = window.AiramH2.MusicalMapV01.fromGameState(st, frame);
    const side =
      frame.ply < 1 ? "w" : frame.side_to_move === "w" ? "b" : "w";
    const worldView =
      state.harmonicWorld && window.AiramH2.HarmonicWorld
        ? window.AiramH2.HarmonicWorld.viewForAgent(state.harmonicWorld, side)
        : null;
    const pair = window.AiramH2.ScorePlanner.planPair(
      st,
      musicalState,
      frame,
      state.profileId,
      { world: worldView }
    );
    state.scorePair = pair;
    state.abVerdict = null;
    return pair;
  }

  function renderHorizon() {
    if (!el.horizonList) return;
    if (el.worldBanner) {
      el.worldBanner.textContent = window.AiramH2.HarmonicWorld
        ? window.AiramH2.HarmonicWorld.summary(state.harmonicWorld)
        : "—";
    }
    if (!window.AiramH2.MusicalHorizon || !window.AiramH2.MusicalMapV01) {
      el.horizonList.innerHTML = "";
      return;
    }
    const frame = state.frames[state.selectedPly];
    const st = state.states[state.selectedPly];
    if (!frame || !st) {
      el.horizonList.innerHTML = "";
      return;
    }
    const { musicalState } = window.AiramH2.MusicalMapV01.fromGameState(st, frame);

    // Live PASS B on current board (futures for side to move)
    let liveFrame = frame;
    if (
      window.AiramH2.HorizonEngine &&
      state.selectedPly >= state.frames.length - 1
    ) {
      const snap = snapshotAtPly(state.selectedPly);
      const analysis = window.AiramH2.HorizonEngine.analyzePosition(
        snap.board,
        state.turn,
        snap.castling || state.castling,
        { depth: 2, multipv: 3 }
      );
      liveFrame = Object.assign({}, frame, {
        candidates: analysis.pass_b.candidates,
        best_move: analysis.pass_a.best_move,
        pass_a: analysis.pass_a,
        side_to_move: state.turn,
      });
    }

    const hz = window.AiramH2.MusicalHorizon.buildHorizon(
      st,
      musicalState,
      liveFrame,
      state.profileId,
      state.harmonicWorld
    );
    state.musicalHorizon = hz;
    if (!hz.futures.length) {
      el.horizonList.innerHTML =
        '<p class="muted">Sin candidatos — juega o reanaliza H0.</p>';
      return;
    }
    el.horizonList.innerHTML = hz.futures
      .map(function (f, i) {
        return (
          '<article class="horizon-card" data-hz="' +
          i +
          '">' +
          "<header><strong>#" +
          f.rank +
          " " +
          f.uci +
          "</strong><span>" +
          f.score_cp +
          " cp · gap " +
          f.gap_to_best_cp +
          "</span></header>" +
          "<p>" +
          f.reason +
          "</p>" +
          "<code>" +
          (f.score.bars || [])
            .map(function (b) {
              return b.harmony && b.harmony[0] ? b.harmony[0].rn : "?";
            })
            .join(" – ") +
          "</code>" +
          '<button type="button" data-play-hz="' +
          i +
          '">▶ Futuro</button>' +
          "</article>"
        );
      })
      .join("");
    el.horizonList.querySelectorAll("[data-play-hz]").forEach(function (btn) {
      btn.onclick = function () {
        const i = +btn.getAttribute("data-play-hz");
        const fut = state.musicalHorizon && state.musicalHorizon.futures[i];
        if (!fut) return;
        warmPiano();
        if (!window.AiramH2.Piano.isEnabled()) {
          window.AiramH2.Piano.setEnabled(true);
          syncAudioUI();
        }
        setStatus("H3 horizonte · #" + fut.rank + " " + fut.uci);
        window.AiramH2.Piano.playScore(fut.score, "all");
      };
    });
  }

  function buildCommentContext() {
    const frame = state.frames[state.selectedPly];
    const st = state.states[state.selectedPly];
    if (!frame || !st || !window.AiramH2.MusicalMapV01) return null;
    const mapped = window.AiramH2.MusicalMapV01.fromGameState(st, frame);
    return window.AiramH2.CharacterCommenter.buildContext({
      profileId: state.profileId,
      frame: frame,
      gameState: st,
      musicalState: mapped.musicalState,
      causalTrace: mapped.causalTrace,
      world: state.harmonicWorld,
      scorePair: state.scorePair,
      scoreA: state.scorePair && state.scorePair.A,
      horizon: state.musicalHorizon,
    });
  }

  function pushLiveComment(force) {
    if (!window.AiramH2.CharacterCommenter) return;
    // Ensure score + horizon are fresh for this ply
    planScoreAtPly();
    renderHorizon();
    const ctx = buildCommentContext();
    if (!ctx || !ctx.frame || ctx.frame.ply < 1) return;
    // Avoid duplicate for same ply unless forced
    if (
      !force &&
      state.comments.length &&
      state.comments[0].ply === ctx.frame.ply &&
      state.comments[0].profile_id === state.profileId
    ) {
      return;
    }
    const c = window.AiramH2.CharacterCommenter.commentLive(ctx);
    state.comments.unshift(c);
    if (state.comments.length > 40) state.comments.length = 40;
    renderCharacterFeed();
  }

  function runStudyComment() {
    if (!window.AiramH2.CharacterCommenter) return;
    planScoreAtPly();
    renderHorizon();
    const ctx = buildCommentContext();
    if (!ctx) return;
    state.studyComment = window.AiramH2.CharacterCommenter.commentStudy(ctx);
    renderCharacter();
    setStatus(
      "H5 estudio · " +
        state.profileId +
        " · ply " +
        (ctx.frame && ctx.frame.ply)
    );
  }

  function renderCharacter() {
    const profile = window.AiramH2.CharacterProfiles
      ? window.AiramH2.CharacterProfiles.get(state.profileId)
      : null;
    const voice = window.AiramH2.CharacterVoices
      ? window.AiramH2.CharacterVoices.get(state.profileId)
      : null;
    if (el.charName && profile) {
      el.charName.textContent = profile.label;
      el.charName.style.color = profile.color || "";
    }
    if (el.charTone && voice) {
      el.charTone.textContent = voice.tone + " · te habla de " + voice.address;
    }
    if (el.charBlurb && profile) {
      el.charBlurb.textContent = profile.blurb || "";
    }
    if (el.charAvatar && profile) {
      const initials = (profile.label || "?")
        .split(/\s+/)
        .map(function (w) {
          return w[0];
        })
        .join("")
        .slice(0, 2)
        .toUpperCase();
      el.charAvatar.textContent = initials;
      el.charAvatar.style.background =
        (profile.color || "#81b64c") + "33";
      el.charAvatar.style.borderColor = profile.color || "#81b64c";
    }
    if (el.charStudy) {
      if (state.studyComment) {
        el.charStudy.hidden = false;
        el.charStudy.innerHTML =
          "<h4>" +
          state.studyComment.headline +
          "</h4>" +
          state.studyComment.lines
            .map(function (l) {
              return (
                '<p class="line-' +
                l.kind +
                '">' +
                l.text +
                "</p>"
              );
            })
            .join("");
      } else {
        el.charStudy.hidden = true;
        el.charStudy.innerHTML = "";
      }
    }
    renderCharacterFeed();
  }

  function renderCharacterFeed() {
    if (!el.charFeed) return;
    if (!state.comments.length) {
      el.charFeed.innerHTML =
        '<p class="muted">Los comentarios del personaje aparecen al jugar (o pulsa Comentar ply).</p>';
      return;
    }
    el.charFeed.innerHTML = state.comments
      .map(function (c) {
        return (
          '<article class="char-bubble" data-ply="' +
          c.ply +
          '">' +
          "<header><strong>ply " +
          c.ply +
          "</strong><span>" +
          c.profile_id +
          "</span></header>" +
          c.lines
            .map(function (l) {
              return '<p class="line-' + l.kind + '">' + l.text + "</p>";
            })
            .join("") +
          "</article>"
        );
      })
      .join("");
    el.charFeed.querySelectorAll(".char-bubble").forEach(function (bub) {
      bub.onclick = function () {
        state.selectedPly = +bub.getAttribute("data-ply");
        refreshAll();
      };
    });
  }

  function renderScoreBlock(score) {
    if (!score) return "<pre>—</pre>";
    const prog = (score.bars || [])
      .map(function (b) {
        return b.harmony && b.harmony[0] ? b.harmony[0].rn : "?";
      })
      .join(" – ");
    return (
      "<pre>" +
      (score.label || "") +
      "\n" +
      score.key.tonic +
      " " +
      score.key.mode +
      " · " +
      score.tempo_bpm +
      " bpm · " +
      (score.bars || []).length +
      " compases\n" +
      prog +
      "\nperfil " +
      score.profile_id +
      " · " +
      score.planner_version +
      "</pre>"
    );
  }

  function renderScore() {
    if (!el.scoreA) return;
    if (!state.scorePair) {
      // auto-plan when ply changes if we have data
      if (state.frames.length && window.AiramH2.ScorePlanner) {
        planScoreAtPly();
      }
    } else {
      // refresh plan for current ply
      planScoreAtPly();
    }
    const pair = state.scorePair;
    if (!pair) {
      if (el.scoreLabel) el.scoreLabel.textContent = "Sin propuesta aún.";
      el.scoreA.innerHTML = "<pre>—</pre>";
      el.scoreB.innerHTML = "<pre>—</pre>";
      if (el.scoreDecisions) el.scoreDecisions.innerHTML = "";
      return;
    }
    if (el.scoreLabel) {
      el.scoreLabel.textContent =
        pair.profile.label +
        " · ply " +
        state.selectedPly +
        (state.abVerdict ? " · A/B: " + state.abVerdict : "");
      el.scoreLabel.style.borderColor = pair.profile.color || "";
    }
    el.scoreA.innerHTML = renderScoreBlock(pair.A);
    el.scoreB.innerHTML = renderScoreBlock(pair.B);
    if (el.scoreDecisions) {
      el.scoreDecisions.innerHTML = (pair.A.decisions || [])
        .map(function (d) {
          return (
            "<li><strong>" +
            d.what +
            "</strong> → <code>" +
            d.choice +
            "</code> · " +
            d.reason +
            "</li>"
          );
        })
        .join("");
    }
    if (el.abStatus) {
      el.abStatus.textContent = state.abVerdict
        ? "Guardado: " + state.abVerdict
        : "";
    }
  }

  async function playVariant(which, stem) {
    warmPiano();
    const pair = state.scorePair || planScoreAtPly();
    if (!pair) {
      setStatus("Nada que tocar · juega o elige un ply");
      return;
    }
    const score = which === "B" ? pair.B : pair.A;
    if (!window.AiramH2.Piano.isEnabled()) {
      window.AiramH2.Piano.setEnabled(true);
      syncAudioUI();
    }
    setStatus(
      "H2 · tocando variante " + score.variant + (stem ? " · " + stem : "")
    );
    await window.AiramH2.Piano.playScore(score, stem || "all");
    if (el.chordLabel) {
      el.chordLabel.textContent =
        score.variant +
        " · " +
        (score.bars[0] && score.bars[0].harmony[0]
          ? score.bars[0].harmony[0].rn
          : "?") +
        " · " +
        score.tempo_bpm +
        "bpm";
    }
  }

  async function saveAbVerdict(verdict) {
    state.abVerdict = verdict;
    const frame = state.frames[state.selectedPly];
    const st = state.states[state.selectedPly];
    const pair = state.scorePair;
    if (!frame || !st || !pair) return;
    const rev = window.AiramH2.createReviewEvent({
      session_id: state.session.id,
      source_frame_id: frame.id,
      ruleset_version: st.ruleset_version,
      target_type: "score_proposal",
      target_id: pair.A.id,
      dimension: "aesthetic",
      dataset_kind: "aesthetic",
      profile_id: state.profileId,
      verdict: verdict,
      comment:
        "A/B · profile " +
        state.profileId +
        " · A=" +
        pair.A.label +
        " · B=" +
        pair.B.label,
      before: { variant: "A", score_id: pair.A.id },
      after: { variant: "B", score_id: pair.B.id, preference: verdict },
    });
    state.reviews.push(rev);
    await persistAll();
    if (el.abStatus) el.abStatus.textContent = "Guardado: " + verdict;
    setStatus("A/B review · " + verdict + " · total " + state.reviews.length);
    renderH6();
  }

  async function saveReview(verdict, opts) {
    opts = opts || {};
    const frame = state.frames[state.selectedPly];
    const st = state.states[state.selectedPly];
    if (!frame || !st) return;
    const datasetKind = opts.dataset_kind || "game_validity";
    const d =
      opts.dimension ||
      (datasetKind === "identity"
        ? "identity"
        : datasetKind === "music_validity"
          ? "music_validity"
          : state.selectedDim);
    const humanRaw = el.humanVal.value;
    const human =
      humanRaw === ""
        ? null
        : clampNum(parseFloat(humanRaw), d === "advantage" ? -1 : 0, 1);
    const before = { dimension: d, value: st.current[d] ? st.current[d].value : null };
    const after =
      verdict === "modify" && human != null
        ? { dimension: d, value: human }
        : null;
    const rev = window.AiramH2.createReviewEvent({
      session_id: state.session.id,
      source_frame_id: frame.id,
      ruleset_version: st.ruleset_version,
      target_type:
        datasetKind === "music_validity"
          ? "musical_state"
          : datasetKind === "identity"
            ? "character_profile"
            : "game_state",
      target_id:
        datasetKind === "identity"
          ? state.profileId
          : st.id,
      dimension: d,
      dataset_kind: datasetKind,
      profile_id: state.profileId,
      verdict,
      comment: el.comment.value || opts.comment || "",
      before,
      after,
    });
    state.reviews.push(rev);
    await persistAll();
    setStatus(
      "Review " +
        datasetKind +
        " · " +
        verdict +
        " · " +
        d +
        " @ ply " +
        frame.ply +
        " · total " +
        state.reviews.length
    );
    el.comment.value = "";
    el.humanVal.value = "";
    renderH6();
  }

  function renderH6() {
    if (!el.h6Report || !window.AiramH2.Datasets) return;
    const D = window.AiramH2.Datasets;
    if (el.h6Policy) el.h6Policy.textContent = D.POLICY;
    const report = D.buildReport(state.reviews);
    const parts = D.DATASET_KINDS.map(function (dk) {
      const block = report.by_kind[dk.id];
      const t = block.tally;
      const top = (block.by_profile || [])
        .slice(0, 3)
        .map(function (r) {
          return (
            "<li><code>" +
            r.key +
            "</code> mean " +
            r.mean +
            " · n=" +
            r.n +
            "</li>"
          );
        })
        .join("");
      return (
        '<section class="h6-kind">' +
        "<header><strong>" +
        dk.label +
        "</strong><span>n=" +
        t.n +
        " · Σ " +
        t.score +
        "</span></header>" +
        '<p class="muted">' +
        dk.blurb +
        "</p>" +
        "<pre>✅" +
        t.accept +
        " ❌" +
        t.reject +
        " 🤔" +
        t.unsure +
        " ✏️" +
        t.modify +
        " · A" +
        t.prefer_a +
        "/B" +
        t.prefer_b +
        " · mean " +
        (t.mean || 0).toFixed(2) +
        "</pre>" +
        (top
          ? '<ul class="comps">' + top + "</ul>"
          : '<p class="muted">Sin datos aún.</p>') +
        "</section>"
      );
    });
    el.h6Report.innerHTML =
      '<p class="h6-auto"><strong>auto_rule = false</strong> · ' +
      report.total_reviews +
      " reviews</p>" +
      parts.join("");
  }

  function exportH6Datasets() {
    if (!window.AiramH2.Datasets) return;
    const bundle = window.AiramH2.Datasets.exportAll(state.reviews, {
      session_id: state.session && state.session.id,
      profile_id: state.profileId,
    });
    const text = JSON.stringify(bundle, null, 2);
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download =
      "airam-h6-datasets-" +
      ((state.session && state.session.id) || "session") +
      ".json";
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("H6 datasets exportados · auto_rule=false");
  }

  function clampNum(x, lo, hi) {
    if (Number.isNaN(x)) return null;
    return Math.max(lo, Math.min(hi, x));
  }

  async function undoPly() {
    if (state.frames.length <= 1) return;
    clearBotTimer();
    state.frames.pop();
    state.states.pop();
    // In Vs Bot, also undo the bot reply if last move was bot and previous was human
    if (
      state.mode === "pvb" &&
      state.frames.length > 1 &&
      state.frames[state.frames.length - 1].side_to_move === "b"
    ) {
      // after human moved, side_to_move is b; frame after human has side_to_move b
      // If we undid bot's move, side_to_move of last frame should be w (bot just moved)
    }
    // Simpler: if pvb and we undid onto black-to-move after white just played, OK.
    // If last remaining move was by bot (ply odd for pvb starting white), undo again once.
    if (state.mode === "pvb" && state.frames.length > 1) {
      const last = state.frames[state.frames.length - 1];
      // last frame's move was by the opposite of side_to_move
      const mover = last.side_to_move === "w" ? "b" : "w";
      if (mover === "b") {
        state.frames.pop();
        state.states.pop();
      }
    }
    await rebuildBoardFromFrames();
    syncLastMoveFromFrames();
    state.selectedPly = state.frames.length - 1;
    await persistAll();
    refreshAll();
    maybeScheduleBot();
  }

  function syncLastMoveFromFrames() {
    if (state.frames.length > 1) {
      const f = state.frames[state.frames.length - 1];
      if (f.move_uci && f.move_uci.length >= 4) {
        state.lastMove = {
          from: algebraicToRC(f.move_uci.slice(0, 2)),
          to: algebraicToRC(f.move_uci.slice(2, 4)),
        };
        return;
      }
    }
    state.lastMove = null;
  }

  async function rebuildBoardFromFrames() {
    const C = window.AiramH2.ChessCore;
    state.board = C.initialBoard();
    state.castling = C.defaultCastling();
    state.turn = "w";
    state.ply = 0;
    state.posHistory = [C.positionKey(state.board, "w", state.castling)];
    // frames[0] is start; apply moves from 1..
    for (let i = 1; i < state.frames.length; i++) {
      const f = state.frames[i];
      if (!f.move_uci || f.move_uci.length < 4) continue;
      const from = algebraicToRC(f.move_uci.slice(0, 2));
      const to = algebraicToRC(f.move_uci.slice(2, 4));
      const { board, rights } = C.applyMove(
        state.board,
        from,
        to,
        state.castling
      );
      state.board = board;
      state.castling = rights;
      state.turn = f.side_to_move;
      state.ply = f.ply;
      state.posHistory.push(
        C.positionKey(state.board, state.turn, state.castling)
      );
    }
    if (state.frames.length) {
      const last = state.frames[state.frames.length - 1];
      if (last.castling_rights) {
        state.castling = C.cloneCastling(last.castling_rights);
      }
    }
  }

  function algebraicToRC(s) {
    const file = s.charCodeAt(0) - 97;
    const rank = parseInt(s[1], 10);
    return [8 - rank, file];
  }

  function exportJson() {
    const text = window.AiramH2.Store.exportBundle({
      session: state.session,
      frames: state.frames,
      states: state.states,
      reviews: state.reviews,
    });
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (state.session && state.session.id) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importJson(file) {
    const text = await file.text();
    const data = window.AiramH2.Store.parseImport(text);
    clearBotTimer();
    state.session = data.session;
    if (data.session && data.session.mode && MODES[data.session.mode]) {
      state.mode = data.session.mode;
    }
    state.frames = data.frames.sort((a, b) => a.ply - b.ply);
    // Recalculate states with current ruleset for falsifiability demo
    state.states = window.AiramH2.RulesetV01.recomputeAll(state.frames);
    // ensure linkage
    for (let i = 0; i < state.states.length; i++) {
      state.states[i].session_id = state.session.id;
      state.states[i].source_frame_id = state.frames[i].id;
      state.states[i].ruleset_version = window.AiramH2.RULESET_VERSION;
    }
    state.reviews = data.reviews || [];
    await rebuildBoardFromFrames();
    syncLastMoveFromFrames();
    state.selectedPly = state.frames.length - 1;
    await persistAll();
    refreshAll();
    setStatus(
      "Importado · " +
        modeLabel() +
        " · " +
        window.AiramH2.RULESET_VERSION +
        " · " +
        state.frames.length +
        " frames"
    );
    maybeScheduleBot();
  }

  async function toggleSessionsPanel() {
    if (!el.panelReplayLab) return;
    const show = el.panelReplayLab.hidden;
    el.panelReplayLab.hidden = !show;
    if (show) await refreshSessionList();
  }

  async function refreshSessionList() {
    if (!el.sessionList) return;
    const sessions = await window.AiramH2.Store.listSessions();
    sessions.sort(function (a, b) {
      return (b.started_at || "").localeCompare(a.started_at || "");
    });
    if (!sessions.length) {
      el.sessionList.innerHTML =
        '<p class="muted">No hay sesiones guardadas en IndexedDB.</p>';
      return;
    }
    el.sessionList.innerHTML = sessions
      .map(function (s) {
        const cur =
          state.session && state.session.id === s.id ? " is-current" : "";
        return (
          '<article class="session-card' +
          cur +
          '" data-sid="' +
          s.id +
          '">' +
          "<header><strong>" +
          (s.mode || "?") +
          "</strong><span>" +
          (s.started_at || "").slice(0, 19).replace("T", " ") +
          "</span></header>" +
          '<code class="sid">' +
          s.id +
          "</code>" +
          '<button type="button" data-load="' +
          s.id +
          '">Cargar</button>' +
          "</article>"
        );
      })
      .join("");
    el.sessionList.querySelectorAll("[data-load]").forEach(function (btn) {
      btn.onclick = function () {
        loadSessionById(btn.getAttribute("data-load"));
      };
    });
  }

  async function loadSessionById(sessionId) {
    clearBotTimer();
    stopReplay();
    const bundle = await window.AiramH2.Store.loadSessionBundle(sessionId);
    if (!bundle) {
      setStatus("Sesión no encontrada: " + sessionId);
      return;
    }
    state.session = bundle.session;
    if (bundle.session && bundle.session.mode && MODES[bundle.session.mode]) {
      state.mode = bundle.session.mode;
    }
    state.frames = (bundle.frames || []).sort(function (a, b) {
      return a.ply - b.ply;
    });
    state.states = window.AiramH2.RulesetV01.recomputeAll(state.frames);
    for (let i = 0; i < state.states.length; i++) {
      state.states[i].session_id = state.session.id;
      state.states[i].source_frame_id = state.frames[i].id;
    }
    state.reviews = bundle.reviews || [];
    await rebuildBoardFromFrames();
    syncLastMoveFromFrames();
    state.selectedPly = Math.max(0, state.frames.length - 1);
    clearPassageExplain();
    refreshAll();
    setStatus(
      "Replay · " +
        sessionId +
        " · " +
        state.frames.length +
        " frames · " +
        window.AiramH2.RULESET_VERSION
    );
    if (el.replayLabStatus) {
      el.replayLabStatus.textContent =
        "Cargada " + sessionId + " · ply " + state.selectedPly;
    }
    await refreshSessionList();
  }

  async function reanalyzeH0() {
    if (!window.AiramH2.HorizonEngine) {
      setStatus("HorizonEngine no disponible");
      return;
    }
    if (state.frames.length < 2) {
      setStatus("Nada que reanalizar");
      return;
    }
    setStatus("H0 reanalizando PASS A≠B…");
    // Yield so status paints
    await new Promise(function (r) {
      setTimeout(r, 20);
    });
    window.AiramH2.HorizonEngine.reanalyzeFrames(state.frames, {
      depth: 2,
      multipv: 3,
    });
    state.states = window.AiramH2.RulesetV01.recomputeAll(state.frames);
    for (let i = 0; i < state.states.length; i++) {
      state.states[i].session_id = state.session.id;
      state.states[i].source_frame_id = state.frames[i].id;
      state.states[i].ruleset_version = window.AiramH2.RULESET_VERSION;
    }
    await persistAll();
    refreshAll();
    const fp = window.AiramH2.HorizonEngine.framesFingerprint(state.frames);
    setStatus(
      "H0 listo · " +
        state.frames.length +
        " frames · fingerprint " +
        fp +
        " · " +
        window.AiramH2.RULESET_VERSION
    );
    if (el.replayLabStatus) {
      el.replayLabStatus.textContent =
        "Reanalizado · frames " + fp;
    }
  }

  async function verifyReplay() {
    if (!window.AiramH2.HorizonEngine) return;
    const H = window.AiramH2.HorizonEngine;
    const beforeF = H.framesFingerprint(state.frames);
    const beforeS = H.statesFingerprint(state.states);
    // deterministic replay: reanalyze twice + recompute states twice
    const framesCopy = JSON.parse(JSON.stringify(state.frames));
    H.reanalyzeFrames(framesCopy, { depth: 2, multipv: 3 });
    const midF = H.framesFingerprint(framesCopy);
    H.reanalyzeFrames(framesCopy, { depth: 2, multipv: 3 });
    const afterF = H.framesFingerprint(framesCopy);
    const states1 = window.AiramH2.RulesetV01.recomputeAll(framesCopy);
    const states2 = window.AiramH2.RulesetV01.recomputeAll(framesCopy);
    const s1 = H.statesFingerprint(states1);
    const s2 = H.statesFingerprint(states2);
    const okFrames = midF === afterF;
    const okStates = s1 === s2;
    const msg =
      (okFrames && okStates ? "OK deterministic_replay" : "FAIL") +
      " · frames " +
      midF +
      (okFrames ? "≡" : "≠") +
      afterF +
      " · states " +
      s1 +
      (okStates ? "≡" : "≠") +
      s2 +
      " · live frames " +
      beforeF +
      " · live states " +
      beforeS;
    setStatus(msg);
    if (el.replayLabStatus) el.replayLabStatus.textContent = msg;
  }

  function bind() {
    $("btn-new").onclick = () => {
      warmPiano();
      newSession();
    };
    $("btn-undo").onclick = () => undoPly();
    $("btn-export").onclick = () => exportJson();
    $("btn-import").onclick = () => $("import-file").click();
    $("import-file").onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importJson(f);
      e.target.value = "";
    };
    if ($("btn-sessions")) {
      $("btn-sessions").onclick = () => toggleSessionsPanel();
    }
    if ($("btn-reanalyze")) {
      $("btn-reanalyze").onclick = () => reanalyzeH0();
    }
    if ($("btn-verify")) {
      $("btn-verify").onclick = () => verifyReplay();
    }
    fillProfileSelect();
    if (el.profileSelect) {
      el.profileSelect.onchange = function () {
        state.profileId = el.profileSelect.value;
        try {
          localStorage.setItem("airam-profile", state.profileId);
        } catch (e) {}
        // Re-seed tonic/mode bias into world (keep debts)
        if (state.harmonicWorld && window.AiramH2.CharacterProfiles) {
          const p = window.AiramH2.CharacterProfiles.get(state.profileId);
          if (p.tonic) state.harmonicWorld.tonic = p.tonic;
          if (p.mode_bias === "minor") state.harmonicWorld.mode = "minor";
          else if (p.mode_bias === "modal") state.harmonicWorld.mode = "modal";
          else if (p.mode_bias === "major") state.harmonicWorld.mode = "major";
        }
        planScoreAtPly();
        renderScore();
        renderHorizon();
        renderCharacter();
      };
      try {
        const saved = localStorage.getItem("airam-profile");
        if (saved) {
          state.profileId = saved;
          el.profileSelect.value = saved;
        }
      } catch (e) {}
    }
    if ($("btn-score-plan")) {
      $("btn-score-plan").onclick = function () {
        planScoreAtPly();
        renderScore();
        setStatus("H1 Score planificado · " + state.profileId);
      };
    }
    if ($("btn-play-a")) {
      $("btn-play-a").onclick = function () {
        playVariant("A", "all");
      };
    }
    if ($("btn-play-b")) {
      $("btn-play-b").onclick = function () {
        playVariant("B", "all");
      };
    }
    if ($("btn-play-harm")) {
      $("btn-play-harm").onclick = function () {
        playVariant("A", "harmony");
      };
    }
    if ($("btn-play-mel")) {
      $("btn-play-mel").onclick = function () {
        playVariant("A", "melody");
      };
    }
    if ($("btn-stop-score")) {
      $("btn-stop-score").onclick = function () {
        if (window.AiramH2.Piano) window.AiramH2.Piano.stopAll();
      };
    }
    document.querySelectorAll("[data-ab]").forEach(function (btn) {
      btn.onclick = function () {
        saveAbVerdict(btn.getAttribute("data-ab"));
      };
    });
    if ($("btn-char-live")) {
      $("btn-char-live").onclick = function () {
        pushLiveComment(true);
        setStatus("H5 comentario · ply " + state.selectedPly);
      };
    }
    if ($("btn-char-study")) {
      $("btn-char-study").onclick = function () {
        runStudyComment();
      };
    }
    if ($("btn-char-clear")) {
      $("btn-char-clear").onclick = function () {
        state.comments = [];
        state.studyComment = null;
        renderCharacter();
      };
    }
    if ($("btn-h6-refresh")) {
      $("btn-h6-refresh").onclick = function () {
        renderH6();
        setStatus("H6 rankings actualizados · auto_rule=false");
      };
    }
    if ($("btn-h6-export")) {
      $("btn-h6-export").onclick = function () {
        exportH6Datasets();
      };
    }
    document.querySelectorAll("#mode-switch button").forEach((btn) => {
      btn.onclick = () => {
        warmPiano();
        setMode(btn.dataset.mode);
      };
    });
    if (el.btnAudio) {
      el.btnAudio.onclick = () => {
        const P = window.AiramH2.Piano;
        if (!P) return;
        warmPiano().then(() => {
          P.setEnabled(!P.isEnabled());
          syncAudioUI();
          if (P.isEnabled()) voiceCurrentChord(state.turn === "w" ? "b" : "w");
        });
      };
    }
    if (el.audioVol) {
      el.audioVol.oninput = () => {
        const P = window.AiramH2.Piano;
        if (!P) return;
        P.setVolume(+el.audioVol.value);
      };
    }
    if (el.btnReplayStop) {
      el.btnReplayStop.onclick = () => stopReplay();
    }
    syncAudioUI();
    // Unlock audio on first board interaction
    if (el.board) {
      el.board.addEventListener(
        "pointerdown",
        function once() {
          warmPiano();
        },
        { once: true }
      );
    }
    $("ply-prev").onclick = () => {
      stopReplay();
      state.selectedPly = Math.max(0, state.selectedPly - 1);
      refreshAll();
    };
    $("ply-next").onclick = () => {
      stopReplay();
      state.selectedPly = Math.min(
        state.frames.length - 1,
        state.selectedPly + 1
      );
      refreshAll();
    };
    el.plyRange.oninput = () => {
      stopReplay();
      state.selectedPly = +el.plyRange.value;
      renderInspector();
      renderH1();
      renderScore();
      renderHealth();
      drawBoard();
      drawCurves();
      updatePlyNav();
    };
    if (el.curvesW) {
      el.curvesW.addEventListener("click", (ev) =>
        pickPlyFromCanvas(ev, el.curvesW, "w")
      );
    }
    if (el.curvesB) {
      el.curvesB.addEventListener("click", (ev) =>
        pickPlyFromCanvas(ev, el.curvesB, "b")
      );
    }
    document.querySelectorAll("#review-bar [data-v]").forEach((btn) => {
      btn.onclick = () =>
        saveReview(btn.dataset.v, { dataset_kind: "game_validity" });
    });
    $("btn-save-review").onclick = () => {
      const v = el.humanVal.value !== "" ? "modify" : "unsure";
      saveReview(v, { dataset_kind: "game_validity" });
    };
    if ($("btn-save-music")) {
      $("btn-save-music").onclick = function () {
        const ok = window.confirm(
          "¿Validez musical OK?\nAceptar = ✅ · Cancelar = ❌"
        );
        saveReview(ok ? "accept" : "reject", {
          dataset_kind: "music_validity",
          dimension: "music_validity",
          comment: el.comment.value || "H6 music_validity",
        });
      };
    }
    if ($("btn-save-identity")) {
      $("btn-save-identity").onclick = function () {
        const ok = window.confirm(
          "¿Suena / habla como " +
            state.profileId +
            "?\nAceptar = ✅ · Cancelar = ❌"
        );
        saveReview(ok ? "accept" : "reject", {
          dataset_kind: "identity",
          dimension: "identity",
          comment: el.comment.value || "H6 identity · " + state.profileId,
        });
      };
    }
  }

  async function boot() {
    if (!initDom()) return;
    bind();
    state.mode = "pvb";
    await newSession();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
