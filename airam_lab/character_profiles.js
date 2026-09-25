/**
 * H1 — CharacterMusicProfile bank (Radio Micelio personas).
 * Biases only: tonic/mode/register/feel — not a generative model.
 */
(function (global) {
  "use strict";

  function P(partial) {
    return global.AiramH2.createCharacterMusicProfile(partial);
  }

  const PROFILES = [
    P({
      id: "neutral",
      label: "Neutro",
      blurb: "Sin sesgo de personaje — C mayor / la menor según MusicalState.",
      tonic: "C",
      mode_bias: "follow",
      register: 4,
      density: 0.45,
      drive: 0.45,
      brightness: 0.55,
      preferred_qualities: ["maj", "min", "dom7"],
      rhythm_feel: "straight",
      color: "#9aa3ad",
    }),
    P({
      id: "sismico",
      label: "Sísmico",
      blurb: "Microfonía · resonancia grave, frases largas, modos oscuros.",
      tonic: "D",
      mode_bias: "minor",
      register: 3,
      density: 0.55,
      drive: 0.35,
      brightness: 0.35,
      preferred_qualities: ["min", "min7", "sus4"],
      rhythm_feel: "pulse",
      color: "#6a9bb8",
    }),
    P({
      id: "atomico",
      label: "Atómico",
      blurb: "Evolución · brillo, intervalos abiertos, tempo vivo.",
      tonic: "G",
      mode_bias: "major",
      register: 5,
      density: 0.4,
      drive: 0.7,
      brightness: 0.8,
      preferred_qualities: ["maj", "add9", "dom7"],
      rhythm_feel: "straight",
      color: "#e0a060",
    }),
    P({
      id: "marza",
      label: "Marza",
      blurb: "Tecno-naturaleza · modal, densidad media, swing ligero.",
      tonic: "F",
      mode_bias: "modal",
      register: 4,
      density: 0.6,
      drive: 0.5,
      brightness: 0.5,
      preferred_qualities: ["maj7", "min7", "sus4"],
      rhythm_feel: "swing",
      color: "#7cb87a",
    }),
    P({
      id: "musitoxic",
      label: "Musitoxic",
      blurb: "IMT · disonancia, densidades altas, registro extremo.",
      tonic: "E",
      mode_bias: "minor",
      register: 2,
      density: 0.85,
      drive: 0.75,
      brightness: 0.25,
      preferred_qualities: ["dim", "dom7", "min7"],
      rhythm_feel: "pulse",
      color: "#c06080",
    }),
    P({
      id: "jhonny",
      label: "Jhonny",
      blurb: "Energía · drive rítmico, I–V claros, pocas ambigüedades.",
      tonic: "A",
      mode_bias: "major",
      register: 4,
      density: 0.35,
      drive: 0.85,
      brightness: 0.65,
      preferred_qualities: ["maj", "dom7"],
      rhythm_feel: "straight",
      color: "#d4c45a",
    }),
    P({
      id: "amethystos",
      label: "Amethystos",
      blurb: "Botánica · frases largas, IV–vi suaves, poco forzamiento.",
      tonic: "Bb",
      mode_bias: "major",
      register: 4,
      density: 0.5,
      drive: 0.3,
      brightness: 0.6,
      preferred_qualities: ["maj7", "min", "add9"],
      rhythm_feel: "pulse",
      color: "#9a7ab8",
    }),
  ];

  const BY_ID = {};
  PROFILES.forEach(function (p) {
    BY_ID[p.id] = p;
  });

  function list() {
    return PROFILES.slice();
  }

  function get(id) {
    return BY_ID[id] || BY_ID.neutral;
  }

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.CharacterProfiles = {
    list: list,
    get: get,
    PROFILES: PROFILES,
  };
})(typeof window !== "undefined" ? window : globalThis);
