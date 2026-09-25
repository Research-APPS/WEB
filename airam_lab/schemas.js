/**
 * AIRAM Music H−2 — schemas
 * Dimensions (exact names): advantage, tension, surprise, urgency,
 * forcing, instability, ambiguity.
 * Future debt: Stockfish WDL/PV/MultiPV, music, CHORDIA — do not implement here.
 */
(function (global) {
  "use strict";

  const SCHEMA_VERSION = "airam-h2-0.1";
  const RULESET_VERSION = "ruleset-v0.2";
  const ADAPTER_VERSION = "chess-adapter-v0.2";
  const MUSICAL_MAP_VERSION = "musical-map-v0.1";
  const DIMENSIONS = [
    "advantage",
    "tension",
    "surprise",
    "urgency",
    "forcing",
    "instability",
    "ambiguity",
  ];
  const MUSICAL_PARAMS = [
    "cadence_pressure",
    "harmonic_density",
    "mode_brightness",
    "rhythmic_drive",
    "dissonance",
    "register_spread",
    "phrase_length",
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
          "H0: PASS A≠B via HorizonEngine (local). Stockfish WASM = future debt.",
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
      /** H6: game_validity | music_validity | aesthetic | identity */
      dataset_kind: (partial && partial.dataset_kind) || null,
      profile_id: (partial && partial.profile_id) || null,
      verdict: "unsure",
      comment: "",
      before: null,
      after: null,
      timestamp: new Date().toISOString(),
      ...(partial || {}),
    };
  }

  /**
   * H−1 — explains the GAME only (no musical actions).
   * observations: short labels; evidence: feature → causes.
   */
  function createCausalTrace(partial) {
    return {
      id: uid("trace"),
      session_id: null,
      source_state_id: null,
      source_frame_id: null,
      ruleset_version: RULESET_VERSION,
      map_version: MUSICAL_MAP_VERSION,
      ply: 0,
      observations: [],
      evidence: [],
      ...(partial || {}),
    };
  }

  /**
   * H−1 — musical parameters + reason (same observations as CausalTrace).
   */
  function createMusicalState(partial) {
    const params = {};
    for (const k of MUSICAL_PARAMS) {
      params[k] = {
        value: 0.5,
        components: {},
        map_version: MUSICAL_MAP_VERSION,
      };
    }
    return {
      id: uid("mstate"),
      session_id: null,
      source_state_id: null,
      source_frame_id: null,
      map_version: MUSICAL_MAP_VERSION,
      ruleset_version: RULESET_VERSION,
      ply: 0,
      params,
      reason: [],
      chordia_anchors: [],
      ...(partial || {}),
    };
  }

  const SCORE_PLANNER_VERSION = "score-planner-v0.1";

  /**
   * H1 — symbolic score proposal (no audio required).
   * bars[] hold harmony / melody / rhythm with per-decision reasons.
   */
  function createScoreProposal(partial) {
    return {
      id: uid("score"),
      session_id: null,
      source_state_id: null,
      source_frame_id: null,
      ply: 0,
      profile_id: "neutral",
      planner_version: SCORE_PLANNER_VERSION,
      map_version: MUSICAL_MAP_VERSION,
      key: { tonic: "C", mode: "major" },
      meter: "4/4",
      tempo_bpm: 96,
      bars: [],
      decisions: [],
      label: "",
      variant: "A",
      ...(partial || {}),
    };
  }

  /**
   * H1 — character musical identity (material bias, not generative model).
   */
  function createCharacterMusicProfile(partial) {
    return {
      id: partial && partial.id ? partial.id : uid("profile"),
      label: (partial && partial.label) || "Neutral",
      blurb: (partial && partial.blurb) || "",
      tonic: (partial && partial.tonic) || "C",
      mode_bias: (partial && partial.mode_bias) || "major", // major|minor|modal
      register: (partial && partial.register) || 4, // octave center
      density: (partial && partial.density) || 0.45, // harmonic density preference
      drive: (partial && partial.drive) || 0.45,
      brightness: (partial && partial.brightness) != null ? partial.brightness : 0.55,
      preferred_qualities: (partial && partial.preferred_qualities) || ["maj", "min"],
      rhythm_feel: (partial && partial.rhythm_feel) || "straight", // straight|swing|pulse
      color: (partial && partial.color) || "#81b64c",
      ...(partial || {}),
    };
  }

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.SCHEMA_VERSION = SCHEMA_VERSION;
  global.AiramH2.RULESET_VERSION = RULESET_VERSION;
  global.AiramH2.ADAPTER_VERSION = ADAPTER_VERSION;
  global.AiramH2.MUSICAL_MAP_VERSION = MUSICAL_MAP_VERSION;
  global.AiramH2.SCORE_PLANNER_VERSION = SCORE_PLANNER_VERSION;
  global.AiramH2.DIMENSIONS = DIMENSIONS;
  global.AiramH2.MUSICAL_PARAMS = MUSICAL_PARAMS;
  global.AiramH2.uid = uid;
  global.AiramH2.clamp = clamp;
  global.AiramH2.dim = dim;
  global.AiramH2.dim01 = dim01;
  global.AiramH2.createSession = createSession;
  global.AiramH2.createGameFrame = createGameFrame;
  global.AiramH2.createGameState = createGameState;
  global.AiramH2.createReviewEvent = createReviewEvent;
  global.AiramH2.createCausalTrace = createCausalTrace;
  global.AiramH2.createMusicalState = createMusicalState;
  global.AiramH2.createScoreProposal = createScoreProposal;
  global.AiramH2.createCharacterMusicProfile = createCharacterMusicProfile;
})(typeof window !== "undefined" ? window : globalThis);
