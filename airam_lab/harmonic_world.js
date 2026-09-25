/**
 * H4 — HarmonicWorld compartido (Alfa / Beta).
 * Blancas=Alfa, Negras=Beta: mismo tonic/mode; deudas abiertas; memoria de grados.
 * No reinicia la tonalidad cada ply — el mundo persiste en la sesión.
 */
(function (global) {
  "use strict";

  function createWorld(partial) {
    return {
      id: global.AiramH2.uid("world"),
      session_id: (partial && partial.session_id) || null,
      tonic: (partial && partial.tonic) || "C",
      mode: (partial && partial.mode) || "major",
      agent: "alfa", // current speaker
      open_degrees: [], // unpaid harmonic debts (degree indices)
      degree_history: [],
      alfa_last: null,
      beta_last: null,
      ply: 0,
      locked: true,
      ...(partial || {}),
    };
  }

  function agentForSide(side) {
    return side === "b" ? "beta" : "alfa";
  }

  /**
   * Seed world from profile + MusicalState at ply 0 / new session.
   */
  function seed(sessionId, profile, musicalState) {
    const bright =
      musicalState &&
      musicalState.params &&
      musicalState.params.mode_brightness
        ? musicalState.params.mode_brightness.value
        : 0.5;
    let mode = "major";
    if (profile) {
      if (profile.mode_bias === "minor") mode = "minor";
      else if (profile.mode_bias === "modal") mode = "modal";
      else if (profile.mode_bias === "follow" && bright < 0.42) mode = "minor";
    } else if (bright < 0.42) mode = "minor";
    return createWorld({
      session_id: sessionId,
      tonic: (profile && profile.tonic) || "C",
      mode: mode,
      agent: "alfa",
      locked: true,
    });
  }

  /**
   * Advance world after a ScoreProposal is chosen / played for a ply.
   * @param {string} sideMoved 'w'|'b'
   */
  function commit(world, score, sideMoved, ply) {
    if (!world || !score) return world;
    const agent = agentForSide(sideMoved);
    world.agent = agent;
    world.ply = ply != null ? ply : world.ply;
    // Lock key from first commit if unlocked seed
    if (score.key) {
      if (!world.locked || world.degree_history.length === 0) {
        world.tonic = score.key.tonic;
        world.mode = score.key.mode;
        world.locked = true;
      }
      // Keep shared key — do not drift per agent
    }
    const lastBar =
      score.bars && score.bars.length
        ? score.bars[score.bars.length - 1]
        : null;
    const rn =
      lastBar && lastBar.harmony && lastBar.harmony[0]
        ? lastBar.harmony[0].rn
        : null;
    const degIdx = rnToDegree(rn, world.mode);
    if (degIdx != null) {
      world.degree_history.push({
        ply: ply,
        agent: agent,
        degree: degIdx,
        rn: rn,
      });
      // Open debt: V (4) wants I (0); vii wants I; leave IV open lightly
      if (degIdx === 4 || degIdx === 6) {
        world.open_degrees.push(degIdx);
      } else if (degIdx === 0 && world.open_degrees.length) {
        world.open_degrees.pop(); // resolved
      } else if (degIdx === 5 && world.open_degrees.length) {
        // deceptive — debt remains but soften
        world.open_degrees[world.open_degrees.length - 1] = 5;
      }
      if (world.open_degrees.length > 4) {
        world.open_degrees = world.open_degrees.slice(-4);
      }
    }
    const snap = {
      ply: ply,
      rn: rn,
      label: score.label,
      score_id: score.id,
    };
    if (agent === "alfa") world.alfa_last = snap;
    else world.beta_last = snap;
    return world;
  }

  function rnToDegree(rn, mode) {
    if (!rn) return null;
    const table =
      mode === "minor"
        ? ["i", "ii°", "III", "iv", "V", "VI", "VII"]
        : mode === "modal"
          ? ["i", "ii", "III", "IV", "v", "vi°", "VII"]
          : ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
    const i = table.indexOf(rn);
    return i >= 0 ? i : null;
  }

  function viewForAgent(world, side) {
    const agent = agentForSide(side);
    return Object.assign({}, world, { agent: agent });
  }

  function summary(world) {
    if (!world) return "Sin mundo armónico.";
    const debt = (world.open_degrees || [])
      .map(function (d) {
        return String(d);
      })
      .join(",") || "—";
    return (
      world.tonic +
      " " +
      world.mode +
      " · deudas [" +
      debt +
      "] · Alfa " +
      (world.alfa_last && world.alfa_last.rn
        ? world.alfa_last.rn
        : "—") +
      " · Beta " +
      (world.beta_last && world.beta_last.rn
        ? world.beta_last.rn
        : "—")
    );
  }

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.HarmonicWorld = {
    create: createWorld,
    seed: seed,
    commit: commit,
    viewForAgent: viewForAgent,
    agentForSide: agentForSide,
    summary: summary,
  };
})(typeof window !== "undefined" ? window : globalThis);
