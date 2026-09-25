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
    turn: "w",
    ply: 0,
    selectedPly: 0,
    selected: null,
    legalDest: [],
    lastMove: null,
    mode: "pvb",
    botTimer: null,
    botDepth: 2,
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
      <span>H−2 · semántica del juego · ruleset-v0.1</span>
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
      </div>
      <div class="status" id="status"></div>
    </div>
    <div class="panel">
      <h3>Siete curvas</h3>
      <canvas class="curves" id="curves" width="800" height="240"></canvas>
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
        <button class="primary" id="btn-save-review">Guardar review</button>
      </div>
    </div>
  </div>
</div>`;
    el.board = $("board");
    el.curves = $("curves");
    el.legend = $("legend");
    el.inspector = $("inspector");
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
    return true;
  }

  function setStatus(msg) {
    el.status.textContent = msg;
  }

  async function newSession() {
    clearBotTimer();
    state.session = window.AiramH2.createSession({ mode: state.mode });
    state.frames = [];
    state.states = [];
    state.reviews = [];
    state.board = window.AiramH2.ChessCore.initialBoard();
    state.turn = "w";
    state.ply = 0;
    state.selected = null;
    state.legalDest = [];
    state.lastMove = null;

    const frame0 = window.AiramH2.ChessAdapter.buildInitialFrame(
      state.session.id,
      state.board
    );
    const st0 = window.AiramH2.RulesetV01.frameToState(frame0, null, []);
    state.frames.push(frame0);
    state.states.push(st0);
    state.session.frame_ids.push(frame0.id);
    state.selectedPly = 0;

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
  }

  function drawBoard() {
    const FILES = "abcdefgh";
    el.board.innerHTML = "";
    const legalSet = new Set(state.legalDest.map((d) => d[0] + "," + d[1]));
    const lastFrom =
      state.lastMove && state.lastMove.from
        ? state.lastMove.from[0] + "," + state.lastMove.from[1]
        : null;
    const lastTo =
      state.lastMove && state.lastMove.to
        ? state.lastMove.to[0] + "," + state.lastMove.to[1]
        : null;

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement("div");
        const light = (r + c) % 2 === 0;
        const key = r + "," + c;
        const p = state.board[r][c];
        sq.className = "sq " + (light ? "light" : "dark");
        if (p) sq.classList.add("has-piece");
        if (state.selected && state.selected[0] === r && state.selected[1] === c)
          sq.classList.add("sel");
        if (legalSet.has(key)) sq.classList.add("legal");
        if (key === lastFrom || key === lastTo) sq.classList.add("last");

        // coordinates: files on rank 1 (r=7), ranks on file a (c=0)
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

    if (el.rowW && el.rowB) {
      el.rowW.classList.toggle("active", state.turn === "w");
      el.rowB.classList.toggle("active", state.turn === "b");
      el.clockW.textContent = state.turn === "w" ? "▶" : "·";
      el.clockB.textContent = state.turn === "b" ? "▶" : "·";
    }
    if (el.board) {
      el.board.classList.toggle("board-locked", !humanCanMove());
    }
  }

  function onSquareClick(ev) {
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
      state.legalDest = C.legalMovesFor(state.board, r, c);
    } else {
      state.selected = null;
      state.legalDest = [];
    }
    drawBoard();
  }

  async function playMove(from, to) {
    const C = window.AiramH2.ChessCore;
    const before = C.cloneBoard(state.board);
    const sideMoved = state.turn;
    const { board, captured, piece } = C.applyMove(state.board, from, to);
    state.board = board;
    state.turn = sideMoved === "w" ? "b" : "w";
    state.ply += 1;
    state.selected = null;
    state.legalDest = [];
    state.lastMove = { from: from.slice(), to: to.slice() };

    const frame = window.AiramH2.ChessAdapter.buildFrameAfterMove(
      state.session.id,
      state.ply,
      before,
      board,
      { from, to, captured, piece },
      {
        sideMoved,
        botDepth: isBotSide(sideMoved) ? state.botDepth : null,
      }
    );
    const prev = state.states[state.states.length - 1] || null;
    const hist = state.frames.slice();
    const st = window.AiramH2.RulesetV01.frameToState(frame, prev, hist);
    state.frames.push(frame);
    state.states.push(st);
    state.selectedPly = state.ply;

    await persistAll();
    refreshAll();

    if (frame.ended) {
      clearBotTimer();
      setStatus(
        (frame.ended === "checkmate" ? "Jaque mate" : "Tablas") +
          " · " +
          modeLabel() +
          " · ply " +
          state.ply
      );
      return;
    }
    maybeScheduleBot();
  }

  function maybeScheduleBot() {
    clearBotTimer();
    if (!isBotSide(state.turn)) return;
    const last = state.frames[state.frames.length - 1];
    if (last && last.ended) return;
    const delay = state.mode === "bvb" ? 320 : 420;
    state.botTimer = setTimeout(async () => {
      if (!isBotSide(state.turn)) return;
      const C = window.AiramH2.ChessCore;
      const move = C.chooseBotMove(state.board, state.turn, state.botDepth);
      if (!move) return;
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

  function renderLegend() {
    el.legend.innerHTML = DIMS.map((d) => {
      const on = state.visibleDims[d];
      return `<span data-dim="${d}" style="opacity:${on ? 1 : 0.35}"><i style="background:${COLORS[d]}"></i>${d}</span>`;
    }).join("");
    el.legend.querySelectorAll("span").forEach((s) => {
      s.onclick = () => {
        const d = s.dataset.dim;
        state.visibleDims[d] = !state.visibleDims[d];
        renderLegend();
        drawCurves();
      };
    });
  }

  function renderDimList() {
    el.dimList.innerHTML = DIMS.map(
      (d) =>
        `<button type="button" data-dim="${d}" class="${
          state.selectedDim === d ? "active" : ""
        }">${d}</button>`
    ).join("");
    el.dimList.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        state.selectedDim = b.dataset.dim;
        renderDimList();
        renderInspector();
      };
    });
  }

  function drawCurves() {
    const canvas = el.curves;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "#0c0d0f";
    ctx.fillRect(0, 0, w, h);
    // mid line for advantage zero
    ctx.strokeStyle = "#2c2c2f";
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    const n = state.states.length;
    if (n < 1) return;

    function yFor(dim, value) {
      if (dim === "advantage") return h / 2 - value * (h / 2 - 8);
      return h - 8 - value * (h - 16);
    }

    for (const d of DIMS) {
      if (!state.visibleDims[d]) continue;
      ctx.strokeStyle = COLORS[d];
      ctx.lineWidth = d === state.selectedDim ? 2.4 : 1.2;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const v = state.states[i].current[d].value;
        const x = n === 1 ? w / 2 : (i / (n - 1)) * (w - 1);
        const y = yFor(d, v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // selected ply marker
    if (n > 1) {
      const x = (state.selectedPly / (n - 1)) * (w - 1);
      ctx.strokeStyle = "#f4f4f5";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function renderInspector() {
    const frame = state.frames[state.selectedPly];
    const st = state.states[state.selectedPly];
    if (!frame || !st) {
      el.inspector.textContent = "Sin datos";
      return;
    }
    const d = state.selectedDim;
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
  <div><strong>${d}</strong> ${Number(dim.value).toFixed(2)} ${trendArrow}</div>
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
session_id ${frame.session_id}
frame_id ${frame.id}
source_frame_id (state) ${st.source_frame_id}
ruleset_version ${st.ruleset_version}</pre>
</div>`;
  }

  async function saveReview(verdict) {
    const frame = state.frames[state.selectedPly];
    const st = state.states[state.selectedPly];
    if (!frame || !st) return;
    const d = state.selectedDim;
    const humanRaw = el.humanVal.value;
    const human =
      humanRaw === "" ? null : clampNum(parseFloat(humanRaw), d === "advantage" ? -1 : 0, 1);
    const before = { dimension: d, value: st.current[d].value };
    const after =
      verdict === "modify" && human != null
        ? { dimension: d, value: human }
        : null;
    const rev = window.AiramH2.createReviewEvent({
      session_id: state.session.id,
      source_frame_id: frame.id,
      ruleset_version: st.ruleset_version,
      target_type: "game_state",
      target_id: st.id,
      dimension: d,
      verdict,
      comment: el.comment.value || "",
      before,
      after,
    });
    state.reviews.push(rev);
    await persistAll();
    setStatus(
      `Review ${verdict} · ${d} @ ply ${frame.ply} · total reviews ${state.reviews.length}`
    );
    el.comment.value = "";
    el.humanVal.value = "";
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
    state.turn = "w";
    state.ply = 0;
    // frames[0] is start; apply moves from 1..
    for (let i = 1; i < state.frames.length; i++) {
      const f = state.frames[i];
      if (!f.move_uci || f.move_uci.length < 4) continue;
      const from = algebraicToRC(f.move_uci.slice(0, 2));
      const to = algebraicToRC(f.move_uci.slice(2, 4));
      const { board } = C.applyMove(state.board, from, to);
      state.board = board;
      state.turn = f.side_to_move;
      state.ply = f.ply;
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

  function bind() {
    $("btn-new").onclick = () => newSession();
    $("btn-undo").onclick = () => undoPly();
    $("btn-export").onclick = () => exportJson();
    $("btn-import").onclick = () => $("import-file").click();
    $("import-file").onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importJson(f);
      e.target.value = "";
    };
    document.querySelectorAll("#mode-switch button").forEach((btn) => {
      btn.onclick = () => setMode(btn.dataset.mode);
    });
    $("ply-prev").onclick = () => {
      state.selectedPly = Math.max(0, state.selectedPly - 1);
      refreshAll();
    };
    $("ply-next").onclick = () => {
      state.selectedPly = Math.min(
        state.frames.length - 1,
        state.selectedPly + 1
      );
      refreshAll();
    };
    el.plyRange.oninput = () => {
      state.selectedPly = +el.plyRange.value;
      renderInspector();
      drawCurves();
      updatePlyNav();
    };
    el.curves.addEventListener("click", (ev) => {
      const n = state.states.length;
      if (n < 2) return;
      const rect = el.curves.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * (n - 1);
      state.selectedPly = Math.round(x);
      refreshAll();
    });
    document.querySelectorAll("#review-bar [data-v]").forEach((btn) => {
      btn.onclick = () => saveReview(btn.dataset.v);
    });
    $("btn-save-review").onclick = () => {
      const v = el.humanVal.value !== "" ? "modify" : "unsure";
      saveReview(v);
    };
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
