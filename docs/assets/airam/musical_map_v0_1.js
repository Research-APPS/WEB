/**
 * H−1 — GameState → CausalTrace ∥ MusicalState
 * Matrix anchored to CHORDIA concepts (theory labels only; no audio/bank IO).
 *
 * Separation rule:
 *   CausalTrace  → explains the GAME (observations + evidence)
 *   MusicalState → musical params + reason (same observations; no actions in Trace)
 */
(function (global) {
  "use strict";

  const clamp = (x, lo, hi) => global.AiramH2.clamp(x, lo, hi);

  function v(state, dim) {
    const d = state && state.current && state.current[dim];
    return d && typeof d.value === "number" ? d.value : 0;
  }

  function round4(x) {
    return Math.round(x * 10000) / 10000;
  }

  function param(value, components) {
    return {
      value: clamp(value, 0, 1),
      components: components || {},
      map_version: global.AiramH2.MUSICAL_MAP_VERSION,
    };
  }

  /**
   * CHORDIA / PhraseLAB / PulseLAB anchors (labels for future bank lookup).
   * Not loaded from disk — H−1 is the mapping contract only.
   */
  const CHORDIA_ANCHORS = {
    cadence_pressure: ["cadence.resolve", "phrase.cadential"],
    harmonic_density: ["chord.stack", "voicing.density"],
    mode_brightness: ["mode.bright", "mode.dark", "chordia.mode_axis"],
    rhythmic_drive: ["pulse.drive", "pulselab.urgency"],
    dissonance: ["tension.interval", "chordia.dissonance"],
    register_spread: ["register.spread", "voicing.width"],
    phrase_length: ["phrase.length", "phraselab.span"],
  };

  function buildObservations(gs, frame) {
    const obs = [];
    const t = v(gs, "tension");
    const u = v(gs, "urgency");
    const s = v(gs, "surprise");
    const f = v(gs, "forcing");
    const i = v(gs, "instability");
    const a = v(gs, "ambiguity");
    const adv = v(gs, "advantage");
    const trend = (gs && gs.trend) || {};

    if (t >= 0.65) obs.push("tension_high");
    else if (t <= 0.25) obs.push("tension_low");
    if (u >= 0.6) obs.push("urgency_high");
    if (s >= 0.55) obs.push("surprise_spike");
    if (f >= 0.55) obs.push("forcing_line");
    if (i >= 0.55) obs.push("instability_rising");
    if (a >= 0.55) obs.push("ambiguity_high");
    if (adv >= 0.35) obs.push("white_advantage");
    else if (adv <= -0.35) obs.push("black_advantage");
    if ((trend.tension || 0) > 0.08) obs.push("tension_climbing");
    if ((trend.instability || 0) > 0.08) obs.push("instability_climbing");
    if (frame && frame.check) obs.push("side_in_check");
    if (frame && frame.castle) obs.push("castled");
    if (frame && (frame.tags || []).includes("checkmate")) obs.push("terminal_mate");
    if (!obs.length) obs.push("position_quiet");
    return obs;
  }

  function buildEvidence(gs, frame) {
    const evidence = [];
    const dims = [
      "tension",
      "urgency",
      "surprise",
      "forcing",
      "instability",
      "ambiguity",
      "advantage",
    ];
    for (const name of dims) {
      const d = gs.current[name];
      if (!d) continue;
      const causes = Object.keys(d.components || {})
        .filter((k) => k !== "note" && typeof d.components[k] === "number")
        .sort(
          (a, b) => Math.abs(d.components[b]) - Math.abs(d.components[a])
        )
        .slice(0, 3);
      if (Math.abs(d.value) < 0.15 && name !== "advantage") continue;
      evidence.push({
        feature: name,
        value: round4(d.value),
        causes: causes.length ? causes : ["ruleset_aggregate"],
      });
    }
    if (frame && frame.check) {
      evidence.push({
        feature: "check",
        value: 1,
        causes: ["frame.check"],
      });
    }
    return evidence;
  }

  function mapParams(gs, observations) {
    const t = v(gs, "tension");
    const u = v(gs, "urgency");
    const s = v(gs, "surprise");
    const f = v(gs, "forcing");
    const i = v(gs, "instability");
    const a = v(gs, "ambiguity");
    const adv = v(gs, "advantage");
    const mem = (gs && gs.memory) || {};

    // cadence_pressure: resolve when forcing/urgency high, hold when ambiguity
    const cadence_pressure = param(
      clamp(0.45 * f + 0.35 * u + 0.2 * t - 0.25 * a, 0, 1),
      {
        forcing: round4(0.45 * f),
        urgency: round4(0.35 * u),
        tension: round4(0.2 * t),
        ambiguity_hold: round4(-0.25 * a),
      }
    );

    const harmonic_density = param(
      clamp(0.4 * t + 0.35 * i + 0.25 * a, 0, 1),
      {
        tension: round4(0.4 * t),
        instability: round4(0.35 * i),
        ambiguity: round4(0.25 * a),
      }
    );

    // brightness from advantage (white-positive → brighter); surprise jolts
    const mode_brightness = param(
      clamp(0.5 + 0.35 * adv + 0.15 * s - 0.1 * i, 0, 1),
      {
        advantage_axis: round4(0.35 * adv),
        surprise_lift: round4(0.15 * s),
        instability_darken: round4(-0.1 * i),
      }
    );

    const rhythmic_drive = param(
      clamp(0.5 * u + 0.3 * f + 0.2 * t, 0, 1),
      {
        urgency: round4(0.5 * u),
        forcing: round4(0.3 * f),
        tension: round4(0.2 * t),
      }
    );

    const dissonance = param(
      clamp(0.4 * t + 0.35 * i + 0.25 * s, 0, 1),
      {
        tension: round4(0.4 * t),
        instability: round4(0.35 * i),
        surprise: round4(0.25 * s),
      }
    );

    const register_spread = param(
      clamp(0.35 * a + 0.35 * i + 0.3 * Math.abs(adv), 0, 1),
      {
        ambiguity: round4(0.35 * a),
        instability: round4(0.35 * i),
        advantage_abs: round4(0.3 * Math.abs(adv)),
      }
    );

    // longer phrases when calm / ambiguous; shorter when urgent
    const phrase_length = param(
      clamp(
        0.55 +
          0.25 * a -
          0.35 * u -
          0.15 * f +
          0.1 * (mem.stable_for_plies || 0) / 8,
        0,
        1
      ),
      {
        ambiguity_extend: round4(0.25 * a),
        urgency_shorten: round4(-0.35 * u),
        forcing_shorten: round4(-0.15 * f),
        stable_bonus: round4(0.1 * (mem.stable_for_plies || 0) / 8),
      }
    );

    const reason = observations.map((o) => ({
      observation: o,
      maps_to: reasonTargets(o),
    }));

    return {
      cadence_pressure,
      harmonic_density,
      mode_brightness,
      rhythmic_drive,
      dissonance,
      register_spread,
      phrase_length,
      reason,
    };
  }

  function reasonTargets(obs) {
    const table = {
      tension_high: ["dissonance", "harmonic_density", "rhythmic_drive"],
      tension_low: ["phrase_length", "mode_brightness"],
      urgency_high: ["rhythmic_drive", "cadence_pressure", "phrase_length"],
      surprise_spike: ["dissonance", "mode_brightness"],
      forcing_line: ["cadence_pressure", "rhythmic_drive"],
      instability_rising: ["dissonance", "harmonic_density", "register_spread"],
      ambiguity_high: ["harmonic_density", "phrase_length", "register_spread"],
      white_advantage: ["mode_brightness"],
      black_advantage: ["mode_brightness"],
      tension_climbing: ["dissonance", "harmonic_density"],
      instability_climbing: ["dissonance"],
      side_in_check: ["rhythmic_drive", "cadence_pressure"],
      castled: ["phrase_length"],
      terminal_mate: ["cadence_pressure"],
      position_quiet: ["phrase_length", "mode_brightness"],
    };
    return table[obs] || [];
  }

  function fromGameState(gameState, frame) {
    const observations = buildObservations(gameState, frame);
    const evidence = buildEvidence(gameState, frame);
    const mapped = mapParams(gameState, observations);

    const anchors = [];
    for (const key of global.AiramH2.MUSICAL_PARAMS) {
      for (const a of CHORDIA_ANCHORS[key] || []) {
        anchors.push({ param: key, concept: a });
      }
    }

    const trace = global.AiramH2.createCausalTrace({
      session_id: gameState.session_id,
      source_state_id: gameState.id,
      source_frame_id: gameState.source_frame_id,
      ply: gameState.ply,
      observations,
      evidence,
    });

    const musical = global.AiramH2.createMusicalState({
      session_id: gameState.session_id,
      source_state_id: gameState.id,
      source_frame_id: gameState.source_frame_id,
      ply: gameState.ply,
      params: {
        cadence_pressure: mapped.cadence_pressure,
        harmonic_density: mapped.harmonic_density,
        mode_brightness: mapped.mode_brightness,
        rhythmic_drive: mapped.rhythmic_drive,
        dissonance: mapped.dissonance,
        register_spread: mapped.register_spread,
        phrase_length: mapped.phrase_length,
      },
      reason: mapped.reason,
      chordia_anchors: anchors,
    });

    return { causalTrace: trace, musicalState: musical };
  }

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.MusicalMapV01 = {
    fromGameState,
    CHORDIA_ANCHORS,
  };
})(typeof window !== "undefined" ? window : globalThis);
