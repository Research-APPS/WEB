/**
 * Léxico afectivo estático para AIRAM Chess Lab.
 * Fuentes:
 *  - AIRAM affective.py (emociones ONYX-inspiradas)
 *  - CORE #ontoEmo (MFOEM / EmotionML / ONYX: tipos básicos + dimensiones)
 * Sin servidor: solo etiquetas + dimensiones para verbalizar el juego.
 */
(function (global) {
  "use strict";

  /** EmotionML / ONYX dimensions */
  const DIMENSIONS = {
    valence: {
      id: "valence",
      label: "Valencia",
      onyx: "onyx:Dimension#Valence",
      blurb: "Agradable ↔ desagradable",
    },
    arousal: {
      id: "arousal",
      label: "Activación",
      onyx: "onyx:Dimension#Arousal",
      blurb: "Energía ↔ calma",
    },
    intensity: {
      id: "intensity",
      label: "Intensidad",
      onyx: "onyx:Dimension#Intensity",
      blurb: "Fuerza con que se vive",
    },
    dominance: {
      id: "dominance",
      label: "Dominancia",
      onyx: "onyx:Dimension#Dominance",
      blurb: "Control ↔ vulnerabilidad",
    },
  };

  /** Basic types from CORE #ontoEmo + AIRAM travel affect */
  const EMOTIONS = {
    alegria: {
      label: "Alegría",
      family: "basica",
      onyx_ref: "onyx:EmotionCategory#Joy",
      valence: 1,
      arousal: 0.6,
      description: "Recompensa, apertura social, alivio luminoso",
    },
    tristeza: {
      label: "Tristeza",
      family: "basica",
      onyx_ref: "onyx:EmotionCategory#Sadness",
      valence: -1,
      arousal: 0.25,
      description: "Pérdida, fracaso, peso en el pecho del tablero",
    },
    miedo: {
      label: "Miedo",
      family: "basica",
      onyx_ref: "onyx:EmotionCategory#Fear",
      valence: -0.8,
      arousal: 0.85,
      description: "Amenaza cercana, rey expuesto, urgencia de escapar",
    },
    ira: {
      label: "Ira",
      family: "basica",
      onyx_ref: "onyx:EmotionCategory#Anger",
      valence: -0.6,
      arousal: 0.9,
      description: "Respuesta agresiva, líneas forzadas, contrapunch",
    },
    sorpresa: {
      label: "Sorpresa",
      family: "basica",
      onyx_ref: "onyx:EmotionCategory#Surprise",
      valence: 0,
      arousal: 0.8,
      description: "Salto inesperado: la eval se rompe de golpe",
    },
    asco: {
      label: "Asco",
      family: "basica",
      onyx_ref: "onyx:EmotionCategory#Disgust",
      valence: -0.7,
      arousal: 0.4,
      description: "Rechazo a una línea fea o un error crudo",
    },
    ansiedad: {
      label: "Ansiedad",
      family: "animo",
      onyx_ref: "onyx:EmotionCategory#Anxiety",
      valence: -0.5,
      arousal: 0.75,
      description: "Activación alta sin salida clara",
    },
    euforia: {
      label: "Euforia",
      family: "animo",
      onyx_ref: "onyx:EmotionCategory#Euphoria",
      valence: 1,
      arousal: 0.95,
      description: "Oleada de dominio, casi embriaguez táctica",
    },
    calma: {
      label: "Calma",
      family: "animo",
      onyx_ref: "onyx:EmotionCategory#Calm",
      valence: 0.4,
      arousal: 0.15,
      description: "Baja activación, posición que respira",
    },
    melancolia: {
      label: "Melancolía",
      family: "animo",
      onyx_ref: "onyx:EmotionCategory#Melancholy",
      valence: -0.55,
      arousal: 0.2,
      description: "Pérdida lenta, final que se apaga",
    },
    apertura: {
      label: "Apertura",
      family: "airam",
      onyx_ref: "onyx:EmotionCategory#Openness",
      valence: 0.7,
      arousal: 0.55,
      description: "Curiosidad, ganas de mundo — debut de la partida",
    },
    nostalgia: {
      label: "Nostalgia",
      family: "airam",
      onyx_ref: "onyx:EmotionCategory#Nostalgia",
      valence: -0.2,
      arousal: 0.35,
      description: "Eco de una etapa anterior del relato",
    },
    reparacion: {
      label: "Reparación",
      family: "airam",
      onyx_ref: "onyx:EmotionCategory#Relief",
      valence: 0.65,
      arousal: 0.45,
      description: "Recolocar, sanar, remontar una herida de material",
    },
    evitacion: {
      label: "Evitación",
      family: "airam",
      onyx_ref: "onyx:EmotionCategory#Withdrawal",
      valence: -0.4,
      arousal: 0.5,
      description: "Huir del roce, simplificar para no sentir",
    },
    pertenencia: {
      label: "Pertenencia",
      family: "airam",
      onyx_ref: "onyx:EmotionCategory#Belonging",
      valence: 0.55,
      arousal: 0.4,
      description: "Encaje, coordinación, piezas que se reconocen",
    },
  };

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.AffectLexicon = {
    DIMENSIONS: DIMENSIONS,
    EMOTIONS: EMOTIONS,
    source:
      "AIRAM affective.py (ONYX) + CORE #ontoEmo (MFOEM/EmotionML)",
  };
})(typeof window !== "undefined" ? window : globalThis);
