/**
 * H7 — GoAdapter: Go board events → GameFrame (same schema as chess).
 */
(function (global) {
  "use strict";

  function buildInitialFrame(sessionId, board) {
    const G = global.AiramH2.GoCore;
    const evalCp = G.evaluate(board);
    const sc = G.score(board);
    return global.AiramH2.createGameFrame({
      session_id: sessionId,
      ply: 0,
      fen: "go9:" + G.boardKey(board),
      side_to_move: "b",
      move_uci: null,
      eval_cp: evalCp,
      eval_before_cp: evalCp,
      eval_delta_cp: 0,
      legal_moves: G.legalMoves(board, "b", null).map(function (m) {
        return G.toCoord(m.r, m.c);
      }),
      legal_move_count: G.legalMoves(board, "b", null).length,
      material: {
        w: sc.white,
        b: sc.black,
        diff: sc.white - sc.black,
      },
      tags: ["go", "start"],
      attacked_hanging_count: G.hangingPressure(board, "b"),
      king_openness: { w: 0, b: 0 },
      engine: {
        kind: "go-lite",
        version: "go-adapter-v0.1",
        multipv: 1,
        threads: 1,
        notes: "H7 Go 9×9 lite → GameFrame",
      },
      source: "go",
    });
  }

  function buildFrameAfterMove(sessionId, ply, boardBefore, boardAfter, move, meta) {
    const G = global.AiramH2.GoCore;
    const sideMoved = meta.sideMoved;
    const sideToMove = sideMoved === "b" ? "w" : "b";
    const evalBefore = G.evaluate(boardBefore);
    const evalAfter = G.evaluate(boardAfter);
    const evalDelta =
      (sideMoved === "b" ? -1 : 1) * (evalAfter - evalBefore);
    const prevKey = meta.prevKey || null;
    const legal = G.legalMoves(boardAfter, sideToMove, meta.nextKey || null);
    const sc = G.score(boardAfter);
    const captured = move.captured || 0;
    const isPass = !!move.pass;
    const tags = ["go"];
    if (captured) tags.push("captura");
    if (captured >= 3) tags.push("capturegrande");
    if (isPass) tags.push("pass");
    if (evalDelta <= -150) tags.push("error");
    if (evalDelta >= 150) tags.push("buena");
    let ended = null;
    if (meta.consecutivePasses >= 2) ended = "scored";

    const uci = isPass
      ? "pass"
      : G.toCoord(move.r, move.c);

    return global.AiramH2.createGameFrame({
      session_id: sessionId,
      ply: ply,
      fen: "go9:" + G.boardKey(boardAfter),
      side_to_move: sideToMove,
      move_uci: uci,
      move_san: uci,
      eval_cp: evalAfter,
      eval_before_cp: evalBefore,
      eval_delta_cp: evalDelta,
      legal_moves: legal.map(function (m) {
        return G.toCoord(m.r, m.c);
      }),
      legal_move_count: legal.length,
      check: false,
      capture: captured > 0,
      captured_value: captured * 100,
      material: {
        w: sc.white,
        b: sc.black,
        diff: sc.white - sc.black,
      },
      tags: tags,
      attacked_hanging_count:
        G.hangingPressure(boardAfter, "b") +
        G.hangingPressure(boardAfter, "w"),
      king_openness: { w: 0, b: 0 },
      engine: {
        kind: "go-lite",
        version: "go-adapter-v0.1",
        multipv: 1,
        threads: 1,
        depth: 1,
        notes: "H7 Go adapter",
      },
      ended: ended,
      source: "go",
      go: {
        captured: captured,
        pass: isPass,
        score: sc,
        size: G.SIZE,
      },
    });
  }

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.GoAdapter = {
    buildInitialFrame: buildInitialFrame,
    buildFrameAfterMove: buildFrameAfterMove,
  };
})(typeof window !== "undefined" ? window : globalThis);
