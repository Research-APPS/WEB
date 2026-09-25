/**
 * H3 — Musical horizon: futuros musicales desde candidatos PASS B.
 * Cada candidate UCI → score A corto en el mundo armónico compartido,
 * etiquetado con rank/gap del motor.
 */
(function (global) {
  "use strict";

  function p(ms, key) {
    const x = ms && ms.params && ms.params[key];
    return x && typeof x.value === "number" ? x.value : 0.5;
  }

  /**
   * Perturb MusicalState params for a candidate (explainable, deterministic).
   * Better engine score → slightly calmer / more cadential;
   * worse / offbook → more dissonance & surprise.
   */
  function perturbMusicalState(ms, candidate, bestScore) {
    const clone = JSON.parse(JSON.stringify(ms));
    const gap = Math.abs((bestScore || 0) - (candidate.score_cp || 0));
    const rank = candidate.rank || 1;
    const gapN = Math.min(1, gap / 200);
    const rankN = Math.min(1, (rank - 1) / 4);
    function bump(key, delta) {
      if (!clone.params[key]) return;
      const v = clone.params[key].value;
      clone.params[key].value = Math.max(0, Math.min(1, v + delta));
      clone.params[key].components = Object.assign(
        {},
        clone.params[key].components || {},
        { horizon_rank: rankN, horizon_gap: gapN }
      );
    }
    bump("dissonance", rankN * 0.25 + gapN * 0.15);
    bump("cadence_pressure", -rankN * 0.15 + (rank === 1 ? 0.12 : 0));
    bump("surprise", rankN * 0.3);
    bump("harmonic_density", rankN * 0.1);
    bump("mode_brightness", rank === 1 ? 0.05 : -rankN * 0.1);
    return clone;
  }

  /**
   * Build horizon futures for current frame (uses PASS B candidates).
   * @returns {{ futures: object[], world_summary: string }}
   */
  function buildHorizon(gameState, musicalState, frame, profileId, world) {
    const SP = global.AiramH2.ScorePlanner;
    const HW = global.AiramH2.HarmonicWorld;
    const candidates = (frame && frame.candidates) || [];
    const best =
      candidates.length && candidates[0].score_cp != null
        ? candidates[0].score_cp
        : frame && frame.pass_a
          ? frame.pass_a.score_cp
          : 0;
    const profile = global.AiramH2.CharacterProfiles.get(profileId || "neutral");
    const side = frame && frame.side_to_move === "w" ? "b" : "w"; // who just moved is opposite of stm; horizon looks at replies for stm
    // Actually horizon for "what if side_to_move plays candidate"
    const mover = frame ? frame.side_to_move : "w";
    const agentWorld = HW
      ? HW.viewForAgent(world || HW.seed(null, profile, musicalState), mover)
      : null;

    const futures = [];
    const list = candidates.length
      ? candidates.slice(0, 3)
      : [{ rank: 1, uci: frame && frame.best_move, score_cp: best }];

    list.forEach(function (cand) {
      if (!cand || !cand.uci) return;
      const ms2 = perturbMusicalState(musicalState, cand, best);
      const score = SP.planVariant(
        gameState,
        ms2,
        frame,
        profile,
        cand.rank === 1 ? "A" : "B",
        { world: agentWorld }
      );
      score.label =
        "#" +
        cand.rank +
        " " +
        cand.uci +
        " (" +
        cand.score_cp +
        " cp) → " +
        (score.bars || [])
          .map(function (b) {
            return b.harmony && b.harmony[0] ? b.harmony[0].rn : "?";
          })
          .join("–");
      futures.push({
        rank: cand.rank,
        uci: cand.uci,
        score_cp: cand.score_cp,
        gap_to_best_cp: Math.abs(best - (cand.score_cp || 0)),
        score: score,
        reason:
          cand.rank === 1
            ? "línea principal PASS A/B"
            : "candidato #" +
              cand.rank +
              " · gap " +
              Math.abs(best - (cand.score_cp || 0)) +
              " cp → más disonancia/sorpresa",
      });
    });

    return {
      futures: futures,
      world_summary: HW ? HW.summary(world) : "",
      mover: mover,
      best_score_cp: best,
    };
  }

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.MusicalHorizon = {
    buildHorizon: buildHorizon,
    perturbMusicalState: perturbMusicalState,
  };
})(typeof window !== "undefined" ? window : globalThis);
