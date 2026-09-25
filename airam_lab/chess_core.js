/**
 * Chess core for AIRAM lab.
 * Castling + basic promo. En passant = future debt (tagged in FEN as "-").
 * Future debt: Stockfish WASM for WDL/PV/MultiPV.
 */
(function (global) {
  "use strict";

  const PIECE_VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
  const FILES = "abcdefgh";

  function initialBoard() {
    const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
    const b = [];
    b.push(back.map((t) => "b" + t));
    b.push(Array(8).fill("bP"));
    for (let i = 0; i < 4; i++) b.push(Array(8).fill(null));
    b.push(Array(8).fill("wP"));
    b.push(back.map((t) => "w" + t));
    return b;
  }

  function defaultCastling() {
    return { wK: true, wQ: true, bK: true, bQ: true };
  }

  function cloneCastling(c) {
    return { wK: !!c.wK, wQ: !!c.wQ, bK: !!c.bK, bQ: !!c.bQ };
  }

  function cloneBoard(b) {
    return b.map((row) => row.slice());
  }

  function inBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }
  function pieceColor(p) {
    return p ? p[0] : null;
  }
  function pieceType(p) {
    return p ? p[1] : null;
  }
  function sq(r, c) {
    return FILES[c] + (8 - r);
  }

  function castlingFen(rights) {
    let s = "";
    if (rights.wK) s += "K";
    if (rights.wQ) s += "Q";
    if (rights.bK) s += "k";
    if (rights.bQ) s += "q";
    return s || "-";
  }

  function fenFromBoard(board, turn, rights) {
    const rows = [];
    for (let r = 0; r < 8; r++) {
      let empty = 0;
      let row = "";
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p) empty++;
        else {
          if (empty) {
            row += empty;
            empty = 0;
          }
          const t = pieceType(p);
          row += pieceColor(p) === "w" ? t : t.toLowerCase();
        }
      }
      if (empty) row += empty;
      rows.push(row);
    }
    const castle = rights ? castlingFen(rights) : "-";
    return rows.join("/") + " " + turn + " " + castle + " - 0 1";
  }

  function material(board) {
    let w = 0,
      b = 0;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p) continue;
        const v = PIECE_VALUE[pieceType(p)] || 0;
        if (pieceColor(p) === "w") w += v;
        else b += v;
      }
    return { w, b, diff: (w - b) / 100 };
  }

  function pseudoMoves(b, r, c) {
    const p = b[r][c];
    if (!p) return [];
    const color = pieceColor(p),
      type = pieceType(p);
    const enemy = color === "w" ? "b" : "w";
    const moves = [];
    function slide(dirs) {
      for (const [dr, dc] of dirs) {
        let nr = r + dr,
          nc = c + dc;
        while (inBounds(nr, nc)) {
          const t = b[nr][nc];
          if (!t) moves.push([nr, nc]);
          else {
            if (pieceColor(t) === enemy) moves.push([nr, nc]);
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
    }
    function steps(deltas) {
      for (const [dr, dc] of deltas) {
        const nr = r + dr,
          nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const t = b[nr][nc];
        if (!t || pieceColor(t) === enemy) moves.push([nr, nc]);
      }
    }
    if (type === "R") slide([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    else if (type === "B")
      slide([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
    else if (type === "Q")
      slide([
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]);
    else if (type === "N")
      steps([
        [1, 2],
        [2, 1],
        [-1, 2],
        [-2, 1],
        [1, -2],
        [2, -1],
        [-1, -2],
        [-2, -1],
      ]);
    else if (type === "K")
      steps([
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]);
    else if (type === "P") {
      const dir = color === "w" ? -1 : 1;
      const startRow = color === "w" ? 6 : 1;
      if (inBounds(r + dir, c) && !b[r + dir][c]) {
        moves.push([r + dir, c]);
        if (r === startRow && !b[r + 2 * dir][c]) moves.push([r + 2 * dir, c]);
      }
      for (const dc of [-1, 1]) {
        const nr = r + dir,
          nc = c + dc;
        if (inBounds(nr, nc) && b[nr][nc] && pieceColor(b[nr][nc]) === enemy)
          moves.push([nr, nc]);
      }
    }
    return moves;
  }

  function findKing(b, color) {
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        if (b[r][c] === color + "K") return [r, c];
    return null;
  }

  function isSquareAttacked(b, r, c, byColor) {
    for (let rr = 0; rr < 8; rr++)
      for (let cc = 0; cc < 8; cc++) {
        const p = b[rr][cc];
        if (p && pieceColor(p) === byColor) {
          if (pseudoMoves(b, rr, cc).some((m) => m[0] === r && m[1] === c))
            return true;
        }
      }
    return false;
  }

  function inCheck(b, color) {
    const k = findKing(b, color);
    if (!k) return false;
    return isSquareAttacked(b, k[0], k[1], color === "w" ? "b" : "w");
  }

  /** Castling targets: king destination squares if legal geometrically + rights. */
  function castlingTargets(b, color, rights) {
    const out = [];
    if (!rights) return out;
    const row = color === "w" ? 7 : 0;
    const enemy = color === "w" ? "b" : "w";
    const kingHome = color + "K";
    if (b[row][4] !== kingHome) return out;
    if (inCheck(b, color)) return out;

    function pathClear(cols) {
      return cols.every((c) => !b[row][c]);
    }
    function safe(cols) {
      return cols.every((c) => !isSquareAttacked(b, row, c, enemy));
    }

    // kingside
    const kFlag = color === "w" ? rights.wK : rights.bK;
    if (kFlag && b[row][7] === color + "R" && pathClear([5, 6]) && safe([4, 5, 6])) {
      out.push([row, 6]);
    }
    // queenside
    const qFlag = color === "w" ? rights.wQ : rights.bQ;
    if (
      qFlag &&
      b[row][0] === color + "R" &&
      pathClear([1, 2, 3]) &&
      safe([4, 3, 2])
    ) {
      out.push([row, 2]);
    }
    return out;
  }

  function legalMovesFor(b, r, c, rights) {
    const p = b[r][c];
    if (!p) return [];
    const color = pieceColor(p);
    const rightsSafe = rights || defaultCastling();
    let candidates = pseudoMoves(b, r, c);
    if (pieceType(p) === "K") {
      candidates = candidates.concat(castlingTargets(b, color, rightsSafe));
    }
    return candidates.filter(([nr, nc]) => {
      const { board: clone } = applyMove(b, [r, c], [nr, nc], rightsSafe);
      return !inCheck(clone, color);
    });
  }

  function allLegalMoves(b, color, rights) {
    const out = [];
    const rightsSafe = rights || defaultCastling();
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        if (pieceColor(b[r][c]) !== color) continue;
        for (const [nr, nc] of legalMovesFor(b, r, c, rightsSafe)) {
          out.push({ from: [r, c], to: [nr, nc] });
        }
      }
    return out;
  }

  function evaluate(b) {
    let score = 0;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const p = b[r][c];
        if (!p) continue;
        const v = PIECE_VALUE[pieceType(p)] || 0;
        score += pieceColor(p) === "w" ? v : -v;
        const center =
          (r === 3 || r === 4) && (c === 3 || c === 4) ? 10 : 0;
        score += pieceColor(p) === "w" ? center : -center;
      }
    if (inCheck(b, "w")) score -= 40;
    if (inCheck(b, "b")) score += 40;
    return score;
  }

  function updateRightsAfterMove(board, from, to, piece, captured, rights) {
    const next = cloneCastling(rights || defaultCastling());
    const color = pieceColor(piece);
    const type = pieceType(piece);

    if (type === "K") {
      if (color === "w") {
        next.wK = false;
        next.wQ = false;
      } else {
        next.bK = false;
        next.bQ = false;
      }
    }
    if (type === "R") {
      if (color === "w") {
        if (from[0] === 7 && from[1] === 7) next.wK = false;
        if (from[0] === 7 && from[1] === 0) next.wQ = false;
      } else {
        if (from[0] === 0 && from[1] === 7) next.bK = false;
        if (from[0] === 0 && from[1] === 0) next.bQ = false;
      }
    }
    // rook captured on corner
    if (captured && pieceType(captured) === "R") {
      if (to[0] === 7 && to[1] === 7) next.wK = false;
      if (to[0] === 7 && to[1] === 0) next.wQ = false;
      if (to[0] === 0 && to[1] === 7) next.bK = false;
      if (to[0] === 0 && to[1] === 0) next.bQ = false;
    }
    return next;
  }

  function applyMove(b, from, to, rights) {
    const next = cloneBoard(b);
    const piece = next[from[0]][from[1]];
    const captured = next[to[0]][to[1]];
    const rightsIn = rights || defaultCastling();
    let isCastle = false;

    next[to[0]][to[1]] = piece;
    next[from[0]][from[1]] = null;

    // Castling: king moves two files
    if (piece && pieceType(piece) === "K" && Math.abs(to[1] - from[1]) === 2) {
      isCastle = true;
      const row = from[0];
      if (to[1] === 6) {
        // kingside: rook h → f
        next[row][5] = next[row][7];
        next[row][7] = null;
      } else if (to[1] === 2) {
        // queenside: rook a → d
        next[row][3] = next[row][0];
        next[row][0] = null;
      }
    }

    if (piece && pieceType(piece) === "P" && (to[0] === 0 || to[0] === 7))
      next[to[0]][to[1]] = pieceColor(piece) + "Q";

    const newRights = updateRightsAfterMove(
      next,
      from,
      to,
      piece,
      captured,
      rightsIn
    );
    return { board: next, captured, piece, rights: newRights, isCastle };
  }

  function minimax(b, depth, alpha, beta, maximizing, rights) {
    const rightsSafe = rights || defaultCastling();
    if (depth === 0) return evaluate(b);
    const color = maximizing ? "w" : "b";
    const moves = allLegalMoves(b, color, rightsSafe);
    if (!moves.length) {
      if (inCheck(b, color)) return maximizing ? -99999 : 99999;
      return 0;
    }
    if (maximizing) {
      let value = -Infinity;
      for (const m of moves) {
        const { board: nb, rights: nr } = applyMove(b, m.from, m.to, rightsSafe);
        value = Math.max(
          value,
          minimax(nb, depth - 1, alpha, beta, false, nr)
        );
        alpha = Math.max(alpha, value);
        if (alpha >= beta) break;
      }
      return value;
    }
    let value = Infinity;
    for (const m of moves) {
      const { board: nb, rights: nr } = applyMove(b, m.from, m.to, rightsSafe);
      value = Math.min(value, minimax(nb, depth - 1, alpha, beta, true, nr));
      beta = Math.min(beta, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  function positionKey(b, turn, rights) {
    return fenFromBoard(b, turn, rights || defaultCastling());
  }

  function chooseBotMove(b, color, depth, rights, opts) {
    const rightsSafe = rights || defaultCastling();
    opts = opts || {};
    const avoidKeys = opts.avoidKeys || null;
    const preferDiverse = opts.preferDiverse !== false;
    let moves = allLegalMoves(b, color, rightsSafe);
    if (!moves.length) return null;

    // Soft filter: drop moves that reverse the last opponent reply loop
    // or recreate a recently seen position (when alternatives exist).
    if (preferDiverse && avoidKeys && avoidKeys.size) {
      const filtered = moves.filter((m) => {
        const { board: nb, rights: nr } = applyMove(b, m.from, m.to, rightsSafe);
        const nextTurn = color === "w" ? "b" : "w";
        return !avoidKeys.has(positionKey(nb, nextTurn, nr));
      });
      if (filtered.length) moves = filtered;
    }

    let best = [];
    let bestScore = color === "w" ? -Infinity : Infinity;
    for (const m of moves) {
      const { board: nb, rights: nr } = applyMove(b, m.from, m.to, rightsSafe);
      let score = minimax(
        nb,
        depth - 1,
        -Infinity,
        Infinity,
        color !== "w",
        nr
      );
      // tiny jitter so equal evals don't ping-pong forever
      score += (Math.random() - 0.5) * 0.01;
      if (color === "w") {
        if (score > bestScore) {
          bestScore = score;
          best = [m];
        } else if (Math.abs(score - bestScore) < 1e-6) best.push(m);
      } else {
        if (score < bestScore) {
          bestScore = score;
          best = [m];
        } else if (Math.abs(score - bestScore) < 1e-6) best.push(m);
      }
    }
    return best[Math.floor(Math.random() * best.length)];
  }

  function hangingCount(b, color) {
    const enemy = color === "w" ? "b" : "w";
    let n = 0;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const p = b[r][c];
        if (!p || pieceColor(p) !== color) continue;
        if (isSquareAttacked(b, r, c, enemy)) {
          const defenders = isSquareAttacked(b, r, c, color);
          const val = PIECE_VALUE[pieceType(p)] || 0;
          if (!defenders || val >= 300) n++;
        }
      }
    return n;
  }

  function kingOpenness(b, color) {
    const k = findKing(b, color);
    if (!k) return 0;
    let open = 0;
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const nr = k[0] + dr,
        nc = k[1] + dc;
      if (!inBounds(nr, nc) || !b[nr][nc]) open++;
    }
    return open;
  }

  function moveUci(from, to) {
    return sq(from[0], from[1]) + sq(to[0], to[1]);
  }

  function classifyTags(opts) {
    const tags = [];
    if (opts.ended === "checkmate") tags.push("checkmate");
    if (opts.check) tags.push("check");
    if (opts.castle) tags.push("castle");
    if (opts.capture) {
      tags.push("captura");
      if (opts.capturedValue >= 320) tags.push("capturegrande");
    }
    if (opts.evalDelta <= -150) tags.push("error");
    if (opts.evalDelta >= 150) tags.push("buena");
    return tags;
  }

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.ChessCore = {
    initialBoard,
    defaultCastling,
    cloneCastling,
    cloneBoard,
    fenFromBoard,
    material,
    legalMovesFor,
    allLegalMoves,
    inCheck,
    evaluate,
    applyMove,
    minimax,
    positionKey,
    chooseBotMove,
    hangingCount,
    kingOpenness,
    moveUci,
    sq,
    pieceColor,
    pieceType,
    PIECE_VALUE,
    classifyTags,
  };
})(typeof window !== "undefined" ? window : globalThis);
