/**
 * ChessAdapter — board events → GameFrame
 */
(function (global) {
  "use strict";

  const Core = () => global.AiramH2.ChessCore;

  function buildFrameAfterMove(sessionId, ply, boardBefore, boardAfter, move, meta) {
    const C = Core();
    const turnBefore = meta.sideMoved; // who just moved
    const sideToMove = turnBefore === "w" ? "b" : "w";
    const evalBefore = C.evaluate(boardBefore);
    const evalAfter = C.evaluate(boardAfter);
    const evalDelta =
      (turnBefore === "w" ? 1 : -1) * (evalAfter - evalBefore);
    const legal = C.allLegalMoves(boardAfter, sideToMove);
    const check = C.inCheck(boardAfter, sideToMove);
    const mat = C.material(boardAfter);
    const capturedVal = move.captured
      ? C.PIECE_VALUE[C.pieceType(move.captured)] || 0
      : 0;
    let ended = null;
    if (!legal.length) {
      ended = check ? "checkmate" : "stalemate";
    }
    const tags = C.classifyTags({
      ended,
      check,
      capture: !!move.captured,
      capturedValue: capturedVal,
      evalDelta,
    });
    const uci = C.moveUci(move.from, move.to);
    const sanApprox =
      (move.captured ? "x" : "") + C.sq(move.to[0], move.to[1]);

    return global.AiramH2.createGameFrame({
      session_id: sessionId,
      ply,
      fen: C.fenFromBoard(boardAfter, sideToMove),
      side_to_move: sideToMove,
      move_uci: uci,
      move_san: sanApprox,
      eval_cp: evalAfter,
      eval_before_cp: evalBefore,
      eval_delta_cp: evalDelta,
      wdl: null,
      best_move: null,
      pv: [],
      candidates: [],
      legal_moves: legal.map((m) => C.moveUci(m.from, m.to)),
      legal_move_count: legal.length,
      check,
      capture: !!move.captured,
      material: mat,
      tags,
      attacked_hanging_count:
        C.hangingCount(boardAfter, "w") + C.hangingCount(boardAfter, "b"),
      king_openness: {
        w: C.kingOpenness(boardAfter, "w"),
        b: C.kingOpenness(boardAfter, "b"),
      },
      engine: {
        kind: "local-minimax",
        version: global.AiramH2.ADAPTER_VERSION,
        nnue: null,
        nodes: null,
        multipv: 1,
        threads: 1,
        depth: meta.botDepth || null,
        notes:
          "H−2 local engine. Stockfish go/WDL/PV/MultiPV = future debt (H0).",
      },
      ended,
    });
  }

  function buildInitialFrame(sessionId, board) {
    const C = Core();
    const legal = C.allLegalMoves(board, "w");
    return global.AiramH2.createGameFrame({
      session_id: sessionId,
      ply: 0,
      fen: C.fenFromBoard(board, "w"),
      side_to_move: "w",
      move_uci: null,
      move_san: null,
      eval_cp: C.evaluate(board),
      eval_before_cp: null,
      eval_delta_cp: 0,
      legal_moves: legal.map((m) => C.moveUci(m.from, m.to)),
      legal_move_count: legal.length,
      check: C.inCheck(board, "w"),
      capture: false,
      material: C.material(board),
      tags: ["start"],
      attacked_hanging_count:
        C.hangingCount(board, "w") + C.hangingCount(board, "b"),
      king_openness: {
        w: C.kingOpenness(board, "w"),
        b: C.kingOpenness(board, "b"),
      },
    });
  }

  global.AiramH2.ChessAdapter = {
    buildFrameAfterMove,
    buildInitialFrame,
  };
})(typeof window !== "undefined" ? window : globalThis);
