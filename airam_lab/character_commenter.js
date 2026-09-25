/**
 * H5 — Character commenter.
 * GameState + CausalTrace + MusicalState + HarmonicWorld + Score →
 * comentarios en voz del personaje (live + estudio profundo).
 */
(function (global) {
  "use strict";

  function v(gs, dim) {
    const d = gs && gs.current && gs.current[dim];
    return d && typeof d.value === "number" ? d.value : 0;
  }

  function topDims(gs, n) {
    if (!gs || !gs.current) return [];
    const dims = global.AiramH2.DIMENSIONS || [];
    return dims
      .map(function (name) {
        return { name: name, value: v(gs, name) };
      })
      .sort(function (a, b) {
        return Math.abs(b.value) - Math.abs(a.value);
      })
      .slice(0, n || 3);
  }

  function fill(tpl, map) {
    return String(tpl || "").replace(/\{(\w+)\}/g, function (_, k) {
      return map[k] != null ? map[k] : "";
    });
  }

  function gameTriggers(frame, gs) {
    const tags = [];
    if (frame && frame.check) tags.push("check");
    if (frame && frame.capture) tags.push("capture");
    if (frame && frame.horizon && frame.horizon.played_rank >= 3)
      tags.push("offbook");
    if (v(gs, "tension") >= 0.6) tags.push("tension_high");
    if (v(gs, "surprise") >= 0.55) tags.push("surprise_high");
    if (v(gs, "advantage") >= 0.35) tags.push("advantage_w");
    if (v(gs, "advantage") <= -0.35) tags.push("advantage_b");
    if (v(gs, "forcing") >= 0.55 || v(gs, "urgency") >= 0.55)
      tags.push("resolve");
    if (!tags.length) tags.push("quiet");
    return tags;
  }

  function progOf(score) {
    if (!score || !score.bars) return "—";
    return score.bars
      .map(function (b) {
        return b.harmony && b.harmony[0] ? b.harmony[0].rn : "?";
      })
      .join("–");
  }

  /**
   * Live comment for a ply (short, charismatic).
   */
  function commentLive(ctx) {
    const voice = global.AiramH2.CharacterVoices.get(ctx.profileId);
    const pick = global.AiramH2.CharacterVoices.pick;
    const ply = (ctx.frame && ctx.frame.ply) || 0;
    const triggers = gameTriggers(ctx.frame, ctx.gameState);
    const lines = [];
    const opener = pick(voice.openers, ply, 1);
    const primary = triggers[0];
    const gameLine = pick(voice.game[primary] || voice.game.quiet, ply, 2);
    lines.push({
      kind: "game",
      text: opener + " " + gameLine,
    });

    if (triggers.length > 1 && triggers[1] !== primary) {
      lines.push({
        kind: "game",
        text: pick(voice.game[triggers[1]] || [], ply, 3),
      });
    }

    // Music hook from world / score
    if (ctx.world) {
      const key = ctx.world.tonic + " " + ctx.world.mode;
      lines.push({
        kind: "music",
        text: fill(pick(voice.music.world, ply, 4), { key: key }),
      });
      if (ctx.world.open_degrees && ctx.world.open_degrees.length) {
        lines.push({
          kind: "music",
          text: fill(pick(voice.music.debt, ply, 5), {
            debt: ctx.world.open_degrees.join(","),
          }),
        });
      }
    } else {
      lines.push({
        kind: "music",
        text: pick(voice.music.hook, ply, 4),
      });
    }

    if (ctx.horizon && ctx.horizon.futures && ctx.horizon.futures[0]) {
      const f0 = ctx.horizon.futures[0];
      lines.push({
        kind: "music",
        text: fill(pick(voice.music.future, ply, 6), {
          rank: f0.rank,
          prog: progOf(f0.score),
        }),
      });
    }

    // Affect spice
    if (global.AiramH2.AffectLexicon && v(ctx.gameState, "tension") >= 0.55) {
      const emo = global.AiramH2.AffectLexicon.EMOTIONS;
      const id =
        v(ctx.gameState, "surprise") >= 0.5
          ? "sorpresa"
          : v(ctx.gameState, "urgency") >= 0.5
            ? "miedo"
            : "ansiedad";
      if (emo[id]) {
        lines.push({
          kind: "affect",
          text: "Afecto: " + emo[id].label + " — " + emo[id].description,
        });
      }
    }

    const filtered = lines.filter(function (l) {
      return l.text && String(l.text).trim();
    });

    return {
      ply: ply,
      profile_id: voice.id,
      mode: "live",
      tone: voice.tone,
      headline: opener,
      lines: filtered,
      triggers: triggers,
    };
  }

  /**
   * Deep study comment for a ply (longer, structured).
   */
  function commentStudy(ctx) {
    const voice = global.AiramH2.CharacterVoices.get(ctx.profileId);
    const ply = (ctx.frame && ctx.frame.ply) || 0;
    const dims = topDims(ctx.gameState, 3)
      .map(function (d) {
        return d.name + " " + d.value.toFixed(2);
      })
      .join(", ");
    let obs = "—";
    if (ctx.causalTrace && ctx.causalTrace.observations) {
      obs = ctx.causalTrace.observations.slice(0, 5).join(", ");
    }
    const score = ctx.scoreA || (ctx.scorePair && ctx.scorePair.A);
    const map = {
      ply: ply,
      dims: dims || "—",
      obs: obs,
      variant: score ? score.variant : "A",
      prog: progOf(score),
      tempo: score ? score.tempo_bpm : "—",
    };
    const lines = [
      {
        kind: "study",
        text: fill(voice.study.lead, map),
      },
      { kind: "study", text: fill(voice.study.dims, map) },
      { kind: "study", text: fill(voice.study.obs, map) },
      { kind: "study", text: fill(voice.study.score, map) },
    ];

    // Reuse live game colour as closing
    const live = commentLive(ctx);
    if (live.lines[0]) {
      lines.push({
        kind: "game",
        text: "En voz corta: " + live.lines[0].text,
      });
    }
    if (ctx.world) {
      lines.push({
        kind: "music",
        text:
          "Mundo Alfa/Beta: " +
          global.AiramH2.HarmonicWorld.summary(ctx.world),
      });
    }
    if (ctx.frame && ctx.frame.candidates && ctx.frame.candidates.length) {
      lines.push({
        kind: "game",
        text:
          "PASS B: " +
          ctx.frame.candidates
            .slice(0, 3)
            .map(function (c) {
              return "#" + c.rank + " " + c.uci + " (" + c.score_cp + ")";
            })
            .join(" · "),
      });
    }

    return {
      ply: ply,
      profile_id: voice.id,
      mode: "study",
      tone: voice.tone,
      headline: fill(voice.study.lead, map),
      lines: lines,
      triggers: live.triggers,
      evidence: {
        dims: topDims(ctx.gameState, 5),
        observations:
          (ctx.causalTrace && ctx.causalTrace.observations) || [],
      },
    };
  }

  function buildContext(opts) {
    opts = opts || {};
    return {
      profileId: opts.profileId || "neutral",
      frame: opts.frame,
      gameState: opts.gameState,
      musicalState: opts.musicalState,
      causalTrace: opts.causalTrace,
      world: opts.world,
      scorePair: opts.scorePair,
      scoreA: opts.scoreA,
      horizon: opts.horizon,
    };
  }

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.CharacterCommenter = {
    commentLive: commentLive,
    commentStudy: commentStudy,
    buildContext: buildContext,
    gameTriggers: gameTriggers,
  };
})(typeof window !== "undefined" ? window : globalThis);
