/**
 * AIRAM piano engine — same approach as CHORDIA Solfeo:
 * soundfont-player + MusyngKite acoustic_grand_piano, oscillator fallback.
 * Static / GitHub Pages friendly (CDN only).
 */
(function (global) {
  "use strict";

  const INSTRUMENT = "acoustic_grand_piano";
  const SOUNDFONT = "MusyngKite";

  let ctx = null;
  let master = null;
  let instrument = null;
  let loadPromise = null;
  let enabled = true;
  let volume = 0.7;
  let activeNodes = [];

  function soundfontOk() {
    return (
      typeof global.Soundfont !== "undefined" &&
      typeof global.Soundfont.instrument === "function"
    );
  }

  function ensureContext() {
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) throw new Error("Web Audio no disponible");
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    return ctx;
  }

  function ensureRunning() {
    const c = ensureContext();
    if (c.state === "suspended") return c.resume();
    return Promise.resolve();
  }

  function loadInstrument() {
    if (instrument) return Promise.resolve(instrument);
    if (loadPromise) return loadPromise;
    if (!soundfontOk()) {
      return Promise.resolve(null);
    }
    const c = ensureContext();
    loadPromise = global.Soundfont.instrument(c, INSTRUMENT, {
      soundfont: SOUNDFONT,
      destination: master,
    })
      .then(function (inst) {
        instrument = inst;
        return inst;
      })
      .catch(function () {
        instrument = null;
        return null;
      });
    return loadPromise;
  }

  /** Call from a user gesture before first sound. */
  function warm() {
    return ensureRunning().then(loadInstrument);
  }

  function setEnabled(on) {
    enabled = !!on;
    if (!enabled) stopAll();
    try {
      global.localStorage.setItem("airam-piano-on", enabled ? "1" : "0");
    } catch (e) {}
  }

  function isEnabled() {
    return enabled;
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = volume;
    try {
      global.localStorage.setItem("airam-piano-vol", String(volume));
    } catch (e) {}
  }

  function getVolume() {
    return volume;
  }

  function stopAll() {
    activeNodes.forEach(function (n) {
      try {
        if (n.stop) n.stop();
      } catch (e) {}
    });
    activeNodes = [];
  }

  function midiToHz(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  function playOsc(midi, when, dur, vel) {
    const c = ensureContext();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(midiToHz(midi), when);
    const v = Math.max(0.001, vel * volume);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(v, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(when);
    osc.stop(when + dur + 0.02);
    activeNodes.push(osc);
    osc.onended = function () {
      activeNodes = activeNodes.filter(function (x) {
        return x !== osc;
      });
    };
  }

  function playMidi(midi, when, dur, vel) {
    if (instrument && typeof instrument.play === "function") {
      try {
        const node = instrument.play(midi, when, {
          duration: dur,
          gain: vel,
        });
        if (node) activeNodes.push(node);
        return;
      } catch (e) {}
    }
    playOsc(midi, when, dur, vel);
  }

  /**
   * @param {number[]} midis
   * @param {{ duration?: number, velocity?: number, arpeggio?: boolean }} [opts]
   */
  function playChord(midis, opts) {
    if (!enabled || !midis || !midis.length) return Promise.resolve(null);
    opts = opts || {};
    const dur = opts.duration != null ? opts.duration : 1.1;
    const vel = opts.velocity != null ? opts.velocity : 0.38;
    const arp = !!opts.arpeggio;

    return ensureRunning()
      .then(loadInstrument)
      .then(function () {
        stopAll();
        const c = ensureContext();
        const t0 = c.currentTime + 0.02;
        midis.forEach(function (m, i) {
          const when = arp ? t0 + i * 0.045 : t0;
          playMidi(m, when, dur, vel * (1 - i * 0.04));
        });
        return { midis: midis.slice(), when: t0, duration: dur };
      });
  }

  /**
   * H2 — play timed events [{t, midi, dur, vel}] relative to now.
   */
  function playEvents(events, opts) {
    if (!enabled || !events || !events.length) return Promise.resolve(null);
    opts = opts || {};
    return ensureRunning()
      .then(loadInstrument)
      .then(function () {
        if (opts.stopPrevious !== false) stopAll();
        const c = ensureContext();
        const t0 = c.currentTime + 0.03;
        let maxEnd = 0;
        events.forEach(function (ev) {
          const when = t0 + (ev.t || 0);
          const dur = ev.dur != null ? ev.dur : 0.4;
          const vel = ev.vel != null ? ev.vel : 0.38;
          playMidi(ev.midi, when, dur, vel);
          maxEnd = Math.max(maxEnd, (ev.t || 0) + dur);
        });
        return { count: events.length, duration: maxEnd };
      });
  }

  /** H2 — play ScoreProposal via ScorePlanner.toEvents */
  function playScore(score, stem) {
    if (!score || !global.AiramH2.ScorePlanner) return Promise.resolve(null);
    const packed = global.AiramH2.ScorePlanner.toEvents(score, stem || "all");
    return playEvents(packed.events, { stopPrevious: true }).then(function (r) {
      return Object.assign(
        { score_id: score.id, variant: score.variant },
        r || {},
        { duration: packed.duration }
      );
    });
  }

  // restore prefs
  try {
    const on = global.localStorage.getItem("airam-piano-on");
    if (on === "0") enabled = false;
    const vol = parseFloat(global.localStorage.getItem("airam-piano-vol"));
    if (!Number.isNaN(vol)) volume = Math.max(0, Math.min(1, vol));
  } catch (e) {}

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.Piano = {
    warm: warm,
    playChord: playChord,
    playEvents: playEvents,
    playScore: playScore,
    stopAll: stopAll,
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    setVolume: setVolume,
    getVolume: getVolume,
    INSTRUMENT: INSTRUMENT,
    SOUNDFONT: SOUNDFONT,
  };
})(typeof window !== "undefined" ? window : globalThis);
