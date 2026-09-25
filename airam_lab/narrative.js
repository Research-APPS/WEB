/**
 * AIRAM narrative — resume de partida a partir de GameFrame / GameState.
 * Fases, salud material, remontadas y pasajes reproducibles.
 */
(function (global) {
  "use strict";

  function matOf(frame, side) {
    if (!frame || !frame.material) return side === "w" ? 3900 : 3900;
    return side === "w" ? frame.material.w || 0 : frame.material.b || 0;
  }

  function advOf(state) {
    if (!state || !state.current || !state.current.advantage) return 0;
    return state.current.advantage.value || 0;
  }

  function tensionOf(state) {
    if (!state || !state.current || !state.current.tension) return 0;
    return state.current.tension.value || 0;
  }

  function healthPct(materialCp) {
    // full start ≈ 3900 (Q+2R+2B+2N+8P); king not counted in PIECE_VALUE
    const full = 3900;
    return Math.max(0, Math.min(100, Math.round((materialCp / full) * 100)));
  }

  function pieceCountApprox(frame) {
    // from material: rough non-pawn weight
    const w = matOf(frame, "w");
    const b = matOf(frame, "b");
    return w + b;
  }

  function detectPhase(ply, frame, totalPlies) {
    const mass = pieceCountApprox(frame);
    if (ply <= 12 && mass > 6000) return "opening";
    if (mass < 2800 || ply > totalPlies * 0.75) return "endgame";
    return "middlegame";
  }

  const PHASE_LABEL = {
    opening: "Apertura",
    middlegame: "Medio juego",
    endgame: "Final",
  };

  /**
   * Build ordered passages + headline narrative.
   * @param {object[]} frames
   * @param {object[]} states
   * @param {{ white?: string, black?: string }} [names]
   */
  function buildSummary(frames, states, names) {
    names = names || {};
    const white = names.white || "Blancas";
    const black = names.black || "Negras";
    const n = frames.length;
    if (n < 2) {
      return {
        headline: "Todavía no hay partida que contar.",
        paragraphs: ["Juega unos plies y AIRAM resumirá fases, salud y remontadas."],
        phases: [],
        passages: [],
        health: { w: 100, b: 100 },
        comeback: null,
        ending: null,
      };
    }

    const lastF = frames[n - 1];
    const lastS = states[n - 1];
    const health = {
      w: healthPct(matOf(lastF, "w")),
      b: healthPct(matOf(lastF, "b")),
      wMat: matOf(lastF, "w"),
      bMat: matOf(lastF, "b"),
      diff: ((lastF.material && lastF.material.diff) || 0),
    };

    // Phase runs
    const phaseAt = [];
    for (let i = 0; i < n; i++) {
      phaseAt.push(detectPhase(i, frames[i], n - 1));
    }
    const phases = [];
    let runStart = 0;
    for (let i = 1; i <= n; i++) {
      if (i === n || phaseAt[i] !== phaseAt[runStart]) {
        phases.push({
          id: phaseAt[runStart],
          label: PHASE_LABEL[phaseAt[runStart]],
          startPly: runStart,
          endPly: i - 1,
        });
        runStart = i;
      }
    }

    // Advantage timeline for comeback
    let minAdv = Infinity;
    let maxAdv = -Infinity;
    let minPly = 0;
    let maxPly = 0;
    for (let i = 0; i < n; i++) {
      const a = advOf(states[i]);
      if (a < minAdv) {
        minAdv = a;
        minPly = i;
      }
      if (a > maxAdv) {
        maxAdv = a;
        maxPly = i;
      }
    }
    let comeback = null;
    // White was worse then recovered
    if (minAdv <= -0.35 && maxAdv >= 0.2 && minPly < maxPly) {
      comeback = {
        side: "w",
        label: white,
        fromPly: minPly,
        toPly: maxPly,
        fromAdv: minAdv,
        toAdv: maxAdv,
      };
    }
    // Black was worse (high white adv) then recovered
    if (maxAdv >= 0.35 && minAdv <= -0.2 && maxPly < minPly) {
      comeback = {
        side: "b",
        label: black,
        fromPly: maxPly,
        toPly: minPly,
        fromAdv: -maxAdv,
        toAdv: -minAdv,
      };
    }

    // Peak tension ply
    let peakT = 0;
    let peakPly = 0;
    for (let i = 0; i < n; i++) {
      const t = tensionOf(states[i]);
      if (t > peakT) {
        peakT = t;
        peakPly = i;
      }
    }

    // Passages: phase blocks + optional swing split
    const passages = [];
    let pIndex = 1;
    for (const ph of phases) {
      const mid = Math.floor((ph.startPly + ph.endPly) / 2);
      const f0 = frames[ph.startPly];
      const f1 = frames[ph.endPly];
      const s0 = states[ph.startPly];
      const s1 = states[ph.endPly];
      const hw0 = healthPct(matOf(f0, "w"));
      const hb0 = healthPct(matOf(f0, "b"));
      const hw1 = healthPct(matOf(f1, "w"));
      const hb1 = healthPct(matOf(f1, "b"));
      const dAdv = advOf(s1) - advOf(s0);

      let beat = "equilibrio provisional";
      if (dAdv > 0.25) beat = white + " toma la iniciativa";
      else if (dAdv < -0.25) beat = black + " toma la iniciativa";
      if (Math.abs(hw1 - hw0) >= 8 || Math.abs(hb1 - hb0) >= 8) {
        beat +=
          "; el material se mueve (salud " +
          white +
          " " +
          hw0 +
          "→" +
          hw1 +
          "%, " +
          black +
          " " +
          hb0 +
          "→" +
          hb1 +
          "%)";
      }

      passages.push({
        index: pIndex++,
        id: "p" + (pIndex - 1) + "-" + ph.id,
        title: "Pasaje " + (pIndex - 1) + " · " + ph.label,
        phase: ph.id,
        startPly: ph.startPly,
        endPly: ph.endPly,
        summary: beat,
        healthStart: { w: hw0, b: hb0 },
        healthEnd: { w: hw1, b: hb1 },
        advantageEnd: advOf(s1),
        midPly: mid,
      });
    }

    // Insert a "climax" passage marker if peak tension sits inside a long phase
    if (peakT >= 0.55 && peakPly > 0) {
      const host = passages.find(
        (p) => peakPly >= p.startPly && peakPly <= p.endPly
      );
      if (host) {
        host.climaxPly = peakPly;
        host.summary +=
          ". Pico de tensión en ply " + peakPly + " (" + peakT.toFixed(2) + ")";
      }
    }

    if (comeback) {
      const host = passages.find(
        (p) =>
          comeback.toPly >= p.startPly && comeback.toPly <= p.endPly
      );
      if (host) {
        host.comeback = true;
        host.summary +=
          ". Remontada de " +
          comeback.label +
          " (plies " +
          comeback.fromPly +
          "→" +
          comeback.toPly +
          ")";
      }
    }

    let ending = null;
    if (lastF.ended) {
      const map = {
        checkmate: "Jaque mate",
        stalemate: "Ahogado",
        repetition: "Tablas por repetición",
        ply_limit: "Corte por límite de plies",
      };
      ending = {
        kind: lastF.ended,
        label: map[lastF.ended] || lastF.ended,
      };
    }

    const paragraphs = [];
    paragraphs.push(
      "He seguido " +
        (n - 1) +
        " plies. Salud material ahora: " +
        white +
        " " +
        health.w +
        "% (" +
        (health.wMat / 100).toFixed(1) +
        " pts) · " +
        black +
        " " +
        health.b +
        "% (" +
        (health.bMat / 100).toFixed(1) +
        " pts)."
    );

    paragraphs.push(
      "Fases: " +
        phases
          .map(function (p) {
            return (
              p.label + " [ply " + p.startPly + "–" + p.endPly + "]"
            );
          })
          .join(" → ") +
        "."
    );

    if (comeback) {
      paragraphs.push(
        "Remontada: " +
          comeback.label +
          " pasó de ir peor (ply " +
          comeback.fromPly +
          ") a recuperar terreno hacia ply " +
          comeback.toPly +
          "."
      );
    } else {
      const a = advOf(lastS);
      if (a > 0.25) {
        paragraphs.push(white + " mantiene la ventaja expresiva al cierre.");
      } else if (a < -0.25) {
        paragraphs.push(black + " mantiene la ventaja expresiva al cierre.");
      } else {
        paragraphs.push("La partida se mantuvo equilibrada en ventaja neta.");
      }
    }

    if (ending) {
      paragraphs.push("Final: " + ending.label + ".");
    }

    const headline = ending
      ? "AIRAM · " + ending.label + " tras " + (n - 1) + " plies"
      : "AIRAM · relato a ply " + (n - 1);

    return {
      headline: headline,
      paragraphs: paragraphs,
      phases: phases,
      passages: passages,
      health: health,
      comeback: comeback,
      ending: ending,
      peakTension: { ply: peakPly, value: peakT },
    };
  }

  const PIECE_ES = {
    P: "peón",
    N: "caballo",
    B: "alfil",
    R: "torre",
    Q: "dama",
    K: "rey",
  };

  function pieceLabel(code) {
    if (!code || code.length < 2) return "pieza";
    const color = code[0] === "w" ? "blanco" : "negro";
    const name = PIECE_ES[code[1]] || "pieza";
    return name + " " + color;
  }

  function moverOf(frame) {
    if (!frame || frame.ply < 1) return null;
    return frame.side_to_move === "w" ? "b" : "w";
  }

  function avgDim(states, from, to, dim) {
    let s = 0;
    let n = 0;
    for (let i = from; i <= to; i++) {
      const st = states[i];
      if (!st || !st.current || !st.current[dim]) continue;
      s += st.current[dim].value || 0;
      n++;
    }
    return n ? s / n : 0;
  }

  function pickEmotions(ctx) {
    const Lex = global.AiramH2.AffectLexicon;
    if (!Lex) return [];
    const E = Lex.EMOTIONS;
    const scores = [];

    function add(id, w, why) {
      if (!E[id] || w <= 0) return;
      scores.push({ id: id, weight: w, why: why, meta: E[id] });
    }

    if (ctx.phase === "opening") add("apertura", 0.7, "fase de debut");
    if (ctx.avgSurprise >= 0.45) add("sorpresa", ctx.avgSurprise, "saltos de evaluación");
    if (ctx.avgUrgency >= 0.55 || ctx.checks >= 2)
      add("miedo", 0.55 + ctx.avgUrgency * 0.3, "amenazas y urgencia");
    if (ctx.avgTension >= 0.55 && ctx.avgForcing >= 0.4)
      add("ira", 0.5 + ctx.avgForcing * 0.3, "líneas forzadas");
    if (ctx.avgTension >= 0.5 && ctx.avgAmbiguity >= 0.45)
      add("ansiedad", 0.55, "tensión sin plan único");
    if (ctx.materialSwing >= 300) add("euforia", 0.7, "botín material grande");
    if (ctx.materialSwing <= -300) add("tristeza", 0.65, "sangría de material");
    if (ctx.comeback) add("reparacion", 0.8, "remontada");
    if (ctx.phase === "endgame" && ctx.avgTension < 0.35)
      add("melancolia", 0.45, "final que se apaga");
    if (ctx.avgTension < 0.3 && ctx.avgUrgency < 0.3)
      add("calma", 0.5, "posición que respira");
    if (ctx.captures >= 2 && ctx.avgAmbiguity < 0.4)
      add("pertenencia", 0.35, "piezas que se coordinan al chocar");
    if (ctx.avgAdvantage > 0.35) add("alegria", 0.4, "dominio blanco");
    if (ctx.avgAdvantage < -0.35) add("alegria", 0.35, "dominio negro");
    if (ctx.blunders >= 1) add("asco", 0.4, "error crudo");
    if (ctx.simplifications >= 2) add("evitacion", 0.4, "simplificar para no sufrir");

    scores.sort(function (a, b) {
      return b.weight - a.weight;
    });
    return scores.slice(0, 3);
  }

  function emotionDimensions(emotions) {
    const Lex = global.AiramH2.AffectLexicon;
    if (!Lex || !emotions.length) {
      return { valence: 0, arousal: 0.4, intensity: 0.4, dominance: 0.5 };
    }
    let v = 0,
      a = 0,
      n = 0;
    emotions.forEach(function (e) {
      v += (e.meta.valence || 0) * e.weight;
      a += (e.meta.arousal || 0.5) * e.weight;
      n += e.weight;
    });
    const valence = n ? v / n : 0;
    const arousal = n ? a / n : 0.4;
    return {
      valence: Math.max(-1, Math.min(1, valence)),
      arousal: Math.max(0, Math.min(1, arousal)),
      intensity: Math.max(
        0,
        Math.min(1, emotions[0].weight * 0.9)
      ),
      dominance: Math.max(
        0,
        Math.min(1, 0.5 + valence * 0.35 + (emotions[0].id === "miedo" ? -0.2 : 0))
      ),
    };
  }

  /**
   * Dual voice for a passage: robotic (facts/points) + emotional (ONYX/#ontoEmo).
   */
  function explainPassage(frames, states, passage, names) {
    names = names || {};
    const white = names.white || "Blancas";
    const black = names.black || "Negras";
    const from = passage.startPly;
    const to = passage.endPly;
    const events = [];
    let captures = 0;
    let checks = 0;
    let castles = 0;
    let blunders = 0;
    let simplifications = 0;
    let matStartW = matOf(frames[from], "w");
    let matStartB = matOf(frames[from], "b");
    let matEndW = matOf(frames[to], "w");
    let matEndB = matOf(frames[to], "b");
    let biggestSwing = null;

    for (let i = Math.max(1, from); i <= to; i++) {
      const f = frames[i];
      if (!f) continue;
      const mover = moverOf(f);
      const who = mover === "w" ? white : black;
      const prev = frames[i - 1];
      const dMat =
        prev && f.material
          ? {
              w: matOf(f, "w") - matOf(prev, "w"),
              b: matOf(f, "b") - matOf(prev, "b"),
            }
          : { w: 0, b: 0 };

      if (f.capture) {
        captures++;
        const victim = f.captured_piece
          ? pieceLabel(f.captured_piece)
          : "una pieza";
        const pts =
          f.captured_value != null
            ? (f.captured_value / 100).toFixed(1)
            : "?";
        events.push({
          ply: i,
          kind: "capture",
          text:
            "Ply " +
            i +
            ": " +
            who +
            " juega " +
            (f.move_uci || "?") +
            " y captura " +
            victim +
            " (−" +
            pts +
            " pts de material para el rival).",
        });
      }
      if (f.check) {
        checks++;
        events.push({
          ply: i,
          kind: "check",
          text:
            "Ply " +
            i +
            ": " +
            who +
            " da jaque (" +
            (f.move_san || f.move_uci || "?") +
            "). Logística: el rey rival debe resolver amenaza inmediata.",
        });
      }
      if (f.castle || (f.tags || []).includes("castle")) {
        castles++;
        events.push({
          ply: i,
          kind: "castle",
          text:
            "Ply " +
            i +
            ": " +
            who +
            " enroca (" +
            (f.move_san || f.move_uci) +
            "). Rey a zona más segura; torre entra en juego.",
        });
      }
      if ((f.tags || []).includes("error") || (f.eval_delta_cp || 0) <= -180) {
        blunders++;
        events.push({
          ply: i,
          kind: "blunder",
          text:
            "Ply " +
            i +
            ": caída brusca de eval (Δ " +
            (f.eval_delta_cp || 0) +
            " cp) tras " +
            (f.move_uci || "?") +
            ".",
        });
      }
      if (
        f.capture &&
        Math.abs(dMat.w) + Math.abs(dMat.b) >= 300 &&
        !f.check
      ) {
        simplifications++;
      }
      const swing = Math.abs(f.eval_delta_cp || 0);
      if (!biggestSwing || swing > biggestSwing.swing) {
        biggestSwing = {
          ply: i,
          swing: swing,
          delta: f.eval_delta_cp || 0,
          uci: f.move_uci,
          who: who,
        };
      }
    }

    const hw0 = healthPct(matStartW);
    const hb0 = healthPct(matStartB);
    const hw1 = healthPct(matEndW);
    const hb1 = healthPct(matEndB);
    const materialSwing = Math.max(
      matEndW - matStartW,
      matStartB - matEndB,
      matEndB - matStartB,
      matStartW - matEndW
    );

    const roboticParas = [];
    roboticParas.push(
      "Pasaje «" +
        passage.title +
        "» · plies " +
        from +
        "–" +
        to +
        " (" +
        (PHASE_LABEL[passage.phase] || passage.phase) +
        ")."
    );
    roboticParas.push(
      "Salud material: " +
        white +
        " " +
        hw0 +
        "% → " +
        hw1 +
        "% (" +
        (matStartW / 100).toFixed(1) +
        "→" +
        (matEndW / 100).toFixed(1) +
        " pts); " +
        black +
        " " +
        hb0 +
        "% → " +
        hb1 +
        "% (" +
        (matStartB / 100).toFixed(1) +
        "→" +
        (matEndB / 100).toFixed(1) +
        " pts)."
    );
    roboticParas.push(
      "Conteo logístico: " +
        captures +
        " captura(s), " +
        checks +
        " jaque(s), " +
        castles +
        " enroque(s)."
    );
    if (biggestSwing && biggestSwing.swing >= 80) {
      roboticParas.push(
        "Mayor golpe de eval: ply " +
          biggestSwing.ply +
          " por " +
          biggestSwing.who +
          " (" +
          (biggestSwing.uci || "?") +
          ", Δ " +
          biggestSwing.delta +
          " cp)."
      );
    }
    const eventLines = events.slice(0, 8).map(function (e) {
      return e.text;
    });
    if (!eventLines.length) {
      eventLines.push(
        "Sin capturas ni jaques destacados: el pasaje es sobre estructura y acumulación de pequeñas ventajas."
      );
    }

    const ctx = {
      phase: passage.phase,
      avgTension: avgDim(states, from, to, "tension"),
      avgUrgency: avgDim(states, from, to, "urgency"),
      avgSurprise: avgDim(states, from, to, "surprise"),
      avgForcing: avgDim(states, from, to, "forcing"),
      avgAmbiguity: avgDim(states, from, to, "ambiguity"),
      avgAdvantage: avgDim(states, from, to, "advantage"),
      captures: captures,
      checks: checks,
      blunders: blunders,
      simplifications: simplifications,
      materialSwing: matEndW - matStartW - (matEndB - matStartB),
      comeback: !!passage.comeback,
    };
    const emotions = pickEmotions(ctx);
    const dims = emotionDimensions(emotions);

    const emoParas = [];
    if (emotions.length) {
      emoParas.push(
        "En este tramo el tablero huele a " +
          emotions
            .map(function (e) {
              return e.meta.label;
            })
            .join(", ") +
          " (léxico ONYX / #ontoEmo)."
      );
      emotions.forEach(function (e) {
        emoParas.push(
          e.meta.label +
            ": " +
            e.meta.description +
            " — lo leo por " +
            e.why +
            "."
        );
      });
    } else {
      emoParas.push(
        "El pasaje es emocionalmente neutro: poca activación, sin climas claros."
      );
    }
    if (passage.comeback) {
      emoParas.push(
        "Hay reparación: alguien que iba peor vuelve a respirar. Eso no es solo eval; es alivio con cuerpo."
      );
    }
    if (ctx.phase === "opening") {
      emoParas.push(
        "Apertura: curiosidad de piezas que aún no saben cómo se van a llamar."
      );
    }
    if (ctx.phase === "endgame" && captures) {
      emoParas.push(
        "En el final cada captura suena más fuerte: queda menos escenario para esconderse."
      );
    }
    emoParas.push(
      "Dimensiones EmotionML: valencia " +
        dims.valence.toFixed(2) +
        ", activación " +
        dims.arousal.toFixed(2) +
        ", intensidad " +
        dims.intensity.toFixed(2) +
        ", dominancia " +
        dims.dominance.toFixed(2) +
        "."
    );

    return {
      passage: passage,
      robotic: {
        title: "Voz logística",
        paragraphs: roboticParas,
        events: eventLines,
      },
      emotional: {
        title: "Voz afectiva",
        paragraphs: emoParas,
        emotions: emotions.map(function (e) {
          return {
            id: e.id,
            label: e.meta.label,
            onyx_ref: e.meta.onyx_ref,
            weight: Math.round(e.weight * 100) / 100,
            why: e.why,
          };
        }),
        dimensions: dims,
        lexicon: global.AiramH2.AffectLexicon
          ? global.AiramH2.AffectLexicon.source
          : "",
      },
    };
  }

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.Narrative = {
    buildSummary: buildSummary,
    explainPassage: explainPassage,
    healthPct: healthPct,
    PHASE_LABEL: PHASE_LABEL,
  };
})(typeof window !== "undefined" ? window : globalThis);
