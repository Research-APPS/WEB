/**
 * Ruleset v0.2 — GameFrame → GameState
 * Seven dimensions: advantage, tension, surprise, urgency,
 * forcing, instability, ambiguity.
 *
 * H0: when frame.horizon / candidates exist (PASS B), surprise &
 * ambiguity use MultiPV gaps instead of proxy-zeros.
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

  function horizonOf(frame) {
    return (frame && frame.horizon) || null;
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
    const hz = horizonOf(frame);
    const gaps = (hz && hz.gaps) || {};
    const candidates = frame.candidates || [];

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

    // --- surprise (0..1) — MultiPV rank / gap when PASS B present ---
    const disc = clamp(absDelta / 250, 0, 1);
    const tagSurprise =
      (frame.tags || []).includes("error") ||
      (frame.tags || []).includes("buena")
        ? 0.15
        : 0;
    const captureSurp = frame.capture && absDelta > 80 ? 0.12 : 0;
    let rankComp = 0;
    let gapComp = 0;
    if (hz && hz.played_rank != null) {
      rankComp = clamp((hz.played_rank - 1) / 4, 0, 1) * 0.55;
      if (hz.score_gap_to_best_cp != null) {
        gapComp = clamp(hz.score_gap_to_best_cp / 200, 0, 1) * 0.35;
      }
    }
    const surpriseRaw = hz
      ? 0.25 * disc +
        rankComp +
        gapComp +
        tagSurprise * 0.5 +
        captureSurp * 0.5
      : 0.7 * disc + tagSurprise + captureSurp;
    const surprise = dim01(
      clamp(surpriseRaw, 0, 1),
      {
        eval_discontinuity: round4(hz ? 0.25 * disc : 0.7 * disc),
        tag_signal: round4(tagSurprise),
        capture_shift: round4(captureSurp),
        multipv_candidate_rank: round4(rankComp),
        multipv_gap_to_best: round4(gapComp),
        note: hz ? "H0 PASS B" : "proxy (no horizon)",
      },
      RV()
    );

    // --- urgency (0..1) ---
    const urgCheck = frame.check ? 0.55 : 0;
    const urgFew = frame.check
      ? clamp((8 - Math.min(legal, 8)) / 8, 0, 1) * 0.35
      : 0;
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

    // --- forcing (0..1) — high when PASS B top gap is large ---
    const forCheck = frame.check ? 0.5 : 0;
    const forCapture = frame.capture ? 0.15 : 0;
    const forFew = clamp((20 - Math.min(legal, 20)) / 20, 0, 0.35);
    let forGap = 0;
    if (gaps.top_gap_cp != null && candidates.length >= 2) {
      forGap = clamp(gaps.top_gap_cp / 180, 0, 1) * 0.4;
    }
    const forcing = dim01(
      clamp(forCheck + forCapture + forFew + forGap, 0, 1),
      {
        check_forces_reply: round4(forCheck),
        capture_pressure: round4(forCapture),
        constrained_replies: round4(forFew),
        multipv_top_gap: round4(forGap),
      },
      RV()
    );

    // --- instability (0..1) ---
    const shortVar = shortWindowVariance(historyFrames, 4);
    const instDelta = clamp(absDelta / 200, 0, 1);
    let pvVol = 0;
    if (gaps.spread_cp != null && candidates.length >= 2) {
      pvVol = clamp(gaps.spread_cp / 250, 0, 1) * 0.35;
    }
    const instability = dim01(
      clamp(
        hz
          ? 0.4 * shortVar + 0.35 * instDelta + pvVol
          : 0.55 * shortVar + 0.45 * instDelta,
        0,
        1
      ),
      {
        short_window_variance: round4(
          hz ? 0.4 * shortVar : 0.55 * shortVar
        ),
        eval_delta: round4(hz ? 0.35 * instDelta : 0.45 * instDelta),
        pv_volatility: round4(pvVol),
        note: hz ? "H0 PASS B spread" : "proxy",
      },
      RV()
    );

    // --- ambiguity (0..1) — competitive futures via MultiPV gaps ---
    const spread = clamp((legal - 8) / 40, 0, 1);
    const quietHighLegal =
      !frame.check && legal >= 25
        ? 0.2
        : !frame.check && legal >= 15
          ? 0.1
          : 0;
    let multipvAmb = 0;
    if (candidates.length >= 2 && gaps.top_gap_cp != null) {
      multipvAmb = clamp(1 - gaps.top_gap_cp / 120, 0, 1) * 0.7;
      if (gaps.candidate_count >= 3 && gaps.spread_cp < 80) {
        multipvAmb = Math.min(1, multipvAmb + 0.15);
      }
    }
    const ambiguity = dim01(
      clamp(
        hz
          ? 0.25 * spread + 0.1 * quietHighLegal + multipvAmb
          : 0.65 * spread + quietHighLegal,
        0,
        1
      ),
      {
        legal_move_spread_proxy: round4(
          hz ? 0.25 * spread : 0.65 * spread
        ),
        quiet_branching: round4(quietHighLegal),
        multipv_score_gaps: round4(multipvAmb),
        note: hz ? "H0 PASS B gaps" : "proxy (no horizon)",
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
    if (!prevState || !prevState.current) {
      return {
        advantage: 0,
        tension: 0,
        urgency: 0,
        instability: 0,
      };
    }
    function d(name) {
      const a = prevState.current[name] && prevState.current[name].value;
      const b = current[name] && current[name].value;
      if (a == null || b == null) return 0;
      return b - a;
    }
    return {
      advantage: round4(d("advantage")),
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
    let lastMajor = prevMem.last_major_event;
    if (frame && frame.check) lastMajor = { kind: "check", ply: frame.ply };
    if (frame && (frame.tags || []).includes("checkmate"))
      lastMajor = { kind: "checkmate", ply: frame.ply };
    if (frame && frame.capture && (frame.captured_value || 0) >= 300)
      lastMajor = { kind: "capturegrande", ply: frame.ply };
    if (
      frame &&
      frame.horizon &&
      frame.horizon.played_rank != null &&
      frame.horizon.played_rank >= 3
    ) {
      lastMajor = { kind: "offbook", ply: frame.ply };
    }
    const stable =
      current.tension.value < 0.35 &&
      current.urgency.value < 0.25 &&
      current.surprise.value < 0.3
        ? (prevMem.stable_for_plies || 0) + 1
        : 0;
    return {
      tension_mean_4: round4(mean4),
      tension_peak_8: round4(peak8),
      last_major_event: lastMajor,
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
    version: "ruleset-v0.2",
    frameToState,
    recomputeAll,
  };
})(typeof window !== "undefined" ? window : globalThis);
