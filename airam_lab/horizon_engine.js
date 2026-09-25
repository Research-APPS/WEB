/**
 * H0 — Horizon / dual-pass analysis (local minimax stand-in for Stockfish).
 *
 * PASS A  · MultiPV=1 — best move + short PV
 * PASS B  · MultiPV=K — top-K root candidates + score gaps
 *
 * Deterministic (no RNG). Threads=1. Same board+depth → same output.
 * Real Stockfish WASM remains future debt; this fills GameFrame fields
 * so surprise / ambiguity / forcing can leave proxy-zeros.
 */
(function (global) {
  "use strict";

  const ENGINE_KIND = "local-minimax-h0";
  const ENGINE_VERSION = "horizon-v0.1";

  function Core() {
    return global.AiramH2.ChessCore;
  }

  /** Logistic WDL proxy from white-relative eval (cp). Not NNUE. */
  function wdlFromEval(evalCp) {
    const x = (evalCp || 0) / 280;
    const w = 1 / (1 + Math.exp(-x));
    const l = 1 / (1 + Math.exp(x));
    const d = Math.max(0, 1 - w - l);
    const sum = w + d + l || 1;
    return {
      w: Math.round((1000 * w) / sum),
      d: Math.round((1000 * d) / sum),
      l: Math.round((1000 * l) / sum),
    };
  }

  /**
   * Score every legal root move at `depth` (minimax after the move).
   * Returns white-relative cp scores; sorted best-first for `color`.
   */
  function rankRootMoves(board, color, rights, depth) {
    const C = Core();
    const rightsSafe = rights || C.defaultCastling();
    const moves = C.allLegalMoves(board, color, rightsSafe);
    const scored = [];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const applied = C.applyMove(board, m.from, m.to, rightsSafe);
      const score = C.minimax
        ? C.minimax(
            applied.board,
            Math.max(0, depth - 1),
            -Infinity,
            Infinity,
            color !== "w",
            applied.rights
          )
        : C.evaluate(applied.board);
      const uci = C.moveUci(m.from, m.to);
      scored.push({
        uci: uci,
        from: m.from.slice(),
        to: m.to.slice(),
        score_cp: Math.round(score),
      });
    }
    scored.sort(function (a, b) {
      if (color === "w") {
        if (b.score_cp !== a.score_cp) return b.score_cp - a.score_cp;
      } else {
        if (a.score_cp !== b.score_cp) return a.score_cp - b.score_cp;
      }
      return a.uci < b.uci ? -1 : a.uci > b.uci ? 1 : 0;
    });
    return scored;
  }

  function shortPv(board, color, rights, depth, best) {
    const C = Core();
    if (!best) return [];
    const pv = [best.uci];
    if (depth < 2) return pv;
    const applied = C.applyMove(board, best.from, best.to, rights);
    const replyColor = color === "w" ? "b" : "w";
    const replies = rankRootMoves(
      applied.board,
      replyColor,
      applied.rights,
      Math.max(1, depth - 1)
    );
    if (replies.length) pv.push(replies[0].uci);
    return pv;
  }

  /**
   * Dual pass on a position (side to move = color).
   * @returns {{
   *   pass_a: object, pass_b: object, wdl: object,
   *   gaps: object, engine: object, ranked: object[]
   * }}
   */
  function analyzePosition(board, color, rights, opts) {
    opts = opts || {};
    const depth = opts.depth != null ? opts.depth : 2;
    const k = opts.multipv != null ? opts.multipv : 3;
    const C = Core();
    const rightsSafe = rights || C.defaultCastling();
    const ranked = rankRootMoves(board, color, rightsSafe, depth);
    const best = ranked[0] || null;
    const topK = ranked.slice(0, Math.max(1, k)).map(function (c, i) {
      return {
        rank: i + 1,
        uci: c.uci,
        score_cp: c.score_cp,
      };
    });
    const evalCp = best ? best.score_cp : C.evaluate(board);
    const topGap =
      topK.length >= 2
        ? Math.abs(topK[0].score_cp - topK[1].score_cp)
        : 0;
    const spread =
      topK.length >= 2
        ? Math.abs(topK[0].score_cp - topK[topK.length - 1].score_cp)
        : 0;

    return {
      pass_a: {
        multipv: 1,
        depth: depth,
        best_move: best ? best.uci : null,
        score_cp: best ? best.score_cp : evalCp,
        pv: shortPv(board, color, rightsSafe, depth, best),
      },
      pass_b: {
        multipv: Math.min(k, ranked.length) || 1,
        depth: depth,
        candidates: topK,
      },
      wdl: wdlFromEval(evalCp),
      gaps: {
        top_gap_cp: topGap,
        spread_cp: spread,
        candidate_count: topK.length,
      },
      engine: {
        kind: ENGINE_KIND,
        version: ENGINE_VERSION,
        nnue: null,
        nodes: ranked.length,
        multipv: Math.min(k, ranked.length) || 1,
        threads: 1,
        depth: depth,
        notes:
          "H0 local PASS A≠PASS B. Stockfish WASM = future debt.",
      },
      ranked: ranked,
    };
  }

  /** Rank of a played UCI among PASS B candidates (1-based); null if absent. */
  function playedRank(candidates, moveUci) {
    if (!moveUci || !candidates || !candidates.length) return null;
    for (let i = 0; i < candidates.length; i++) {
      if (candidates[i].uci === moveUci) return candidates[i].rank;
    }
    return null;
  }

  /**
   * Enrich a GameFrame with horizon fields from the position *before* the move.
   * Mutates and returns the frame.
   */
  function enrichFrame(frame, boardBefore, sideMoved, rightsBefore, opts) {
    opts = opts || {};
    if (!frame || !boardBefore || !sideMoved) return frame;
    // Skip heavy analysis on ply 0
    if (frame.ply < 1) return frame;
    const analysis = analyzePosition(
      boardBefore,
      sideMoved,
      rightsBefore,
      opts
    );
    const moveUci = frame.move_uci;
    const rank = playedRank(analysis.pass_b.candidates, moveUci);
    // If played move not in top-K, find full rank among all root moves
    let fullRank = rank;
    let playedScore = null;
    if (moveUci && analysis.ranked) {
      for (let i = 0; i < analysis.ranked.length; i++) {
        if (analysis.ranked[i].uci === moveUci) {
          fullRank = i + 1;
          playedScore = analysis.ranked[i].score_cp;
          break;
        }
      }
    }
    frame.best_move = analysis.pass_a.best_move;
    frame.pv = analysis.pass_a.pv;
    frame.candidates = analysis.pass_b.candidates;
    frame.wdl = analysis.wdl;
    frame.pass_a = analysis.pass_a;
    frame.pass_b = analysis.pass_b;
    frame.horizon = {
      gaps: analysis.gaps,
      played_rank: fullRank,
      played_in_top: rank != null,
      played_score_cp: playedScore,
      best_score_cp: analysis.pass_a.score_cp,
      score_gap_to_best_cp:
        playedScore != null && analysis.pass_a.score_cp != null
          ? Math.abs(analysis.pass_a.score_cp - playedScore)
          : null,
    };
    frame.engine = Object.assign({}, frame.engine || {}, analysis.engine, {
      pass: "A+B",
    });
    return frame;
  }

  /**
   * Re-run PASS A/B on every ply of a session (rebuild boards from move list).
   * Mutates frames in place. Deterministic.
   */
  function reanalyzeFrames(frames, opts) {
    opts = opts || {};
    const C = Core();
    let board = C.initialBoard();
    let rights = C.defaultCastling();
    const sorted = frames.slice().sort(function (a, b) {
      return a.ply - b.ply;
    });
    for (let i = 0; i < sorted.length; i++) {
      const f = sorted[i];
      if (f.ply < 1 || !f.move_uci || f.move_uci.length < 4) continue;
      const from = algebraicToRC(f.move_uci.slice(0, 2));
      const to = algebraicToRC(f.move_uci.slice(2, 4));
      const sideMoved = f.side_to_move === "w" ? "b" : "w";
      enrichFrame(f, board, sideMoved, rights, opts);
      const applied = C.applyMove(board, from, to, rights);
      board = applied.board;
      rights = applied.rights;
    }
    return sorted;
  }

  function algebraicToRC(s) {
    return [8 - parseInt(s[1], 10), s.charCodeAt(0) - 97];
  }

  /** Stable fingerprint of horizon-critical frame fields (replay verify). */
  function framesFingerprint(frames) {
    const parts = frames
      .slice()
      .sort(function (a, b) {
        return a.ply - b.ply;
      })
      .map(function (f) {
        const cands = (f.candidates || [])
          .map(function (c) {
            return c.rank + ":" + c.uci + ":" + c.score_cp;
          })
          .join(",");
        return [
          f.ply,
          f.move_uci || "-",
          f.eval_cp,
          f.best_move || "-",
          cands,
          f.horizon && f.horizon.played_rank != null
            ? f.horizon.played_rank
            : "-",
        ].join("|");
      });
    return simpleHash(parts.join("\n"));
  }

  function statesFingerprint(states) {
    const dims = global.AiramH2.DIMENSIONS || [];
    const parts = states
      .slice()
      .sort(function (a, b) {
        return a.ply - b.ply;
      })
      .map(function (s) {
        return (
          s.ply +
          ":" +
          dims
            .map(function (d) {
              const v =
                s.current && s.current[d] ? s.current[d].value : 0;
              return d[0] + Math.round(v * 1000);
            })
            .join(",")
        );
      });
    return simpleHash(parts.join(";"));
  }

  function simpleHash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ("00000000" + (h >>> 0).toString(16)).slice(-8);
  }

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.HorizonEngine = {
    analyzePosition: analyzePosition,
    enrichFrame: enrichFrame,
    reanalyzeFrames: reanalyzeFrames,
    rankRootMoves: rankRootMoves,
    wdlFromEval: wdlFromEval,
    framesFingerprint: framesFingerprint,
    statesFingerprint: statesFingerprint,
    ENGINE_KIND: ENGINE_KIND,
    ENGINE_VERSION: ENGINE_VERSION,
  };
})(typeof window !== "undefined" ? window : globalThis);
