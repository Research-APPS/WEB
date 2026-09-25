/**
 * H1 — Score Planner (symbolic).
 * MusicalState + CharacterMusicProfile → ScoreProposal (bars, decisions).
 * Variant A = profile-forward; variant B = alternate resolution (A/B for H2).
 * Deterministic. No audio here — Piano plays it in H2.
 */
(function (global) {
  "use strict";

  const NOTE_PC = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
    Bb: 10,
    Eb: 3,
    Ab: 8,
    Db: 1,
    Gb: 6,
    Fsharp: 6,
  };

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

  /** Scale degrees relative to tonic PC for major / natural minor / dorian-ish modal */
  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    modal: [0, 2, 3, 5, 7, 9, 10], // dorian-ish
  };

  const DEGREE_RN = {
    major: ["I", "ii", "iii", "IV", "V", "vi", "vii°"],
    minor: ["i", "ii°", "III", "iv", "V", "VI", "VII"],
    modal: ["i", "ii", "III", "IV", "v", "vi°", "VII"],
  };

  const DEGREE_Q = {
    major: ["maj", "min", "min", "maj", "maj", "min", "dim"],
    minor: ["min", "dim", "maj", "min", "maj", "maj", "maj"],
    modal: ["min", "min", "maj", "maj", "min", "dim", "maj"],
  };

  function p(ms, key) {
    const x = ms && ms.params && ms.params[key];
    return x && typeof x.value === "number" ? x.value : 0.5;
  }

  function v(gs, dim) {
    const d = gs && gs.current && gs.current[dim];
    return d && typeof d.value === "number" ? d.value : 0;
  }

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  function pickMode(gs, ms, profile) {
    if (profile.mode_bias === "major") return "major";
    if (profile.mode_bias === "minor") return "minor";
    if (profile.mode_bias === "modal") return "modal";
    // follow MusicalState
    const bright = p(ms, "mode_brightness");
    const adv = v(gs, "advantage");
    if (bright < 0.42 || adv < -0.25) return "minor";
    return "major";
  }

  function pickTonic(profile, ms) {
    if (profile.tonic && profile.tonic !== "C") return profile.tonic;
    // neutral: shift with brightness
    const bright = p(ms, "mode_brightness");
    if (bright >= 0.7) return "G";
    if (bright <= 0.35) return "A";
    return "C";
  }

  function tonicPc(name) {
    return NOTE_PC[name] != null ? NOTE_PC[name] : 0;
  }

  function degreeFromState(gs, ms, variant) {
    const cad = p(ms, "cadence_pressure");
    const disso = p(ms, "dissonance");
    const dens = p(ms, "harmonic_density");
    const drive = p(ms, "rhythmic_drive");
    const amb = v(gs, "ambiguity");
    const surprise = v(gs, "surprise");
    const forcing = v(gs, "forcing");
    const tension = v(gs, "tension");

    // Variant B prefers softer / deceptive resolutions
    if (variant === "B") {
      if (cad >= 0.55) return 5; // vi / VI
      if (disso >= 0.55) return 3; // IV
      if (surprise >= 0.5) return 1; // ii
      return 0;
    }

    if (cad >= 0.72 || forcing >= 0.7) return 4; // V
    if (cad >= 0.55 && disso < 0.45) return 0; // I
    if (surprise >= 0.6) return 5;
    if (amb >= 0.55) return 1;
    if (tension >= 0.65 || disso >= 0.65) return 6;
    if (drive >= 0.6) return 4;
    if (dens >= 0.55) return 3;
    return 0;
  }

  function pickQuality(baseQ, ms, profile, variant) {
    const prefs = profile.preferred_qualities || [];
    const disso = p(ms, "dissonance");
    const dens = p(ms, "harmonic_density") * 0.5 + profile.density * 0.5;
    const amb = 0; // filled by caller optionally

    if (variant === "B" && prefs.indexOf("sus4") >= 0) return "sus4";
    if (disso >= 0.55) {
      if (prefs.indexOf("dom7") >= 0 && (baseQ === "maj" || baseQ === "min"))
        return baseQ === "maj" ? "dom7" : "min7";
      if (prefs.indexOf("dim") >= 0) return "dim";
    }
    if (dens >= 0.65) {
      if (prefs.indexOf("add9") >= 0 && baseQ === "maj") return "add9";
      if (prefs.indexOf("maj7") >= 0 && baseQ === "maj") return "maj7";
      if (prefs.indexOf("min7") >= 0 && baseQ === "min") return "min7";
    }
    if (prefs.indexOf(baseQ) >= 0) return baseQ;
    return baseQ;
  }

  function buildMidis(tonicName, degree, quality, octave) {
    const scale = SCALES.major; // intervals applied from degree root
    const rootPc = (tonicPc(tonicName) + SCALES.major[degree]) % 12;
    // For minor/modal degree roots we still use the mode's scale steps:
    // caller passes the pc offset already via degree index into SCALES[mode]
    const ints = QUALITY[quality] || QUALITY.maj;
    const base = (octave + 1) * 12 + rootPc;
    return ints.map(function (iv) {
      return base + iv;
    });
  }

  function buildMidisForMode(tonicName, mode, degree, quality, octave) {
    const steps = SCALES[mode] || SCALES.major;
    const rootPc = (tonicPc(tonicName) + steps[degree]) % 12;
    const ints = QUALITY[quality] || QUALITY.maj;
    const base = (octave + 1) * 12 + rootPc;
    return ints.map(function (iv) {
      return base + iv;
    });
  }

  function tempoFrom(ms, profile) {
    const drive = p(ms, "rhythmic_drive") * 0.6 + profile.drive * 0.4;
    const phrase = p(ms, "phrase_length");
    return Math.round(72 + drive * 70 - phrase * 18);
  }

  function barCount(ms, profile) {
    const phrase = p(ms, "phrase_length");
    const urg = p(ms, "rhythmic_drive");
    // 2–4 bars
    if (urg >= 0.7 || phrase < 0.35) return 2;
    if (phrase >= 0.65) return 4;
    return 3;
  }

  function melodyDegrees(mode, harmonyDeg, dens) {
    const scale = SCALES[mode] || SCALES.major;
    const steps = [0, 2, 4];
    if (dens >= 0.55) steps.push(5);
    if (dens >= 0.7) steps.push(1);
    return steps.map(function (s) {
      return (harmonyDeg + s) % 7;
    });
  }

  function rhythmPattern(feel, drive, barIndex) {
    // beat positions 0..3 in 4/4
    if (feel === "swing") {
      return [
        { beat: 0, vel: 0.7, kind: "down" },
        { beat: 1.5, vel: 0.45, kind: "swing" },
        { beat: 2, vel: 0.55, kind: "down" },
        { beat: 3.5, vel: 0.4, kind: "swing" },
      ];
    }
    if (feel === "pulse") {
      const hits = [
        { beat: 0, vel: 0.65, kind: "pulse" },
        { beat: 2, vel: 0.5, kind: "pulse" },
      ];
      if (drive >= 0.55) hits.push({ beat: 1, vel: 0.35, kind: "pulse" });
      if (drive >= 0.75) hits.push({ beat: 3, vel: 0.35, kind: "pulse" });
      return hits;
    }
    // straight
    const base = [
      { beat: 0, vel: 0.6, kind: "down" },
      { beat: 2, vel: 0.45, kind: "down" },
    ];
    if (drive >= 0.6) {
      base.push({ beat: 1, vel: 0.35, kind: "up" });
      base.push({ beat: 3, vel: 0.35, kind: "up" });
    }
    if (barIndex === 0) base[0].vel = Math.min(1, base[0].vel + 0.1);
    return base;
  }

  /**
   * Build one ScoreProposal variant.
   * @param {object} [opts] · { world?: HarmonicWorld }
   */
  function planVariant(gameState, musicalState, frame, profile, variant, opts) {
    variant = variant || "A";
    opts = opts || {};
    profile = profile || global.AiramH2.CharacterProfiles.get("neutral");
    const world = opts.world || null;

    let mode = pickMode(gameState, musicalState, profile);
    let tonic = pickTonic(profile, musicalState);
    // H4: lock to shared harmonic world when present
    if (world && world.tonic && world.mode) {
      tonic = world.tonic;
      mode = world.mode;
    }

    let deg = degreeFromState(gameState, musicalState, variant);
    // Prefer resolving open debts (V→I, etc.) when world has them
    if (world && world.open_degrees && world.open_degrees.length) {
      const debt = world.open_degrees[world.open_degrees.length - 1];
      if (variant === "A" && p(musicalState, "cadence_pressure") >= 0.4) {
        deg = 0; // resolve
      } else if (variant === "B") {
        deg = debt === 4 ? 5 : debt; // deceptive or continue
      } else if (debt === 4 && variant === "A") {
        deg = 0;
      }
    }

    const rnList = DEGREE_RN[mode] || DEGREE_RN.major;
    const qList = DEGREE_Q[mode] || DEGREE_Q.major;
    const baseQ = qList[deg];
    const quality = pickQuality(baseQ, musicalState, profile, variant);
    const octave = clamp(
      Math.round(
        profile.register +
          (p(musicalState, "register_spread") - 0.5) * 1.5 +
          (world && world.agent === "beta" ? -0.5 : 0)
      ),
      2,
      6
    );
    const nBars = barCount(musicalState, profile);
    const tempo = tempoFrom(musicalState, profile);
    const dens =
      p(musicalState, "harmonic_density") * 0.5 + profile.density * 0.5;
    const decisions = [];

    decisions.push({
      what: "key",
      choice: tonic + " " + mode,
      reason: world
        ? "H4 mundo compartido · " + world.id
        : "perfil " +
          profile.id +
          " · mode_brightness " +
          p(musicalState, "mode_brightness").toFixed(2),
    });
    if (world) {
      decisions.push({
        what: "agent",
        choice: world.agent || "alfa",
        reason: "Alfa=blancas · Beta=negras · mismo mundo armónico",
      });
    }
    decisions.push({
      what: "degree",
      choice: rnList[deg],
      reason:
        variant === "B"
          ? "variante B: resolución engañosa / suave"
          : "cadence_pressure " +
            p(musicalState, "cadence_pressure").toFixed(2) +
            " · forcing " +
            v(gameState, "forcing").toFixed(2),
    });
    decisions.push({
      what: "quality",
      choice: quality,
      reason:
        "dissonance " +
        p(musicalState, "dissonance").toFixed(2) +
        " · prefs " +
        (profile.preferred_qualities || []).join(","),
    });
    decisions.push({
      what: "tempo",
      choice: String(tempo) + " bpm",
      reason:
        "rhythmic_drive×perfil.drive · phrase_length " +
        p(musicalState, "phrase_length").toFixed(2),
    });
    decisions.push({
      what: "bars",
      choice: String(nBars),
      reason: "phrase_length / urgency → span ",
    });

    // Progression across bars: stay / go to V / resolve
    const degSeq = [];
    for (let b = 0; b < nBars; b++) {
      if (b === nBars - 1 && variant === "A") {
        degSeq.push(p(musicalState, "cadence_pressure") >= 0.45 ? 0 : deg);
      } else if (b === nBars - 1 && variant === "B") {
        degSeq.push(5); // deceptive
      } else if (b === Math.floor(nBars / 2)) {
        degSeq.push(variant === "B" ? 3 : 4);
      } else {
        degSeq.push(deg);
      }
    }

    const bars = degSeq.map(function (d, bi) {
      const q = pickQuality(
        (DEGREE_Q[mode] || DEGREE_Q.major)[d],
        musicalState,
        profile,
        variant
      );
      const midis = buildMidisForMode(tonic, mode, d, q, octave);
      const rn = (DEGREE_RN[mode] || DEGREE_RN.major)[d];
      const melDegs = melodyDegrees(mode, d, dens);
      const steps = SCALES[mode] || SCALES.major;
      const melody = melDegs.map(function (md, mi) {
        const pc = (tonicPc(tonic) + steps[md]) % 12;
        const midi = (octave + 1) * 12 + pc + (mi === 0 ? 12 : 0);
        return {
          beat: mi * (4 / Math.max(melDegs.length, 1)),
          midi: midi,
          dur: 0.45,
          reason: "degree " + md + " over " + rn,
        };
      });
      const rhythm = rhythmPattern(
        profile.rhythm_feel,
        p(musicalState, "rhythmic_drive") * 0.5 + profile.drive * 0.5,
        bi
      );
      return {
        bar: bi + 1,
        duration_beats: 4,
        harmony: [
          {
            beat: 0,
            rn: rn,
            root_pc: (tonicPc(tonic) + steps[d]) % 12,
            quality: q,
            midis: midis,
            reason: "bar " + (bi + 1) + " · " + rn + "(" + q + ")",
          },
        ],
        melody: melody,
        rhythm: rhythm,
      };
    });

    const label =
      tonic +
      " " +
      mode +
      " · " +
      bars
        .map(function (b) {
          return b.harmony[0].rn;
        })
        .join("–") +
      " · " +
      profile.label +
      " [" +
      variant +
      "]";

    return global.AiramH2.createScoreProposal({
      session_id: gameState && gameState.session_id,
      source_state_id: gameState && gameState.id,
      source_frame_id: frame && frame.id,
      ply: (gameState && gameState.ply) || (frame && frame.ply) || 0,
      profile_id: profile.id,
      key: { tonic: tonic, mode: mode },
      meter: "4/4",
      tempo_bpm: tempo,
      bars: bars,
      decisions: decisions,
      label: label,
      variant: variant,
    });
  }

  /**
   * Plan A + B for A/B audible validation (H2).
   */
  function planPair(gameState, musicalState, frame, profileId, opts) {
    opts = opts || {};
    const profile = global.AiramH2.CharacterProfiles.get(
      profileId || "neutral"
    );
    const a = planVariant(gameState, musicalState, frame, profile, "A", opts);
    const b = planVariant(gameState, musicalState, frame, profile, "B", opts);
    return { A: a, B: b, profile: profile };
  }

  /**
   * Flatten score to timed note events (seconds) for Piano playback.
   * stems: harmony | melody | rhythm | all
   */
  function toEvents(score, stem) {
    stem = stem || "all";
    const bpm = score.tempo_bpm || 96;
    const beatSec = 60 / bpm;
    const events = [];
    let t = 0;
    (score.bars || []).forEach(function (bar) {
      if (stem === "all" || stem === "harmony") {
        (bar.harmony || []).forEach(function (h) {
          (h.midis || []).forEach(function (m, i) {
            events.push({
              t: t + h.beat * beatSec + i * 0.02,
              midi: m,
              dur: Math.max(0.35, bar.duration_beats * beatSec * 0.85),
              vel: 0.34,
              stem: "harmony",
            });
          });
        });
      }
      if (stem === "all" || stem === "melody") {
        (bar.melody || []).forEach(function (n) {
          events.push({
            t: t + n.beat * beatSec,
            midi: n.midi,
            dur: n.dur || 0.4,
            vel: 0.42,
            stem: "melody",
          });
        });
      }
      if (stem === "all" || stem === "rhythm") {
        (bar.rhythm || []).forEach(function (r) {
          // soft percussive click as low midi blip
          events.push({
            t: t + r.beat * beatSec,
            midi: 36 + (r.kind === "swing" ? 2 : 0),
            dur: 0.08,
            vel: (r.vel || 0.4) * 0.5,
            stem: "rhythm",
          });
        });
      }
      t += (bar.duration_beats || 4) * beatSec;
    });
    events.sort(function (a, b) {
      return a.t - b.t;
    });
    return { events: events, duration: t };
  }

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.ScorePlanner = {
    planVariant: planVariant,
    planPair: planPair,
    toEvents: toEvents,
  };
})(typeof window !== "undefined" ? window : globalThis);
