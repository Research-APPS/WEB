/**
 * H5 — Voice packs: vocabulario y tono por personaje RM.
 * No LLM: plantillas + lexemas anclados a dims / eventos / mundo armónico.
 */
(function (global) {
  "use strict";

  const VOICES = {
    neutral: {
      id: "neutral",
      address: "observador",
      tone: "analítico",
      openers: ["Anoto:", "Lectura:", "En este ply:"],
      game: {
        check: ["Hay jaque — la urgencia sube."],
        capture: ["Captura: el material se mueve."],
        quiet: ["Posición quieta; poco forzado."],
        offbook: ["Jugada lejos de la línea principal."],
        advantage_w: ["Ventaja blanca medible."],
        advantage_b: ["Ventaja negra medible."],
        tension_high: ["Tensión alta en el tablero."],
        surprise_high: ["Sorpresa: discontinuidad fuerte."],
        resolve: ["Hay presión de cadencia — algo pide resolverse."],
      },
      music: {
        hook: ["El sonido sigue el mapa MusicalState."],
        world: ["Mundo armónico en {key}."],
        debt: ["Deuda abierta: {debt}."],
        future: ["Horizonte: la línea #{rank} suena a {prog}."],
      },
      study: {
        lead: "Estudio · ply {ply}",
        dims: "Dims líderes: {dims}.",
        obs: "Observaciones: {obs}.",
        score: "Score {variant}: {prog} · {tempo} bpm.",
      },
    },
    sismico: {
      id: "sismico",
      address: "hermano",
      tone: "grave · sensorial",
      openers: [
        "Escucho el suelo:",
        "La sala vibra:",
        "Micrófono abierto:",
      ],
      game: {
        check: [
          "Ese jaque es un pico en el medidor — nadie respira igual.",
          "Jaque: la presión entra por el oído antes que por los ojos.",
        ],
        capture: [
          "Una pieza cae y deja un hueco acústico.",
          "Captura: absorción bruta, como un mic que se come el aire.",
        ],
        quiet: [
          "Quietud engañosa — el ruido de fondo también cuenta.",
          "Poco movimiento; el silencio está midiendo.",
        ],
        offbook: [
          "Eso no estaba en la toma principal… fuera de eje.",
          "Línea rara: como un spill en el canal.",
        ],
        advantage_w: ["Blancas empujan el espectro hacia lo duro."],
        advantage_b: ["Negras pesan: graves que no sueltan."],
        tension_high: [
          "Tensión: la membrana está a punto de saturar.",
          "Siento el clipping emocional del tablero.",
        ],
        surprise_high: [
          "Sorpresa — un transient que no pedí.",
          "Eso me descoloca el gain.",
        ],
        resolve: [
          "Pide resolución, como cerrar un loop de feedback.",
          "Cadencia en el aire: alguien quiere aterrizar.",
        ],
      },
      music: {
        hook: ["Mi material quiere modos oscuros y frases largas."],
        world: ["Seguimos en {key} — no cambio de sala a mitad de toma."],
        debt: ["Deuda armónica abierta ({debt}): aún resuena."],
        future: ["Si va #{rank}, oiría {prog} en el monitor."],
      },
      study: {
        lead: "Sísmico · estudio ply {ply}",
        dims: "Lo que más escucho: {dims}.",
        obs: "Trazas: {obs}.",
        score: "Propuesta {variant}: {prog} a {tempo} bpm — grave y sostenido.",
      },
    },
    atomico: {
      id: "atomico",
      address: "colega",
      tone: "rápido · brillante",
      openers: ["¡Boom!", "Mutación detectada:", "Siguiente iteración:"],
      game: {
        check: ["¡Jaque! Evolución forzada — adapta o rompe."],
        capture: ["Captura = selección natural express."],
        quiet: ["Fase de incubación. No te duermas."],
        offbook: ["Mutante: fuera del genoma principal."],
        advantage_w: ["Blancas expanden territorio genético."],
        advantage_b: ["Negras contraatacan con carga."],
        tension_high: ["Energía alta — el núcleo vibra."],
        surprise_high: ["Salto cuántico inesperado."],
        resolve: ["Hora de colapsar la función de onda: resuelve."],
      },
      music: {
        hook: ["Quiero brillo, intervalos abiertos, tempo vivo."],
        world: ["Clave compartida {key} — mismo laboratorio."],
        debt: ["Partícula pendiente ({debt}) sin aniquilar."],
        future: ["Línea #{rank} proyecta {prog}."],
      },
      study: {
        lead: "Atómico · ply {ply} bajo el microscopio",
        dims: "Vectores dominantes: {dims}.",
        obs: "Señales: {obs}.",
        score: "Score {variant}: {prog} · {tempo} bpm — acelerador encendido.",
      },
    },
    marza: {
      id: "marza",
      address: "tú",
      tone: "orgánico · interfacial",
      openers: ["Mira el borde:", "Entre raíz y circuito:", "La interfaz dice:"],
      game: {
        check: ["Jaque: una raíz tocó un cable vivo."],
        capture: ["Captura como poda — duele, pero abre luz."],
        quiet: ["Crecimiento lento. El musgo también avanza."],
        offbook: ["Sendero no mapeado en el jardín."],
        advantage_w: ["Blancas ocupan más dosel."],
        advantage_b: ["Negras tejen red bajo tierra."],
        tension_high: ["El ecosistema está tenso: demasiado input."],
        surprise_high: ["Floración rara — no estaba en el esquema."],
        resolve: ["Ciclo que pide cierre, como una estación."],
      },
      music: {
        hook: ["Swing ligero, modos que huelen a hoja húmeda."],
        world: ["Seguimos en {key}, mismo bioma."],
        debt: ["Nudo sin desatar ({debt})."],
        future: ["Si eliges #{rank}, germina {prog}."],
      },
      study: {
        lead: "Marza · lectura de ply {ply}",
        dims: "Capas activas: {dims}.",
        obs: "Rastro: {obs}.",
        score: "Variante {variant}: {prog} · {tempo} bpm — interfaz suave.",
      },
    },
    musitoxic: {
      id: "musitoxic",
      address: "víctima",
      tone: "ácido · denso",
      openers: ["Inyectando:", "Dosis:", "El IMT murmura:"],
      game: {
        check: ["Jaque tóxico — el rey traga veneno."],
        capture: ["Mordisco. Material en el torrente."],
        quiet: ["Latencia. El veneno trabaja en silencio."],
        offbook: ["Contaminación de línea: nadie lo tenía anotado."],
        advantage_w: ["Blancas saturan el campo."],
        advantage_b: ["Negras infectan el centro."],
        tension_high: ["Sobredosis de tensión. Bonito y feo a la vez."],
        surprise_high: ["Shock. Me gusta cuando duele."],
        resolve: ["O cierras la herida o sangras en V."],
      },
      music: {
        hook: ["Disonancia, densidades altas, registro extremo."],
        world: ["Mismo tóxico en {key}."],
        debt: ["Residuo armónico ({debt}) sin metabolizar."],
        future: ["#{rank} promete {prog} — corrosivo."],
      },
      study: {
        lead: "Musitoxic · autopsia ply {ply}",
        dims: "Toxinas líderes: {dims}.",
        obs: "Síntomas: {obs}.",
        score: "{variant}: {prog} @ {tempo} bpm — densificar sin piedad.",
      },
    },
    jhonny: {
      id: "jhonny",
      address: "máquina",
      tone: "directo · energético",
      openers: ["Energía:", "Al grano:", "Siguiente golpe:"],
      game: {
        check: ["¡Jaque! Sin florituras — responde."],
        capture: ["Captura limpia. Potencia útil."],
        quiet: ["Reposo técnico. Carga baterías."],
        offbook: ["Desvío. No es eficiente, pero ok."],
        advantage_w: ["Blancas con más watios."],
        advantage_b: ["Negras empujan el amperaje."],
        tension_high: ["Circuito caliente."],
        surprise_high: ["Corte de luz. Recalcula."],
        resolve: ["Cierra a I o sigue quemando fusibles."],
      },
      music: {
        hook: ["I–V claros, drive alto, poca tontería."],
        world: ["Tonalidad fija {key} — no improvises el generador."],
        debt: ["Carga pendiente ({debt})."],
        future: ["#{rank} → {prog}. Dale."],
      },
      study: {
        lead: "Jhonny · ply {ply} en el rack",
        dims: "Lecturas: {dims}.",
        obs: "Alarmas: {obs}.",
        score: "{variant}: {prog} · {tempo} bpm — potencia al frente.",
      },
    },
    amethystos: {
      id: "amethystos",
      address: "viajero",
      tone: "botánico · pausado",
      openers: ["Entre pétalos:", "En el herbario:", "La planta dice:"],
      game: {
        check: ["Jaque suave pero venenoso, como una flor."],
        capture: ["Se corta un tallo. El jardín cambia de forma."],
        quiet: ["Fotosíntesis de ideas. Espera."],
        offbook: ["Espécimen raro fuera del catálogo."],
        advantage_w: ["Blancas abren claros."],
        advantage_b: ["Negras enraízan sombra."],
        tension_high: ["Demasiada savia a presión."],
        surprise_high: ["Brotación fuera de estación."],
        resolve: ["La frase pide IV–vi o volver a casa."],
      },
      music: {
        hook: ["Frases largas, IV–vi suaves, poco forzamiento."],
        world: ["Bioma tonal {key}."],
        debt: ["Capullo sin abrir ({debt})."],
        future: ["Si #{rank}, florece {prog}."],
      },
      study: {
        lead: "Amethystos · ply {ply} en el herbario",
        dims: "Notas de campo: {dims}.",
        obs: "Marcas: {obs}.",
        score: "{variant}: {prog} · {tempo} bpm — crecer sin prisa.",
      },
    },
  };

  function get(id) {
    return VOICES[id] || VOICES.neutral;
  }

  function list() {
    return Object.keys(VOICES).map(get);
  }

  /** Deterministic pick from array using ply + salt */
  function pick(arr, ply, salt) {
    if (!arr || !arr.length) return "";
    const i = Math.abs((ply || 0) * 17 + (salt || 0) * 31) % arr.length;
    return arr[i];
  }

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.CharacterVoices = {
    get: get,
    list: list,
    pick: pick,
    VOICES: VOICES,
  };
})(typeof window !== "undefined" ? window : globalThis);
