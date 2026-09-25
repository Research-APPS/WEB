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
    const rights = meta.rightsAfter || C.defaultCastling();
    const rightsBefore = meta.rightsBefore || rights;
    const evalBefore = C.evaluate(boardBefore);
    const evalAfter = C.evaluate(boardAfter);
    const evalDelta =
      (turnBefore === "w" ? 1 : -1) * (evalAfter - evalBefore);
    const legal = C.allLegalMoves(boardAfter, sideToMove, rights);
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
      castle: !!move.isCastle,
      capture: !!move.captured,
      capturedValue: capturedVal,
      evalDelta,
    });
    const uci = C.moveUci(move.from, move.to);
    const sanApprox = move.isCastle
      ? move.to[1] === 6
        ? "O-O"
        : "O-O-O"
      : (move.captured ? "x" : "") + C.sq(move.to[0], move.to[1]);

    const frame = global.AiramH2.createGameFrame({
      session_id: sessionId,
      ply,
      fen: C.fenFromBoard(boardAfter, sideToMove, rights),
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
      castle: !!move.isCastle,
      captured_piece: move.captured || null,
      captured_value: capturedVal,
      material: mat,
      tags,
      castling_rights: C.cloneCastling(rights),
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
        notes: "H0: enrich with HorizonEngine PASS A≠B when available.",
      },
      ended,
    });

    // H0 dual pass (skip if meta.skipHorizon — e.g. bulk import before reanalyze)
    if (
      !meta.skipHorizon &&
      global.AiramH2.HorizonEngine &&
      ply >= 1
    ) {
      const depth =
        meta.horizonDepth != null
          ? meta.horizonDepth
          : meta.botDepth != null
            ? Math.min(meta.botDepth, 2)
            : 2;
      global.AiramH2.HorizonEngine.enrichFrame(
        frame,
        boardBefore,
        turnBefore,
        rightsBefore,
        { depth: depth, multipv: meta.multipv || 3 }
      );
    }
    return frame;
  }

  function buildInitialFrame(sessionId, board, rights) {
    const C = Core();
    const castle = rights || C.defaultCastling();
    const legal = C.allLegalMoves(board, "w", castle);
    return global.AiramH2.createGameFrame({
      session_id: sessionId,
      ply: 0,
      fen: C.fenFromBoard(board, "w", castle),
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
      castle: false,
      material: C.material(board),
      tags: ["start"],
      castling_rights: C.cloneCastling(castle),
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
