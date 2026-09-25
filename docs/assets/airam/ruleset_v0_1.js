/**
 * Ruleset v0.1 — GameFrame → GameState
 * Seven dimensions only: advantage, tension, surprise, urgency,
 * forcing, instability, ambiguity.
 *
 * Honest about missing MultiPV/Stockfish: those components are
 * documented as proxies / zeros with future-debt notes.
 */
(function (global) {
  "use strict";

  const RV = () => global.AiramH2.RULESET_VERSION;
  const clamp = (x, lo, hi) => global.AiramH2.clamp(x, lo, hi);
  const dim = (...a) => global.AiramH2.dim(...a);
  const dim01 = (...a) => global.AiramH2.dim01(...a);

  function ema(prev, next, alpha) {
    if (prev == null || Number.isNaN(prev)) return next;
    return prev * (1 - alpha) + next * alpha;
  }

  function computeCurrent(frame, historyFrames) {
    const evalCp = frame.eval_cp != null ? frame.eval_cp : 0;
    const delta = frame.eval_delta_cp != null ? frame.eval_delta_cp : 0;
    const absDelta = Math.abs(delta);
    const legal = frame.legal_move_count || 0;
    const hanging = frame.attacked_hanging_count || 0;
    const side = frame.side_to_move;
    const kingOpen =
      (frame.king_openness && frame.king_openness[side]) || 0;

    // --- advantage (-1..1, white-positive) ---
    const advMaterial = clamp((frame.material.diff || 0) / 15, -1, 1);
    const advEval = Math.tanh(evalCp / 400);
    const advantage = dim(
      clamp(0.35 * advMaterial + 0.65 * advEval, -1, 1),
      {
        material_balance: round4(0.35 * advMaterial),
        eval_tanh: round4(0.65 * advEval),
      },
      RV()
    );

    // --- tension (0..1) ---
    const tactical = clamp(hanging / 4, 0, 1);
    const kingExp = clamp(kingOpen / 4, 0, 1);
    const checkComp = frame.check ? 0.25 : 0;
    const vol = clamp(absDelta / 300, 0, 1);
    const calm = legal > 30 && !frame.check && hanging === 0 ? -0.12 : 0;
    const tensionRaw =
      0.32 * tactical + 0.22 * kingExp + 0.2 * checkComp + 0.18 * vol + calm;
    const tension = dim01(
      clamp(tensionRaw, 0, 1),
      {
        tactical_pressure: round4(0.32 * tactical),
        king_exposure: round4(0.22 * kingExp),
        check_bonus: round4(0.2 * checkComp),
        eval_volatility: round4(0.18 * vol),
        positional_calm: round4(calm),
      },
      RV()
    );

    // --- surprise (0..1) — without MultiPV: eval discontinuity proxy ---
    // Future debt: candidate_rank, score_gap, PV_distance from Stockfish PASS B
    const disc = clamp(absDelta / 250, 0, 1);
    const tagSurprise =
      (frame.tags || []).includes("error") || (frame.tags || []).includes("buena")
        ? 0.15
        : 0;
    const captureSurp = frame.capture && absDelta > 80 ? 0.12 : 0;
    const surprise = dim01(
      clamp(0.7 * disc + tagSurprise + captureSurp, 0, 1),
      {
        eval_discontinuity: round4(0.7 * disc),
        tag_signal: round4(tagSurprise),
        capture_shift: round4(captureSurp),
        multipv_candidate_rank: 0,
        note: "MultiPV surprise = future debt",
      },
      RV()
    );

    // --- urgency (0..1) ---
    const urgCheck = frame.check ? 0.55 : 0;
    const urgFew = frame.check ? clamp((8 - Math.min(legal, 8)) / 8, 0, 1) * 0.35 : 0;
    const urgMateTag = (frame.tags || []).includes("checkmate") ? 1 : 0;
    const urgency = dim01(
      clamp(Math.max(urgMateTag, urgCheck + urgFew), 0, 1),
      {
        in_check: round4(urgCheck),
        reply_scarcity: round4(urgFew),
        checkmate: urgMateTag,
      },
      RV()
    );

    // --- forcing (0..1) — obliges a reply; not inverse of ambiguity ---
    const forCheck = frame.check ? 0.5 : 0;
    const forCapture = frame.capture ? 0.15 : 0;
    const forFew = clamp((20 - Math.min(legal, 20)) / 20, 0, 0.35);
    const forcing = dim01(
      clamp(forCheck + forCapture + forFew, 0, 1),
      {
        check_forces_reply: round4(forCheck),
        capture_pressure: round4(forCapture),
        constrained_replies: round4(forFew),
      },
      RV()
    );

    // --- instability (0..1) ---
    const shortVar = shortWindowVariance(historyFrames, 4);
    const instDelta = clamp(absDelta / 200, 0, 1);
    const instability = dim01(
      clamp(0.55 * shortVar + 0.45 * instDelta, 0, 1),
      {
        short_window_variance: round4(0.55 * shortVar),
        eval_delta: round4(0.45 * instDelta),
        pv_volatility: 0,
        note: "PV volatility = future debt",
      },
      RV()
    );

    // --- ambiguity (0..1) — competitive futures; weak legal-move proxy ---
    // Future debt: MultiPV score gaps
    const spread = clamp((legal - 8) / 40, 0, 1);
    const quietHighLegal =
      !frame.check && legal >= 25 ? 0.2 : !frame.check && legal >= 15 ? 0.1 : 0;
    const ambiguity = dim01(
      clamp(0.65 * spread + quietHighLegal, 0, 1),
      {
        legal_move_spread_proxy: round4(0.65 * spread),
        quiet_branching: round4(quietHighLegal),
        multipv_score_gaps: 0,
        note: "Replace with MultiPV gaps in H0",
      },
      RV()
    );

    return {
      advantage,
      tension,
      surprise,
      urgency,
      forcing,
      instability,
      ambiguity,
    };
  }

  function shortWindowVariance(frames, n) {
    const slice = frames.slice(-n);
    if (slice.length < 2) return 0;
    const vals = slice.map((f) =>
      Math.tanh((f.eval_cp != null ? f.eval_cp : 0) / 400)
    );
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const v =
      vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vals.length;
    return clamp(Math.sqrt(v) * 2.5, 0, 1);
  }

  function computeTrend(prevState, current) {
    const alpha = 0.4;
    const prev = (prevState && prevState.current) || {};
    const tr = (prevState && prevState.trend) || {};
    function d(name, isSigned) {
      const now = current[name].value;
      const was = prev[name] ? prev[name].value : now;
      const raw = now - was;
      return ema(tr[name] != null ? tr[name] : 0, raw, alpha);
    }
    return {
      advantage: round4(d("advantage", true)),
      tension: round4(d("tension")),
      urgency: round4(d("urgency")),
      instability: round4(d("instability")),
    };
  }

  function computeMemory(prevState, current, frame) {
    const prevMem = (prevState && prevState.memory) || {
      tension_mean_4: 0,
      tension_peak_8: 0,
      last_major_event: null,
      stable_for_plies: 0,
    };
    const t = current.tension.value;
    const mean4 = ema(prevMem.tension_mean_4, t, 0.35);
    const peak8 = Math.max(t, prevMem.tension_peak_8 * 0.92);
    let major = prevMem.last_major_event;
    if (frame.check || (frame.tags || []).includes("checkmate") || Math.abs(frame.eval_delta_cp || 0) >= 200) {
      major = {
        ply: frame.ply,
        kind: (frame.tags || []).includes("checkmate")
          ? "checkmate"
          : frame.check
            ? "check"
            : frame.capture
              ? "capture"
              : "eval_swing",
        move: frame.move_san || frame.move_uci,
      };
    }
    const quiet =
      current.tension.value < 0.35 &&
      current.instability.value < 0.3 &&
      !frame.check;
    const stable = quiet ? (prevMem.stable_for_plies || 0) + 1 : 0;
    return {
      tension_mean_4: round4(mean4),
      tension_peak_8: round4(peak8),
      last_major_event: major,
      stable_for_plies: stable,
    };
  }

  function frameToState(frame, prevState, historyFrames) {
    const current = computeCurrent(frame, historyFrames || []);
    const trend = computeTrend(prevState, current);
    const memory = computeMemory(prevState, current, frame);
    return global.AiramH2.createGameState({
      session_id: frame.session_id,
      source_frame_id: frame.id,
      ruleset_version: RV(),
      ply: frame.ply,
      current,
      trend,
      memory,
    });
  }

  /** Recompute all states from frames with this ruleset (falsifiability). */
  function recomputeAll(frames) {
    const sorted = frames.slice().sort((a, b) => a.ply - b.ply);
    const states = [];
    let prev = null;
    const hist = [];
    for (const f of sorted) {
      const st = frameToState(f, prev, hist);
      states.push(st);
      hist.push(f);
      prev = st;
    }
    return states;
  }

  function round4(x) {
    if (typeof x !== "number" || Number.isNaN(x)) return x;
    return Math.round(x * 10000) / 10000;
  }

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.RulesetV01 = {
    version: "ruleset-v0.1",
    frameToState,
    recomputeAll,
  };
})(typeof window !== "undefined" ? window : globalThis);
