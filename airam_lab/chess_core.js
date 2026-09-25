/**
 * Minimal chess core for H−2 lab (no castling/en passant).
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

  function fenFromBoard(board, turn) {
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
    return rows.join("/") + " " + turn + " - - 0 1";
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

  function legalMovesFor(b, r, c) {
    const p = b[r][c];
    if (!p) return [];
    const color = pieceColor(p);
    return pseudoMoves(b, r, c).filter(([nr, nc]) => {
      const clone = cloneBoard(b);
      clone[nr][nc] = clone[r][c];
      clone[r][c] = null;
      // promo
      if (pieceType(clone[nr][nc]) === "P" && (nr === 0 || nr === 7))
        clone[nr][nc] = color + "Q";
      return !inCheck(clone, color);
    });
  }

  function allLegalMoves(b, color) {
    const out = [];
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        if (pieceColor(b[r][c]) !== color) continue;
        for (const [nr, nc] of legalMovesFor(b, r, c)) {
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
        // center nudge
        const center =
          (r === 3 || r === 4) && (c === 3 || c === 4) ? 10 : 0;
        score += pieceColor(p) === "w" ? center : -center;
      }
    if (inCheck(b, "w")) score -= 40;
    if (inCheck(b, "b")) score += 40;
    return score;
  }

  function applyMove(b, from, to) {
    const next = cloneBoard(b);
    const piece = next[from[0]][from[1]];
    const captured = next[to[0]][to[1]];
    next[to[0]][to[1]] = piece;
    next[from[0]][from[1]] = null;
    if (pieceType(piece) === "P" && (to[0] === 0 || to[0] === 7))
      next[to[0]][to[1]] = pieceColor(piece) + "Q";
    return { board: next, captured, piece };
  }

  function minimax(b, depth, alpha, beta, maximizing) {
    if (depth === 0) return evaluate(b);
    const color = maximizing ? "w" : "b";
    const moves = allLegalMoves(b, color);
    if (!moves.length) {
      if (inCheck(b, color)) return maximizing ? -99999 : 99999;
      return 0;
    }
    if (maximizing) {
      let value = -Infinity;
      for (const m of moves) {
        const { board: nb } = applyMove(b, m.from, m.to);
        value = Math.max(value, minimax(nb, depth - 1, alpha, beta, false));
        alpha = Math.max(alpha, value);
        if (alpha >= beta) break;
      }
      return value;
    }
    let value = Infinity;
    for (const m of moves) {
      const { board: nb } = applyMove(b, m.from, m.to);
      value = Math.min(value, minimax(nb, depth - 1, alpha, beta, true));
      beta = Math.min(beta, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  function chooseBotMove(b, color, depth) {
    const moves = allLegalMoves(b, color);
    if (!moves.length) return null;
    let best = [];
    let bestScore = color === "w" ? -Infinity : Infinity;
    for (const m of moves) {
      const { board: nb } = applyMove(b, m.from, m.to);
      const score = minimax(nb, depth - 1, -Infinity, Infinity, color !== "w");
      if (color === "w") {
        if (score > bestScore) {
          bestScore = score;
          best = [m];
        } else if (score === bestScore) best.push(m);
      } else {
        if (score < bestScore) {
          bestScore = score;
          best = [m];
        } else if (score === bestScore) best.push(m);
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
    cloneBoard,
    fenFromBoard,
    material,
    legalMovesFor,
    allLegalMoves,
    inCheck,
    evaluate,
    applyMove,
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
