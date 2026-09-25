/**
 * H2-lite — GameState / MusicalState / GameFrame → piano chord
 * Explainable Roman-numeral pick in C major / A minor (CHORDIA-friendly labels).
 * No Score Planner yet — one chord per ply.
 */
(function (global) {
  "use strict";

  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  /** Triads + optional 7th / sus as MIDI pc sets relative to C=0 */
  const QUALITY = {
    maj: [0, 4, 7],
    min: [0, 3, 7],
    dim: [0, 3, 6],
    maj7: [0, 4, 7, 11],
    min7: [0, 3, 7, 10],
    dom7: [0, 4, 7, 10],
    sus4: [0, 5, 7],
    add9: [0, 4, 7, 14],
  };

  const DIATONIC = {
    major: [
      { rn: "I", root: "C", q: "maj" },
      { rn: "ii", root: "D", q: "min" },
      { rn: "iii", root: "E", q: "min" },
      { rn: "IV", root: "F", q: "maj" },
      { rn: "V", root: "G", q: "maj" },
      { rn: "vi", root: "A", q: "min" },
      { rn: "vii°", root: "B", q: "dim" },
    ],
    minor: [
      { rn: "i", root: "A", q: "min" },
      { rn: "ii°", root: "B", q: "dim" },
      { rn: "III", root: "C", q: "maj" },
      { rn: "iv", root: "D", q: "min" },
      { rn: "V", root: "E", q: "maj" },
      { rn: "VI", root: "F", q: "maj" },
      { rn: "VII", root: "G", q: "maj" },
    ],
  };

  function p(ms, key) {
    const x = ms && ms.params && ms.params[key];
    return x && typeof x.value === "number" ? x.value : 0.5;
  }

  function v(gs, dim) {
    const d = gs && gs.current && gs.current[dim];
    return d && typeof d.value === "number" ? d.value : 0;
  }

  function pickMode(gs, ms) {
    const bright = p(ms, "mode_brightness");
    const adv = v(gs, "advantage");
    // darker when black advantage or low brightness
    if (bright < 0.42 || adv < -0.25) return "minor";
    return "major";
  }

  function pickDegree(gs, ms, frame, mode) {
    const cad = p(ms, "cadence_pressure");
    const disso = p(ms, "dissonance");
    const dens = p(ms, "harmonic_density");
    const drive = p(ms, "rhythmic_drive");
    const amb = v(gs, "ambiguity");
    const surprise = v(gs, "surprise");
    const forcing = v(gs, "forcing");
    const tension = v(gs, "tension");

    if (frame && frame.ended === "checkmate") {
      return mode === "major" ? 0 : 0; // I / i
    }
    if (frame && frame.castle) {
      return mode === "major" ? 3 : 5; // IV / VI — “settling”
    }
    if (cad >= 0.72 || forcing >= 0.7) {
      return 4; // V
    }
    if (cad >= 0.55 && disso < 0.45) {
      return 0; // I / i resolve
    }
    if (surprise >= 0.6) {
      return mode === "major" ? 5 : 6; // vi / VII
    }
    if (amb >= 0.55) {
      return 1; // ii — open
    }
    if (tension >= 0.65 || disso >= 0.65) {
      return 6; // vii° / VII
    }
    if (drive >= 0.6) {
      return 4;
    }
    if (dens >= 0.55) {
      return 3; // IV / iv
    }
    // quiet default
    return mode === "major" ? 0 : 0;
  }

  function pickQuality(baseQ, ms, gs) {
    const disso = p(ms, "dissonance");
    const amb = v(gs, "ambiguity");
    const dens = p(ms, "harmonic_density");
    if (amb >= 0.6 && (baseQ === "maj" || baseQ === "min")) return "sus4";
    if (disso >= 0.55) {
      if (baseQ === "maj") return "dom7";
      if (baseQ === "min") return "min7";
      if (baseQ === "dim") return "dim";
    }
    if (dens >= 0.65 && baseQ === "maj") return "add9";
    if (dens >= 0.65 && baseQ === "min") return "min7";
    return baseQ;
  }

  function buildMidis(rootName, quality, octave) {
    const rootPc = NOTE[rootName];
    const ints = QUALITY[quality] || QUALITY.maj;
    const base = (octave + 1) * 12 + rootPc; // MIDI: C4 = 60 → octave 4
    return ints.map(function (iv) {
      return base + iv;
    });
  }

  function pickOctave(ms, sideMoved) {
    const spread = p(ms, "register_spread");
    let oct = sideMoved === "b" ? 3 : 4;
    if (spread >= 0.65) oct = sideMoved === "b" ? 2 : 3; // wider → drop
    if (spread <= 0.3) oct = sideMoved === "b" ? 4 : 5;
    return oct;
  }

  function durationSec(ms) {
    const phrase = p(ms, "phrase_length");
    const drive = p(ms, "rhythmic_drive");
    return 0.55 + phrase * 0.9 - drive * 0.25;
  }

  /**
   * @returns {{
   *   label: string, rn: string, quality: string, mode: string,
   *   midis: number[], duration: number, velocity: number,
   *   arpeggio: boolean, reason: string[]
   * }}
   */
  function chordForPly(gameState, musicalState, frame, sideMoved) {
    const mode = pickMode(gameState, musicalState);
    const scale = DIATONIC[mode];
    const deg = pickDegree(gameState, musicalState, frame, mode);
    const entry = scale[deg] || scale[0];
    const q = pickQuality(entry.q, musicalState, gameState);
    const oct = pickOctave(musicalState, sideMoved || "w");
    const midis = buildMidis(entry.root, q, oct);
    const reasons = [];
    reasons.push("mode:" + mode);
    reasons.push("degree:" + entry.rn);
    reasons.push("quality:" + q);
    if (frame && frame.castle) reasons.push("event:castle");
    if (frame && frame.check) reasons.push("event:check");
    if (frame && frame.capture) reasons.push("event:capture");

    const drive = p(musicalState, "rhythmic_drive");
    const disso = p(musicalState, "dissonance");

    return {
      label: entry.rn + (q !== entry.q ? "(" + q + ")" : "") + " " + entry.root,
      rn: entry.rn,
      quality: q,
      root: entry.root,
      mode: mode,
      midis: midis,
      duration: durationSec(musicalState),
      velocity: 0.32 + disso * 0.2 + drive * 0.1,
      arpeggio: p(musicalState, "register_spread") > 0.55 || midis.length > 3,
      reason: reasons,
    };
  }

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.ChordVoice = {
    chordForPly: chordForPly,
    DIATONIC: DIATONIC,
  };
})(typeof window !== "undefined" ? window : globalThis);
