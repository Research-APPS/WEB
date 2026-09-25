/**
 * AIRAM Music H−2 — schemas
 * Dimensions (exact names): advantage, tension, surprise, urgency,
 * forcing, instability, ambiguity.
 * Future debt: Stockfish WDL/PV/MultiPV, music, CHORDIA — do not implement here.
 */
(function (global) {
  "use strict";

  const SCHEMA_VERSION = "airam-h2-0.1";
  const RULESET_VERSION = "ruleset-v0.1";
  const ADAPTER_VERSION = "chess-adapter-v0.1";
  const DIMENSIONS = [
    "advantage",
    "tension",
    "surprise",
    "urgency",
    "forcing",
    "instability",
    "ambiguity",
  ];

  function uid(prefix) {
    return (
      (prefix || "id") +
      "_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 9)
    );
  }

  function createSession(partial) {
    const id = partial && partial.id ? partial.id : uid("sess");
    return {
      id,
      source: "chess",
      started_at: new Date().toISOString(),
      schema_version: SCHEMA_VERSION,
      adapter_version: ADAPTER_VERSION,
      ruleset_version: RULESET_VERSION,
      frame_ids: [],
      review_event_ids: [],
      ...(partial || {}),
    };
  }

  /**
   * Raw engine/board snapshot. Recalculable; no interpretation.
   * Stockfish fields may be null until H0 — documented in engine.notes.
   */
  function createGameFrame(partial) {
    return {
      id: uid("frame"),
      session_id: null,
      ply: 0,
      fen: "",
      side_to_move: "w",
      move_uci: null,
      move_san: null,
      eval_cp: null,
      eval_before_cp: null,
      eval_delta_cp: null,
      wdl: null,
      best_move: null,
      pv: [],
      candidates: [],
      legal_moves: [],
      legal_move_count: 0,
      check: false,
      capture: false,
      material: { w: 0, b: 0, diff: 0 },
      tags: [],
      attacked_hanging_count: 0,
      king_openness: { w: 0, b: 0 },
      engine: {
        kind: "local-minimax",
        version: ADAPTER_VERSION,
        nnue: null,
        nodes: null,
        multipv: 1,
        threads: 1,
        depth: null,
        notes:
          "H−2 local engine only. Stockfish WDL/PV/MultiPV = future debt (H0).",
      },
      ...(partial || {}),
    };
  }

  /** One scored dimension with falsifiable components. */
  function dim(value, components, rule_version) {
    return {
      value: clamp(value, -1, 1),
      components: components || {},
      rule_version: rule_version || RULESET_VERSION,
    };
  }

  function dim01(value, components, rule_version) {
    return {
      value: clamp(value, 0, 1),
      components: components || {},
      rule_version: rule_version || RULESET_VERSION,
    };
  }

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  function createGameState(partial) {
    const emptyDims = {};
    for (const d of DIMENSIONS) {
      emptyDims[d] = dim01(0, {}, RULESET_VERSION);
    }
    emptyDims.advantage = dim(0, {}, RULESET_VERSION);

    return {
      id: uid("state"),
      session_id: null,
      source_frame_id: null,
      ruleset_version: RULESET_VERSION,
      ply: 0,
      current: emptyDims,
      trend: {
        advantage: 0,
        tension: 0,
        urgency: 0,
        instability: 0,
      },
      memory: {
        tension_mean_4: 0,
        tension_peak_8: 0,
        last_major_event: null,
        stable_for_plies: 0,
      },
      ...(partial || {}),
    };
  }

  function createReviewEvent(partial) {
    return {
      id: uid("rev"),
      session_id: null,
      source_frame_id: null,
      ruleset_version: RULESET_VERSION,
      target_type: "game_state",
      target_id: null,
      dimension: null,
      verdict: "unsure",
      comment: "",
      before: null,
      after: null,
      timestamp: new Date().toISOString(),
      ...(partial || {}),
    };
  }

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.SCHEMA_VERSION = SCHEMA_VERSION;
  global.AiramH2.RULESET_VERSION = RULESET_VERSION;
  global.AiramH2.ADAPTER_VERSION = ADAPTER_VERSION;
  global.AiramH2.DIMENSIONS = DIMENSIONS;
  global.AiramH2.uid = uid;
  global.AiramH2.clamp = clamp;
  global.AiramH2.dim = dim;
  global.AiramH2.dim01 = dim01;
  global.AiramH2.createSession = createSession;
  global.AiramH2.createGameFrame = createGameFrame;
  global.AiramH2.createGameState = createGameState;
  global.AiramH2.createReviewEvent = createReviewEvent;
})(typeof window !== "undefined" ? window : globalThis);
