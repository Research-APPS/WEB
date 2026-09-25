/**
 * H7 — GoCore lite (9×9).
 * Place · capture by liberties · pass · simple territory score.
 * Not full AGA rules (superko simplified to last-board hash).
 */
(function (global) {
  "use strict";

  const SIZE = 9;
  const EMPTY = 0;
  const BLACK = 1; // 'b'
  const WHITE = 2; // 'w'

  function colorCode(c) {
    return c === "w" ? WHITE : BLACK;
  }
  function codeColor(n) {
    return n === WHITE ? "w" : n === BLACK ? "b" : null;
  }

  function emptyBoard() {
    const b = [];
    for (let r = 0; r < SIZE; r++) {
      b[r] = [];
      for (let c = 0; c < SIZE; c++) b[r][c] = EMPTY;
    }
    return b;
  }

  function cloneBoard(b) {
    return b.map(function (row) {
      return row.slice();
    });
  }

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function neighbors(r, c) {
    return [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ].filter(function (p) {
      return inBounds(p[0], p[1]);
    });
  }

  function boardKey(b) {
    return b
      .map(function (row) {
        return row.join("");
      })
      .join("/");
  }

  /** Group + liberties for stone at r,c */
  function groupAt(b, r, c) {
    const color = b[r][c];
    if (!color) return { stones: [], liberties: [] };
    const stones = [];
    const libs = {};
    const seen = {};
    const stack = [[r, c]];
    seen[r + "," + c] = true;
    while (stack.length) {
      const cur = stack.pop();
      stones.push(cur);
      neighbors(cur[0], cur[1]).forEach(function (n) {
        const v = b[n[0]][n[1]];
        const k = n[0] + "," + n[1];
        if (!v) {
          libs[k] = true;
        } else if (v === color && !seen[k]) {
          seen[k] = true;
          stack.push(n);
        }
      });
    }
    return { stones: stones, liberties: Object.keys(libs) };
  }

  function removeGroup(b, stones) {
    stones.forEach(function (s) {
      b[s[0]][s[1]] = EMPTY;
    });
  }

  /**
   * Try place. Returns { ok, board, captured, suicide, ko } or { ok:false, reason }.
   */
  function tryPlace(b, r, c, color, prevKey) {
    if (!inBounds(r, c)) return { ok: false, reason: "oob" };
    if (b[r][c] !== EMPTY) return { ok: false, reason: "occupied" };
    const next = cloneBoard(b);
    const me = colorCode(color);
    const enemy = me === BLACK ? WHITE : BLACK;
    next[r][c] = me;

    let captured = 0;
    neighbors(r, c).forEach(function (n) {
      if (next[n[0]][n[1]] !== enemy) return;
      const g = groupAt(next, n[0], n[1]);
      if (g.liberties.length === 0) {
        captured += g.stones.length;
        removeGroup(next, g.stones);
      }
    });

    const mine = groupAt(next, r, c);
    if (mine.liberties.length === 0) {
      return { ok: false, reason: "suicide" };
    }
    const key = boardKey(next);
    if (prevKey && key === prevKey) {
      return { ok: false, reason: "ko" };
    }
    return {
      ok: true,
      board: next,
      captured: captured,
      key: key,
      move: { r: r, c: c, color: color },
    };
  }

  /** Approximate score: stones + flood-fill empty claimed by one color */
  function score(b) {
    let black = 0;
    let white = 0;
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        if (b[r][c] === BLACK) black++;
        else if (b[r][c] === WHITE) white++;
      }
    const seen = {};
    function flood(sr, sc) {
      const q = [[sr, sc]];
      const cells = [];
      const border = {};
      seen[sr + "," + sc] = true;
      while (q.length) {
        const cur = q.pop();
        cells.push(cur);
        neighbors(cur[0], cur[1]).forEach(function (n) {
          const v = b[n[0]][n[1]];
          const k = n[0] + "," + n[1];
          if (!v) {
            if (!seen[k]) {
              seen[k] = true;
              q.push(n);
            }
          } else {
            border[v] = true;
          }
        });
      }
      const colors = Object.keys(border);
      if (colors.length === 1) {
        return { owner: +colors[0], n: cells.length };
      }
      return { owner: 0, n: 0 };
    }
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        if (b[r][c] !== EMPTY) continue;
        if (seen[r + "," + c]) continue;
        const f = flood(r, c);
        if (f.owner === BLACK) black += f.n;
        else if (f.owner === WHITE) white += f.n;
      }
    return { black: black, white: white, diff: black - white };
  }

  function evaluate(b) {
    // white-positive cp-like: map stone diff * 100
    const sc = score(b);
    return (sc.white - sc.black) * 100;
  }

  function hangingPressure(b, color) {
    const me = colorCode(color);
    let n = 0;
    const seen = {};
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        if (b[r][c] !== me) continue;
        const k0 = r + "," + c;
        if (seen[k0]) continue;
        const g = groupAt(b, r, c);
        g.stones.forEach(function (s) {
          seen[s[0] + "," + s[1]] = true;
        });
        if (g.liberties.length <= 2) n++;
      }
    return n;
  }

  function legalMoves(b, color, prevKey) {
    const moves = [];
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        const t = tryPlace(b, r, c, color, prevKey);
        if (t.ok) moves.push({ r: r, c: c });
      }
    return moves;
  }

  /** Greedy bot: max captures then max eval */
  function chooseBotMove(b, color, prevKey) {
    const moves = legalMoves(b, color, prevKey);
    if (!moves.length) return null;
    let best = null;
    let bestScore = color === "b" ? -Infinity : Infinity;
    moves.forEach(function (m) {
      const t = tryPlace(b, m.r, m.c, color, prevKey);
      let s = evaluate(t.board);
      s += (t.captured || 0) * (color === "b" ? -80 : 80);
      if (color === "b") {
        if (s < bestScore) {
          bestScore = s;
          best = m;
        }
      } else {
        if (s > bestScore) {
          bestScore = s;
          best = m;
        }
      }
    });
    return best;
  }

  function toCoord(r, c) {
    return String.fromCharCode(97 + c) + (SIZE - r);
  }

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.GoCore = {
    SIZE: SIZE,
    EMPTY: EMPTY,
    emptyBoard: emptyBoard,
    cloneBoard: cloneBoard,
    tryPlace: tryPlace,
    legalMoves: legalMoves,
    chooseBotMove: chooseBotMove,
    score: score,
    evaluate: evaluate,
    hangingPressure: hangingPressure,
    boardKey: boardKey,
    toCoord: toCoord,
    colorCode: colorCode,
    codeColor: codeColor,
  };
})(typeof window !== "undefined" ? window : globalThis);
