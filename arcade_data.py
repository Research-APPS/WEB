"""
Datos y scripts del Arcade — extraídos de MIDI/app.py (MCI MIDI Studio).

Los juegos son 100% JS de cliente (Canvas + Gamepad API nativa del
navegador): no llaman a ningún backend, así que funcionan igual aquí
como sitio estático que en la app Flask original.
"""

INPUT_JS = """
const Input = (() => {
  const keys = {};
  window.addEventListener('keydown', e => { keys[e.key] = true; });
  window.addEventListener('keyup', e => { keys[e.key] = false; });

  function pad() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const g of list) if (g) return g;
    return null;
  }

  // Controles táctiles (D-pad + A/B en pantalla, ver __TOUCH_CSS__/.touch-controls
  // en la plantilla). Se leen igual que el mando: un eje continuo + dos botones.
  const touch = { dx: 0, dy: 0, action: false, secondary: false };
  (function setupTouch() {
    function bindDir(el, on, off) {
      if (!el) return;
      el.addEventListener('touchstart', e => { e.preventDefault(); on(); }, { passive: false });
      el.addEventListener('touchend', e => { e.preventDefault(); off(); }, { passive: false });
      el.addEventListener('touchcancel', () => off());
      el.addEventListener('mousedown', e => { e.preventDefault(); on(); });
      el.addEventListener('mouseup', () => off());
      el.addEventListener('mouseleave', () => off());
    }
    bindDir(document.querySelector('.dpad-up'), () => { touch.dy = -1; }, () => { if (touch.dy < 0) touch.dy = 0; });
    bindDir(document.querySelector('.dpad-down'), () => { touch.dy = 1; }, () => { if (touch.dy > 0) touch.dy = 0; });
    bindDir(document.querySelector('.dpad-left'), () => { touch.dx = -1; }, () => { if (touch.dx < 0) touch.dx = 0; });
    bindDir(document.querySelector('.dpad-right'), () => { touch.dx = 1; }, () => { if (touch.dx > 0) touch.dx = 0; });
    bindDir(document.getElementById('touch-action'), () => { touch.action = true; }, () => { touch.action = false; });
    bindDir(document.getElementById('touch-secondary'), () => { touch.secondary = true; }, () => { touch.secondary = false; });
  })();

  // Si el navegador reconoce el mando como "standard" (W3C Gamepad spec),
  // usamos los índices oficiales: D-pad = botones 12/13/14/15, stick = ejes 0/1.
  // Si no, caemos al heurístico adaptativo (sigue el eje que más se desvíe de su reposo).
  let axisBase = [];
  function axisDeviations(gp) {
    const axes = gp.axes;
    if (axisBase.length !== axes.length) axisBase = axes.slice();
    const out = axes.map((v, i) => v - axisBase[i]);
    for (let i = 0; i < axes.length; i++) {
      if (Math.abs(out[i]) < 0.05) axisBase[i] += (axes[i] - axisBase[i]) * 0.02;
    }
    return out;
  }
  function bestAxisPair(gp) {
    const dev = axisDeviations(gp);
    let best = { dx: 0, dy: 0, mag: 0 };
    for (let i = 0; i + 1 < dev.length; i += 2) {
      const mag = Math.hypot(dev[i], dev[i + 1]);
      if (mag > best.mag) best = { dx: dev[i], dy: dev[i + 1], mag };
    }
    return best;
  }

  function padDirection(gp) {
    if (gp.mapping === 'standard') {
      const dpad = [
        { i: 12, dx: 0, dy: -1 }, { i: 13, dx: 0, dy: 1 },
        { i: 14, dx: -1, dy: 0 }, { i: 15, dx: 1, dy: 0 },
      ];
      for (const d of dpad) {
        const b = gp.buttons[d.i];
        if (b && b.pressed) return { dx: d.dx, dy: d.dy, mag: 1 };
      }
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const mag = Math.hypot(ax, ay);
      return { dx: ax, dy: ay, mag };
    }
    return bestAxisPair(gp);
  }

  function axisX() {
    const g = pad();
    if (g) {
      const d = padDirection(g);
      if (d.mag > 0.35) return Math.max(-1, Math.min(1, d.dx));
    }
    if (touch.dx !== 0) return touch.dx;
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) return -1;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) return 1;
    return 0;
  }

  function axisY() {
    const g = pad();
    if (g) {
      const d = padDirection(g);
      if (d.mag > 0.35) return Math.max(-1, Math.min(1, d.dy));
    }
    if (touch.dy !== 0) return touch.dy;
    if (keys['ArrowUp'] || keys['w'] || keys['W']) return -1;
    if (keys['ArrowDown'] || keys['s'] || keys['S']) return 1;
    return 0;
  }

  // Botón de acción: exige 2 fotogramas seguidos pulsado para contar como
  // pulsación real (filtra ruido de botones con sensor de presión).
  const btnHold = {};
  function actionHeld() {
    const g = pad();
    if (g) {
      const indices = g.mapping === 'standard' ? [0] : [0, 1, 2, 3];
      for (const i of indices) {
        const b = g.buttons[i];
        const pressedNow = !!(b && (b.pressed || b.value > 0.6));
        btnHold[i] = pressedNow ? (btnHold[i] || 0) + 1 : 0;
        if (btnHold[i] >= 2) return true;
      }
    }
    if (touch.action) return true;
    return !!(keys[' '] || keys['Enter']);
  }

  // Bloqueo de entrada tras cargar la página: si el botón seguía físicamente
  // pulsado al cambiar de pantalla (muy normal, el ser humano no lo suelta al
  // instante), se ignora hasta que se suelte una vez — así no "salta" solo al
  // entrar en un menú o en un juego nuevo.
  const LOAD_TIME = performance.now();
  const LOCKOUT_MS = 350;
  function locked() { return performance.now() - LOAD_TIME < LOCKOUT_MS; }

  function makeEdgeDetector(heldFn) {
    let prev = false;
    let seenRelease = false;
    return function() {
      if (locked()) { prev = heldFn(); return false; }
      const now = heldFn();
      if (!seenRelease) {
        if (!now) seenRelease = true;
        prev = now;
        return false;
      }
      const edge = now && !prev;
      prev = now;
      return edge;
    };
  }

  const actionEdge = makeEdgeDetector(actionHeld);

  // Botón secundario (Círculo/B, índice 1) — para "pasar turno", cancelar, etc.
  // (contador de fotogramas propio, independiente del de actionHeld)
  const btnHold2 = {};
  function secondaryHeld() {
    const g = pad();
    if (g) {
      const b = g.buttons[1];
      const pressedNow = !!(b && (b.pressed || b.value > 0.6));
      btnHold2[1] = pressedNow ? (btnHold2[1] || 0) + 1 : 0;
      if (btnHold2[1] >= 2) return true;
    }
    if (touch.secondary) return true;
    return !!(keys['x'] || keys['X'] || keys['Backspace']);
  }
  const secondaryEdge = makeEdgeDetector(secondaryHeld);

  function connected() { return !!pad(); }

  return { axisX, axisY, actionHeld, actionEdge, secondaryEdge, connected };
})();
"""

GAME_SHELL = """
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>MCI · __TITLE__</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root {
    color-scheme: dark;
    --bg-0: #111214; --bg-1: #18191c; --bg-2: #202226; --bg-3: #292b30;
    --line: #3a3d43; --text: #f0f1f3; --text-2: #c3c6cc; --muted: #8c919b;
    --accent: #78a9ff; --accent-2: #9bc1ff; --green: #69d38b; --amber: #f0bf59; --red: #ff6b67;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0; background: var(--bg-0); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
    font-size: 12px; overflow: hidden;
    animation: mci-fade-in .3s ease both;
  }
  @keyframes mci-fade-in { from { opacity: 0; } to { opacity: 1; } }
  .appbar {
    display: flex; align-items: center; gap: 12px; height: 34px; padding: 0 12px;
    background: linear-gradient(#25272b,#202226); border-bottom: 1px solid #0e0f10;
  }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 650; color: #e8eaed; }
  .brand-mark {
    width: 18px; height: 18px; border-radius: 4px; display: grid; place-items: center;
    background: #33363b; border: 1px solid #4b4e55; font-size: 10px; color: var(--accent-2);
  }
  .mini-btn {
    border: 1px solid #3b3f46; background: #292c31; color: #bfc3ca; border-radius: 4px;
    padding: 5px 10px; font-size: 10.5px; cursor: pointer; text-decoration: none;
  }
  .mini-btn:hover { background: #34373d; color: #fff; }
  .spacer { flex: 1; }
  .pad-status { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 11px; }
  .pad-status .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--red); }
  .pad-status .dot.on { background: var(--green); box-shadow: 0 0 6px rgba(105,211,139,.6); }
  .score { font: 700 14px ui-monospace, monospace; color: var(--accent-2); min-width: 70px; text-align: right; }
  @media (max-width: 480px) {
    .appbar { padding: 0 8px; gap: 6px; }
    .brand > span:last-child { max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #pad-label { display: none; }
    .score { min-width: auto; font-size: 12px; }
    .mini-btn { padding: 5px 8px; font-size: 10px; max-width: 78px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  }
  .stage {
    height: calc(100% - 34px); display: flex; align-items: center; justify-content: center;
    gap: 18px; flex-wrap: wrap; overflow: auto; padding: 10px;
    background: radial-gradient(circle at 50% 30%, #1a1c20, #0e0f11 75%);
  }
  .board-col { position: relative; flex: 0 1 auto; max-width: 100%; min-width: 0; }
  canvas { background: #0c0d0f; border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 20px 50px rgba(0,0,0,.5); max-width: 100%; height: auto; }

  /* Controles táctiles: solo en pantallas táctiles (no en escritorio con ratón/mando) */
  .touch-controls { display: none; }
  @media (hover: none) and (pointer: coarse) {
    .touch-controls {
      display: flex; justify-content: space-between; align-items: flex-end;
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; pointer-events: none;
      padding: 0 16px calc(14px + env(safe-area-inset-bottom));
    }
    .touch-dpad {
      pointer-events: auto; display: grid;
      grid-template-columns: repeat(3, 46px); grid-template-rows: repeat(3, 46px); gap: 3px;
    }
    .touch-btn {
      -webkit-user-select: none; user-select: none; touch-action: none; -webkit-tap-highlight-color: transparent;
      background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.16); color: #fff;
      display: flex; align-items: center; justify-content: center; font-size: 16px; border-radius: 10px;
    }
    .touch-btn:active { background: rgba(255,255,255,.18); }
    .dpad-up { grid-column: 2; grid-row: 1; }
    .dpad-left { grid-column: 1; grid-row: 2; }
    .dpad-right { grid-column: 3; grid-row: 2; }
    .dpad-down { grid-column: 2; grid-row: 3; }
    .touch-actions { pointer-events: auto; display: flex; align-items: flex-end; gap: 14px; }
    .touch-a, .touch-b { border-radius: 50%; font-weight: 800; }
    .touch-a { width: 60px; height: 60px; font-size: 17px; background: rgba(239,43,43,.24); border-color: rgba(239,43,43,.55); }
    .touch-a:active { background: rgba(239,43,43,.4); }
    .touch-b { width: 48px; height: 48px; font-size: 14px; margin-bottom: 10px; }
    /* deja hueco abajo para que los controles no tapen el tablero/pista */
    .stage { padding-bottom: 150px; }
  }
  .hint { position: absolute; bottom: 14px; left: 0; right: 0; text-align: center; color: var(--muted); font-size: 11px; }
  .overlay {
    position: absolute; inset: 0; display: none; align-items: center; justify-content: center;
    flex-direction: column; gap: 10px; background: rgba(10,11,13,.72); backdrop-filter: blur(2px);
  }
  .overlay.show { display: flex; }
  .overlay h2 { margin: 0; font-size: 20px; color: #fff; }
  .overlay p { margin: 0; color: var(--muted); font-size: 12px; }
  .overlay button { margin-top: 6px; }
  .side-panel {
    width: 300px; max-height: 420px; overflow-y: auto;
    background: var(--bg-2); border: 1px solid var(--line); border-radius: 8px;
    padding: 12px; font-size: 11.5px; line-height: 1.5;
  }
  .side-panel:empty { display: none; }
  .side-panel .panel-head { font-size: 11px; font-weight: 700; color: var(--text); margin-bottom: 8px; }
  .side-panel .bot-toggle-btn { width: 100%; margin-bottom: 10px; padding: 7px; }
  .side-panel .commentary-feed { display: flex; flex-direction: column; gap: 7px; }
  .side-panel .remark { padding: 7px 9px; border-radius: 6px; background: var(--bg-1); border: 1px solid var(--line); }
  .side-panel .remark .who { font-weight: 700; font-size: 10.5px; margin-right: 4px; }
  .side-panel .remark.bot-w .who { color: var(--accent-2); }
  .side-panel .remark.bot-b .who { color: var(--amber); }
  .side-panel .remark.reaction { opacity: .8; font-style: italic; margin-left: 10px; }
  .pause-menu { display: flex; flex-direction: column; gap: 8px; min-width: 200px; margin-top: 4px; }
  .pause-item {
    padding: 10px 16px; border: 1px solid var(--line); border-radius: 6px;
    background: #202226; color: var(--text-2); font-size: 13px; font-weight: 600;
    cursor: pointer; text-align: center; transition: background .1s, border-color .1s;
  }
  .pause-item.sel { background: #33507a; border-color: var(--accent); color: #fff; }
  .pause-hint { max-width: 260px; text-align: center; }
  .gp-focus {
    outline: 2px solid var(--accent) !important;
    outline-offset: 2px;
    box-shadow: 0 0 0 5px rgba(120,169,255,.25) !important;
  }
</style>
</head>
<body>
  <header class="appbar">
    <div class="brand"><span class="brand-mark">__ICON__</span><span>__TITLE__</span></div>
    <div class="spacer"></div>
    <div class="pad-status"><span class="dot" id="pad-dot"></span><span id="pad-label">Mando no detectado</span></div>
    <div class="score" id="score">0</div>
    <button class="mini-btn" onclick="togglePause()">⏸ Pausa</button>
    <a href="__BACK_HREF__" class="mini-btn">__BACK_LABEL__</a>
  </header>
  <div class="stage">
    <div class="board-col">
      <canvas id="game" width="640" height="420"></canvas>
      <div class="hint">__INSTRUCTIONS__</div>
      <div class="overlay" id="overlay">
        <h2 id="overlay-title">Game Over</h2>
        <p id="overlay-sub"></p>
        <button class="mini-btn" onclick="restartGame()">Reiniciar</button>
      </div>
      <div class="overlay" id="pause-overlay">
        <h2>⏸ Pausa</h2>
        <div class="pause-menu">
          <div class="pause-item sel" data-action="resume">▶ Reanudar</div>
          <div class="pause-item" data-action="restart">↻ Reiniciar</div>
          <div class="pause-item" data-action="exit">🏠 Salir al Arcade</div>
        </div>
        <p class="hint pause-hint" style="position:static;">Start / Esc / P para abrir o cerrar · Stick arriba-abajo + botón de acción para elegir</p>
      </div>
    </div>
    <div class="side-panel" id="side-panel"></div>
  </div>

  <div class="touch-controls" id="touch-controls">
    <div class="touch-dpad">
      <button class="touch-btn dpad-up" data-dir="up" aria-label="Arriba">▲</button>
      <button class="touch-btn dpad-left" data-dir="left" aria-label="Izquierda">◀</button>
      <button class="touch-btn dpad-right" data-dir="right" aria-label="Derecha">▶</button>
      <button class="touch-btn dpad-down" data-dir="down" aria-label="Abajo">▼</button>
    </div>
    <div class="touch-actions">
      <button class="touch-btn touch-b" id="touch-secondary" aria-label="Botón secundario">B</button>
      <button class="touch-btn touch-a" id="touch-action" aria-label="Botón de acción">A</button>
    </div>
  </div>

<script>
__INPUT_JS__

const IS_TOUCH = window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
function updatePadStatus() {
  const on = Input.connected();
  document.getElementById('pad-dot').classList.toggle('on', on);
  const label = on ? 'Mando conectado' : (IS_TOUCH ? 'Controles táctiles' : 'Teclado (WASD/flechas + espacio)');
  document.getElementById('pad-label').textContent = label;
}
setInterval(updatePadStatus, 500);
updatePadStatus();

function setScore(v) { document.getElementById('score').textContent = v; }
function showOverlay(title, sub) {
  document.getElementById('overlay-title').textContent = title;
  document.getElementById('overlay-sub').textContent = sub || '';
  document.getElementById('overlay').classList.add('show');
}
function hideOverlay() { document.getElementById('overlay').classList.remove('show'); }

let paused = false;
window.__PAUSED__ = false;
let pauseMenuIndex = 0;
const pauseItems = ['resume', 'restart', 'exit'];

function renderPauseMenu() {
  document.querySelectorAll('.pause-item').forEach((el, i) => {
    el.classList.toggle('sel', i === pauseMenuIndex);
  });
}

function togglePause() {
  paused = !paused;
  window.__PAUSED__ = paused;
  document.getElementById('pause-overlay').classList.toggle('show', paused);
  if (paused) { pauseMenuIndex = 0; renderPauseMenu(); }
}

function activatePauseItem() {
  const item = pauseItems[pauseMenuIndex];
  if (item === 'resume') {
    togglePause();
  } else if (item === 'restart') {
    paused = false;
    window.__PAUSED__ = false;
    document.getElementById('pause-overlay').classList.remove('show');
    if (window.restartGame) window.restartGame();
  } else if (item === 'exit') {
    window.location.href = '/arcade';
  }
}

document.querySelectorAll('.pause-item').forEach((el, i) => {
  el.addEventListener('click', () => { pauseMenuIndex = i; activatePauseItem(); });
});

window.addEventListener('keydown', e => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { e.preventDefault(); togglePause(); }
  if (paused) {
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      e.preventDefault();
      pauseMenuIndex = (pauseMenuIndex + 1) % pauseItems.length;
      renderPauseMenu();
    }
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      pauseMenuIndex = (pauseMenuIndex - 1 + pauseItems.length) % pauseItems.length;
      renderPauseMenu();
    }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activatePauseItem(); }
  }
});

(function pauseGamepadLoop() {
  const LOAD_TIME = performance.now();
  const LOCKOUT_MS = 350;
  function locked() { return performance.now() - LOAD_TIME < LOCKOUT_MS; }

  let startPrev = false, dirPrev = 0, actionPrev = false;
  const btnHold = {};
  function debounced(gp, i) {
    const b = gp.buttons[i];
    const now = !!(b && (b.pressed || b.value > 0.6));
    btnHold[i] = now ? (btnHold[i] || 0) + 1 : 0;
    return btnHold[i] >= 2;
  }

  let axisBase = [];
  function bestAxisPair(gp) {
    const axes = gp.axes;
    if (axisBase.length !== axes.length) axisBase = axes.slice();
    const dev = axes.map((v, i) => v - axisBase[i]);
    for (let i = 0; i < axes.length; i++) {
      if (Math.abs(dev[i]) < 0.05) axisBase[i] += (axes[i] - axisBase[i]) * 0.02;
    }
    let best = { dx: 0, dy: 0, mag: 0 };
    for (let i = 0; i + 1 < dev.length; i += 2) {
      const mag = Math.hypot(dev[i], dev[i + 1]);
      if (mag > best.mag) best = { dx: dev[i], dy: dev[i + 1], mag };
    }
    return best;
  }

  function padVertical(gp) {
    if (gp.mapping === 'standard') {
      const up = gp.buttons[12], down = gp.buttons[13];
      if (up && up.pressed) return -1;
      if (down && down.pressed) return 1;
      const ay = gp.axes[1] || 0;
      if (Math.abs(ay) > 0.5) return ay > 0 ? 1 : -1;
      return 0;
    }
    const b = bestAxisPair(gp);
    if (b.mag > 0.4 && Math.abs(b.dy) > Math.abs(b.dx)) return b.dy > 0 ? 1 : -1;
    return 0;
  }

  function tick() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const g of list) if (g) { gp = g; break; }
    if (gp) {
      // Start: índice 9 en mapeo estándar; si no hay mapeo estándar, se prueban 8 y 9.
      const startNow = gp.mapping === 'standard' ? debounced(gp, 9) : (debounced(gp, 8) || debounced(gp, 9));
      if (startNow && !startPrev && !locked()) togglePause();
      startPrev = startNow;

      if (paused) {
        const dir = padVertical(gp);
        if (dir !== 0 && dir !== dirPrev) {
          pauseMenuIndex = (pauseMenuIndex + dir + pauseItems.length) % pauseItems.length;
          renderPauseMenu();
        }
        dirPrev = dir;

        const aNow = debounced(gp, 0);
        if (aNow && !actionPrev) activatePauseItem();
        actionPrev = aNow;
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();

__SCRIPT__
</script>
</body>
</html>
"""


def render_game(title, icon, instructions, script_js, back_href="/arcade", back_label="← Arcade"):
    html = GAME_SHELL
    html = html.replace("__TITLE__", title)
    html = html.replace("__ICON__", icon)
    html = html.replace("__INSTRUCTIONS__", instructions)
    html = html.replace("__INPUT_JS__", INPUT_JS)
    html = html.replace("__SCRIPT__", script_js)
    html = html.replace("__BACK_HREF__", back_href)
    html = html.replace("__BACK_LABEL__", back_label)
    return html


PONG_JS = """
(function() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PW = 10, PH = 80;
  let player, cpu, ball, running;

  function reset() {
    player = { x: 16, y: H/2 - PH/2, score: 0 };
    cpu = { x: W - 16 - PW, y: H/2 - PH/2, score: 0 };
    ball = { x: W/2, y: H/2, vx: 260, vy: 160, r: 7 };
    running = true;
    hideOverlay();
    updateScore();
  }
  function updateScore() { setScore(player.score + ' : ' + cpu.score); }

  function restartGame() { reset(); }
  window.restartGame = restartGame;

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (running && !window.__PAUSED__) update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    const ay = Input.axisY();
    player.y += ay * 340 * dt;
    player.y = Math.max(0, Math.min(H - PH, player.y));

    const target = ball.y - PH/2 + (Math.random()-0.5)*10;
    cpu.y += Math.max(-260*dt, Math.min(260*dt, target - cpu.y));
    cpu.y = Math.max(0, Math.min(H - PH, cpu.y));

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy *= -1; }
    if (ball.y + ball.r > H) { ball.y = H - ball.r; ball.vy *= -1; }

    if (ball.vx < 0 && ball.x - ball.r < player.x + PW && ball.x - ball.r > player.x &&
        ball.y > player.y && ball.y < player.y + PH) {
      ball.vx *= -1.06;
      ball.vy += (ball.y - (player.y + PH/2)) * 4;
      ball.x = player.x + PW + ball.r;
    }
    if (ball.vx > 0 && ball.x + ball.r > cpu.x && ball.x + ball.r < cpu.x + PW &&
        ball.y > cpu.y && ball.y < cpu.y + PH) {
      ball.vx *= -1.06;
      ball.vy += (ball.y - (cpu.y + PH/2)) * 4;
      ball.x = cpu.x - ball.r;
    }

    if (ball.x < -20) { cpu.score++; updateScore(); scorePoint(); }
    if (ball.x > W + 20) { player.score++; updateScore(); scorePoint(); }
  }

  function scorePoint() {
    if (player.score >= 5 || cpu.score >= 5) {
      running = false;
      showOverlay(player.score > cpu.score ? '¡Ganaste!' : 'Perdiste', 'Pulsa Reiniciar para jugar otra vez');
      return;
    }
    ball.x = W/2; ball.y = H/2;
    ball.vx = (Math.random() > 0.5 ? 1 : -1) * 260;
    ball.vy = (Math.random()*2-1) * 180;
  }

  function draw() {
    ctx.fillStyle = '#0c0d0f'; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.setLineDash([6,10]);
    ctx.beginPath(); ctx.moveTo(W/2,0); ctx.lineTo(W/2,H); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#78a9ff';
    ctx.fillRect(player.x, player.y, PW, PH);
    ctx.fillStyle = '#ff6b67';
    ctx.fillRect(cpu.x, cpu.y, PW, PH);
    ctx.fillStyle = '#f0f1f3';
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2); ctx.fill();
  }

  reset();
  requestAnimationFrame(loop);
})();
"""

BREAKOUT_JS = """
(function() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PW = 90, PH = 12;
  let paddle, ball, bricks, lives, score, running;

  const COLS = 10, ROWS = 5, BRICK_W = 56, BRICK_H = 18, GAP = 6, OFFSET_TOP = 40;
  const totalBricksWidth = COLS * (BRICK_W + GAP) - GAP;
  const OFFSET_LEFT = (W - totalBricksWidth) / 2;

  function buildBricks() {
    const arr = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        arr.push({ x: OFFSET_LEFT + c*(BRICK_W+GAP), y: OFFSET_TOP + r*(BRICK_H+GAP), alive: true, hue: 200 + r*30 });
      }
    }
    return arr;
  }

  function reset() {
    paddle = { x: W/2 - PW/2, y: H - 30 };
    ball = { x: W/2, y: H - 50, vx: 200, vy: -240, r: 7 };
    bricks = buildBricks();
    lives = 3; score = 0; running = true;
    hideOverlay(); setScore(score);
  }
  function restartGame() { reset(); }
  window.restartGame = restartGame;

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now-last)/1000);
    last = now;
    if (running && !window.__PAUSED__) update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    const ax = Input.axisX();
    paddle.x += ax * 420 * dt;
    paddle.x = Math.max(0, Math.min(W - PW, paddle.x));

    ball.x += ball.vx*dt; ball.y += ball.vy*dt;
    if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx *= -1; }
    if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.vx *= -1; }
    if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy *= -1; }

    if (ball.vy > 0 && ball.y + ball.r > paddle.y && ball.y + ball.r < paddle.y + PH + 10 &&
        ball.x > paddle.x && ball.x < paddle.x + PW) {
      ball.vy *= -1;
      ball.vx += (ball.x - (paddle.x + PW/2)) * 3;
      ball.y = paddle.y - ball.r;
    }

    for (const b of bricks) {
      if (!b.alive) continue;
      if (ball.x + ball.r > b.x && ball.x - ball.r < b.x + BRICK_W &&
          ball.y + ball.r > b.y && ball.y - ball.r < b.y + BRICK_H) {
        b.alive = false;
        ball.vy *= -1;
        score += 10; setScore(score);
        break;
      }
    }

    if (ball.y - ball.r > H) {
      lives--;
      if (lives <= 0) {
        running = false;
        showOverlay('Game Over', 'Puntuación: ' + score);
        return;
      }
      ball.x = W/2; ball.y = H - 50; ball.vx = 200; ball.vy = -240;
    }

    if (bricks.every(b => !b.alive)) {
      running = false;
      showOverlay('¡Completado!', 'Puntuación: ' + score);
    }
  }

  function draw() {
    ctx.fillStyle = '#0c0d0f'; ctx.fillRect(0,0,W,H);
    for (const b of bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = 'hsl(' + b.hue + ', 70%, 60%)';
      ctx.fillRect(b.x, b.y, BRICK_W, BRICK_H);
    }
    ctx.fillStyle = '#78a9ff';
    ctx.fillRect(paddle.x, paddle.y, PW, PH);
    ctx.fillStyle = '#f0f1f3';
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#8c919b'; ctx.font = '11px ui-monospace,monospace';
    ctx.fillText('Vidas: ' + lives, 10, 20);
  }

  reset();
  requestAnimationFrame(loop);
})();
"""

SNAKE_JS = """
(function() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const CELL = 20;
  const COLS = canvas.width / CELL, ROWS = canvas.height / CELL;
  let snake, dir, nextDir, food, score, running, stepAcc;

  function randFood() {
    let p;
    do {
      p = { x: Math.floor(Math.random()*COLS), y: Math.floor(Math.random()*ROWS) };
    } while (snake.some(s => s.x === p.x && s.y === p.y));
    return p;
  }

  function reset() {
    snake = [{x:10,y:10},{x:9,y:10},{x:8,y:10}];
    dir = {x:1,y:0}; nextDir = {x:1,y:0};
    food = randFood();
    score = 0; running = true; stepAcc = 0;
    hideOverlay(); setScore(score);
  }
  function restartGame() { reset(); }
  window.restartGame = restartGame;

  function readDir() {
    const ax = Input.axisX(), ay = Input.axisY();
    if (Math.abs(ax) > Math.abs(ay)) {
      if (ax < -0.4 && dir.x !== 1) nextDir = {x:-1,y:0};
      else if (ax > 0.4 && dir.x !== -1) nextDir = {x:1,y:0};
    } else {
      if (ay < -0.4 && dir.y !== 1) nextDir = {x:0,y:-1};
      else if (ay > 0.4 && dir.y !== -1) nextDir = {x:0,y:1};
    }
  }

  const STEP_MS = 110;
  let last = performance.now();
  function loop(now) {
    const dt = now - last; last = now;
    if (!window.__PAUSED__) readDir();
    if (running && !window.__PAUSED__) {
      stepAcc += dt;
      while (stepAcc >= STEP_MS) { stepAcc -= STEP_MS; step(); }
    }
    draw();
    requestAnimationFrame(loop);
  }

  function step() {
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS ||
        snake.some(s => s.x === head.x && s.y === head.y)) {
      running = false;
      showOverlay('Game Over', 'Puntuación: ' + score);
      return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10; setScore(score);
      food = randFood();
    } else {
      snake.pop();
    }
  }

  function draw() {
    ctx.fillStyle = '#0c0d0f'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#f0bf59';
    ctx.fillRect(food.x*CELL+2, food.y*CELL+2, CELL-4, CELL-4);
    snake.forEach((s,i) => {
      ctx.fillStyle = i === 0 ? '#9bc1ff' : '#78a9ff';
      ctx.fillRect(s.x*CELL+1, s.y*CELL+1, CELL-2, CELL-2);
    });
  }

  reset();
  requestAnimationFrame(loop);
})();
"""

FLAPPY_JS = """
(function() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  let bird, pipes, score, running, spawnAcc;

  const GAP = 130, PIPE_W = 60, SPEED = 180;

  function reset() {
    bird = { x: 120, y: H/2, vy: 0, r: 12 };
    pipes = [];
    score = 0; running = true; spawnAcc = 0;
    hideOverlay(); setScore(score);
  }
  function restartGame() { reset(); }
  window.restartGame = restartGame;

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now-last)/1000);
    last = now;
    if (running && !window.__PAUSED__) update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    const action = Input.actionEdge();
    if (action) bird.vy = -300;
    bird.vy += 700 * dt;
    bird.y += bird.vy * dt;

    spawnAcc += dt;
    if (spawnAcc > 1.5) {
      spawnAcc = 0;
      const top = 60 + Math.random() * (H - GAP - 160);
      pipes.push({ x: W + PIPE_W, top, passed: false });
    }
    pipes.forEach(p => p.x -= SPEED * dt);
    pipes = pipes.filter(p => p.x > -PIPE_W);

    for (const p of pipes) {
      if (!p.passed && p.x + PIPE_W < bird.x) { p.passed = true; score++; setScore(score); }
      const withinX = bird.x + bird.r > p.x && bird.x - bird.r < p.x + PIPE_W;
      const hitTop = bird.y - bird.r < p.top;
      const hitBottom = bird.y + bird.r > p.top + GAP;
      if (withinX && (hitTop || hitBottom)) { gameOver(); return; }
    }
    if (bird.y - bird.r < 0 || bird.y + bird.r > H) gameOver();
  }

  function gameOver() {
    running = false;
    showOverlay('Game Over', 'Puntuación: ' + score);
  }

  function draw() {
    ctx.fillStyle = '#0c0d0f'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#69d38b';
    pipes.forEach(p => {
      ctx.fillRect(p.x, 0, PIPE_W, p.top);
      ctx.fillRect(p.x, p.top + GAP, PIPE_W, H - p.top - GAP);
    });
    ctx.fillStyle = '#f0bf59';
    ctx.beginPath(); ctx.arc(bird.x, bird.y, bird.r, 0, Math.PI*2); ctx.fill();
  }

  reset();
  requestAnimationFrame(loop);
})();
"""

SIMON_JS = """
(function() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W/2, cy = H/2, R = 160;
  const COLORS = ['#ff6b67', '#78a9ff', '#f0bf59', '#69d38b'];
  let sequence, playerStep, score, running, flashQuad, acceptInput;

  function reset() {
    sequence = [];
    playerStep = 0; score = 0; running = true; acceptInput = false; flashQuad = -1;
    hideOverlay(); setScore(score);
    nextRound();
  }
  function restartGame() { reset(); }
  window.restartGame = restartGame;

  function nextRound() {
    sequence.push(Math.floor(Math.random()*4));
    playerStep = 0;
    playSequence();
  }

  function playSequence() {
    acceptInput = false;
    let i = 0;
    function step() {
      flashQuad = -1;
      if (i >= sequence.length) { acceptInput = true; return; }
      flashQuad = sequence[i];
      i++;
      setTimeout(() => { flashQuad = -1; setTimeout(step, 220); }, 420);
    }
    setTimeout(step, 400);
  }

  let prevDir = -1;
  function pollInput() {
    if (!acceptInput || !running || window.__PAUSED__) { prevDir = -1; return; }
    const ax = Input.axisX(), ay = Input.axisY();
    let dir = -1;
    if (ay < -0.5 && Math.abs(ay) > Math.abs(ax)) dir = 0;
    else if (ax > 0.5 && Math.abs(ax) > Math.abs(ay)) dir = 1;
    else if (ay > 0.5 && Math.abs(ay) > Math.abs(ax)) dir = 2;
    else if (ax < -0.5 && Math.abs(ax) > Math.abs(ay)) dir = 3;

    if (dir !== -1 && dir !== prevDir) handlePress(dir);
    prevDir = dir;
  }

  function handlePress(dir) {
    flashQuad = dir;
    setTimeout(() => { if (flashQuad === dir) flashQuad = -1; }, 150);
    if (dir === sequence[playerStep]) {
      playerStep++;
      if (playerStep === sequence.length) {
        score++; setScore(score);
        acceptInput = false;
        setTimeout(nextRound, 600);
      }
    } else {
      running = false;
      showOverlay('Fallaste', 'Ronda alcanzada: ' + score);
    }
  }

  function loop() {
    pollInput();
    draw();
    requestAnimationFrame(loop);
  }

  function draw() {
    ctx.fillStyle = '#0c0d0f'; ctx.fillRect(0,0,W,H);
    const quads = [
      { a0: Math.PI*1.25, a1: Math.PI*1.75 },
      { a0: Math.PI*1.75, a1: Math.PI*2.25 },
      { a0: Math.PI*0.25, a1: Math.PI*0.75 },
      { a0: Math.PI*0.75, a1: Math.PI*1.25 },
    ];
    quads.forEach((q, i) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, q.a0, q.a1);
      ctx.closePath();
      ctx.fillStyle = flashQuad === i ? COLORS[i] : COLORS[i] + '55';
      ctx.fill();
      ctx.strokeStyle = '#0c0d0f'; ctx.lineWidth = 4; ctx.stroke();
    });
    ctx.beginPath(); ctx.arc(cx, cy, 46, 0, Math.PI*2);
    ctx.fillStyle = '#1a1b1e'; ctx.fill();
    ctx.strokeStyle = '#3a3d43'; ctx.stroke();
  }

  reset();
  requestAnimationFrame(loop);
})();
"""

INVADERS_JS = """
(function() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  let ship, bullets, enemies, enemyDir, score, running, shootCooldown;

  const COLS = 8, ROWS = 4, EW = 34, EH = 20, GAP = 12, OFFSET_TOP = 40;
  const gridWidth = COLS*(EW+GAP)-GAP;
  const OFFSET_LEFT = (W - gridWidth)/2;

  function buildEnemies() {
    const arr = [];
    for (let r=0; r<ROWS; r++) for (let c=0; c<COLS; c++) {
      arr.push({ x: OFFSET_LEFT + c*(EW+GAP), y: OFFSET_TOP + r*(EH+GAP), alive:true });
    }
    return arr;
  }

  function reset() {
    ship = { x: W/2 - 16, y: H - 34, w: 32, h: 14 };
    bullets = [];
    enemies = buildEnemies();
    enemyDir = 1;
    score = 0; running = true; shootCooldown = 0;
    hideOverlay(); setScore(score);
  }
  function restartGame() { reset(); }
  window.restartGame = restartGame;

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now-last)/1000);
    last = now;
    if (running && !window.__PAUSED__) update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    const ax = Input.axisX();
    ship.x += ax * 300 * dt;
    ship.x = Math.max(0, Math.min(W - ship.w, ship.x));

    shootCooldown -= dt;
    if (Input.actionEdge() && shootCooldown <= 0) {
      bullets.push({ x: ship.x + ship.w/2 - 2, y: ship.y, w: 4, h: 10 });
      shootCooldown = 0.28;
    }
    bullets.forEach(b => b.y -= 420*dt);
    bullets = bullets.filter(b => b.y > -20);

    let hitEdge = false;
    const alive = enemies.filter(e => e.alive);
    for (const e of alive) {
      e.x += enemyDir * 40 * dt;
      if (e.x < 10 || e.x + EW > W - 10) hitEdge = true;
    }
    if (hitEdge) {
      enemyDir *= -1;
      alive.forEach(e => e.y += 16);
    }

    for (const b of bullets) {
      for (const e of enemies) {
        if (!e.alive) continue;
        if (b.x < e.x+EW && b.x+b.w > e.x && b.y < e.y+EH && b.y+b.h > e.y) {
          e.alive = false; b.y = -999;
          score += 10; setScore(score);
        }
      }
    }
    bullets = bullets.filter(b => b.y > -20);

    if (alive.some(e => e.y + EH > ship.y)) {
      running = false;
      showOverlay('Invadido', 'Puntuación: ' + score);
    }
    if (enemies.every(e => !e.alive)) {
      running = false;
      showOverlay('¡Victoria!', 'Puntuación: ' + score);
    }
  }

  function draw() {
    ctx.fillStyle = '#0c0d0f'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#69d38b';
    enemies.forEach(e => { if (e.alive) ctx.fillRect(e.x, e.y, EW, EH); });
    ctx.fillStyle = '#f0f1f3';
    bullets.forEach(b => ctx.fillRect(b.x, b.y, b.w, b.h));
    ctx.fillStyle = '#78a9ff';
    ctx.fillRect(ship.x, ship.y, ship.w, ship.h);
  }

  reset();
  requestAnimationFrame(loop);
})();
"""

PACMAN_JS = """
(function() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const CELL = 20;
  const COLS = canvas.width / CELL, ROWS = canvas.height / CELL;
  let player, dots, ghost, score, running, stepAcc, ghostAcc, dir, nextDir;

  function buildDots() {
    const arr = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if ((x + y) % 2 === 0) arr.push({ x, y, eaten: false });
      }
    }
    return arr;
  }

  function reset() {
    player = { x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) };
    dir = { x: 0, y: 0 }; nextDir = { x: 0, y: 0 };
    dots = buildDots().filter(d => !(d.x === player.x && d.y === player.y));
    ghost = { x: 1, y: 1 };
    score = 0; running = true; stepAcc = 0; ghostAcc = 0;
    hideOverlay(); setScore(score);
  }
  function restartGame() { reset(); }
  window.restartGame = restartGame;

  function readDir() {
    const ax = Input.axisX(), ay = Input.axisY();
    if (Math.abs(ax) > Math.abs(ay)) {
      if (ax < -0.4) nextDir = { x: -1, y: 0 };
      else if (ax > 0.4) nextDir = { x: 1, y: 0 };
    } else {
      if (ay < -0.4) nextDir = { x: 0, y: -1 };
      else if (ay > 0.4) nextDir = { x: 0, y: 1 };
    }
  }

  function wrap(v, max) { return (v + max) % max; }

  const STEP_MS = 130, GHOST_MS = 190;
  let last = performance.now();
  function loop(now) {
    const dt = now - last; last = now;
    if (!window.__PAUSED__) readDir();
    if (running && !window.__PAUSED__) {
      stepAcc += dt;
      while (stepAcc >= STEP_MS) { stepAcc -= STEP_MS; stepPlayer(); }
      ghostAcc += dt;
      while (ghostAcc >= GHOST_MS) { ghostAcc -= GHOST_MS; stepGhost(); }
    }
    draw();
    requestAnimationFrame(loop);
  }

  function stepPlayer() {
    if (nextDir.x !== 0 || nextDir.y !== 0) dir = nextDir;
    if (dir.x === 0 && dir.y === 0) return;
    player = { x: wrap(player.x + dir.x, COLS), y: wrap(player.y + dir.y, ROWS) };
    const d = dots.find(d => !d.eaten && d.x === player.x && d.y === player.y);
    if (d) {
      d.eaten = true; score += 10; setScore(score);
      if (dots.every(d => d.eaten)) { running = false; showOverlay('¡Completado!', 'Puntuación: ' + score); }
    }
    checkCollision();
  }

  function stepGhost() {
    const dxAbs = Math.abs(player.x - ghost.x), dyAbs = Math.abs(player.y - ghost.y);
    if (dxAbs > dyAbs) ghost.x += player.x > ghost.x ? 1 : -1;
    else if (dyAbs > 0) ghost.y += player.y > ghost.y ? 1 : -1;
    else if (dxAbs > 0) ghost.x += player.x > ghost.x ? 1 : -1;
    ghost.x = wrap(ghost.x, COLS); ghost.y = wrap(ghost.y, ROWS);
    checkCollision();
  }

  function checkCollision() {
    if (running && ghost.x === player.x && ghost.y === player.y) {
      running = false;
      showOverlay('Game Over', 'Puntuación: ' + score);
    }
  }

  function draw() {
    ctx.fillStyle = '#0c0d0f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f0bf59';
    dots.forEach(d => {
      if (!d.eaten) { ctx.beginPath(); ctx.arc(d.x * CELL + CELL / 2, d.y * CELL + CELL / 2, 3, 0, Math.PI * 2); ctx.fill(); }
    });
    ctx.fillStyle = '#f5d445';
    ctx.beginPath();
    ctx.arc(player.x * CELL + CELL / 2, player.y * CELL + CELL / 2, CELL / 2 - 2, 0.25 * Math.PI, 1.75 * Math.PI);
    ctx.lineTo(player.x * CELL + CELL / 2, player.y * CELL + CELL / 2);
    ctx.fill();
    ctx.fillStyle = '#ff6b67';
    ctx.beginPath();
    ctx.arc(ghost.x * CELL + CELL / 2, ghost.y * CELL + CELL / 2 - 1, CELL / 2 - 3, Math.PI, 0);
    ctx.lineTo(ghost.x * CELL + CELL - 2, ghost.y * CELL + CELL - 2);
    ctx.lineTo(ghost.x * CELL + 2, ghost.y * CELL + CELL - 2);
    ctx.closePath();
    ctx.fill();
  }

  reset();
  requestAnimationFrame(loop);
})();
"""

ARCADE_DECADES = [
    {"key": "1970s", "label": "Años 70", "icon": "📻",
     "desc": "Los orígenes del videojuego arcade: Pong, Breakout, Space Invaders y los primeros juegos electrónicos."},
    {"key": "1980s", "label": "Años 80", "icon": "👾",
     "desc": "La edad de oro de los marcianitos y los comecocos de recreativa."},
    {"key": "1990s", "label": "Años 90", "icon": "📟",
     "desc": "El Snake que todo el mundo llevaba en el bolsillo del móvil."},
    {"key": "2010s", "label": "Años 2010", "icon": "📱",
     "desc": "La explosión del juego casual móvil, un botón y a jugar."},
    {"key": "clasicos", "label": "Milenarios", "icon": "♟️",
     "desc": "Ajedrez y Go — muchísimo más antiguos que cualquier arcade, y todavía sin resolver."},
]

CHESS_JS = """
(function() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const CELL = 46;
  const BOARD_PX = CELL * 8;
  const OX = (canvas.width - BOARD_PX) / 2, OY = (canvas.height - BOARD_PX) / 2;

  const GLYPH = {
    wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
    bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
  };

  let board, turn, cursor, selected, legalDest, running, checkColor, dirPrevX, dirPrevY;
  let moveNumber, lastEndReason, botModeOn, botThinking;

  function initialBoard() {
    const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    const b = [];
    b.push(back.map(t => 'b' + t));
    b.push(Array(8).fill('bP'));
    for (let i = 0; i < 4; i++) b.push(Array(8).fill(null));
    b.push(Array(8).fill('wP'));
    b.push(back.map(t => 'w' + t));
    return b;
  }

  function reset() {
    board = initialBoard();
    turn = 'w'; cursor = [7, 4]; selected = null; legalDest = [];
    running = true; checkColor = null; dirPrevX = 0; dirPrevY = 0;
    moveNumber = 0; lastEndReason = null; botThinking = false;
    hideOverlay();
    setScore('Blancas');
    const feed = document.getElementById('commentary-feed');
    if (feed) feed.innerHTML = '';
    if (botModeOn) scheduleBotMove();
  }
  function restartGame() { reset(); }
  window.restartGame = restartGame;

  function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function pieceColor(p) { return p ? p[0] : null; }
  function pieceType(p) { return p ? p[1] : null; }

  function pseudoMoves(b, r, c) {
    const p = b[r][c];
    if (!p) return [];
    const color = pieceColor(p), type = pieceType(p);
    const enemy = color === 'w' ? 'b' : 'w';
    const moves = [];

    function slide(dirs) {
      for (const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        while (inBounds(nr, nc)) {
          const t = b[nr][nc];
          if (!t) { moves.push([nr, nc]); }
          else { if (pieceColor(t) === enemy) moves.push([nr, nc]); break; }
          nr += dr; nc += dc;
        }
      }
    }
    function steps(deltas) {
      for (const [dr, dc] of deltas) {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc)) {
          const t = b[nr][nc];
          if (!t || pieceColor(t) === enemy) moves.push([nr, nc]);
        }
      }
    }

    if (type === 'R') slide([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    else if (type === 'B') slide([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
    else if (type === 'Q') slide([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
    else if (type === 'N') steps([[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]);
    else if (type === 'K') steps([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
    else if (type === 'P') {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      if (inBounds(r + dir, c) && !b[r + dir][c]) {
        moves.push([r + dir, c]);
        if (r === startRow && !b[r + 2 * dir][c]) moves.push([r + 2 * dir, c]);
      }
      for (const dc of [-1, 1]) {
        const nr = r + dir, nc = c + dc;
        if (inBounds(nr, nc) && b[nr][nc] && pieceColor(b[nr][nc]) === enemy) moves.push([nr, nc]);
      }
    }
    return moves;
  }

  function findKing(b, color) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (b[r][c] === color + 'K') return [r, c];
    return null;
  }
  function isSquareAttacked(b, r, c, byColor) {
    for (let rr = 0; rr < 8; rr++) for (let cc = 0; cc < 8; cc++) {
      const p = b[rr][cc];
      if (p && pieceColor(p) === byColor) {
        if (pseudoMoves(b, rr, cc).some(m => m[0] === r && m[1] === c)) return true;
      }
    }
    return false;
  }
  function inCheck(b, color) {
    const k = findKing(b, color);
    if (!k) return false;
    return isSquareAttacked(b, k[0], k[1], color === 'w' ? 'b' : 'w');
  }

  function legalMovesFor(b, r, c) {
    const p = b[r][c];
    if (!p) return [];
    const color = pieceColor(p);
    return pseudoMoves(b, r, c).filter(([nr, nc]) => {
      const clone = b.map(row => row.slice());
      clone[nr][nc] = clone[r][c];
      clone[r][c] = null;
      return !inCheck(clone, color);
    });
  }

  function allLegalMoves(b, color) {
    const res = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (p && pieceColor(p) === color) {
        for (const m of legalMovesFor(b, r, c)) res.push({ from: [r, c], to: m });
      }
    }
    return res;
  }

  function commitMove(from, to) {
    const [fr, fc] = from, [tr, tc] = to;
    const piece = board[fr][fc];
    board[tr][tc] = piece;
    board[fr][fc] = null;
    if (pieceType(piece) === 'P' && (tr === 0 || tr === 7)) {
      board[tr][tc] = pieceColor(piece) + 'Q';
    }
    moveNumber++;
    turn = turn === 'w' ? 'b' : 'w';
    updateStatus();
  }

  function updateStatus() {
    checkColor = inCheck(board, 'w') ? 'w' : (inCheck(board, 'b') ? 'b' : null);
    const moves = allLegalMoves(board, turn);
    setScore(turn === 'w' ? 'Blancas' : 'Negras');
    lastEndReason = null;
    if (moves.length === 0) {
      running = false;
      if (inCheck(board, turn)) {
        lastEndReason = 'checkmate';
        showOverlay('Jaque mate', (turn === 'w' ? 'Negras' : 'Blancas') + ' ganan');
      } else {
        lastEndReason = 'stalemate';
        showOverlay('Tablas', 'Ahogado — empate');
      }
    }
  }

  function handleAction() {
    if (botModeOn) return;
    const [r, c] = cursor;
    const p = board[r][c];
    if (selected) {
      const isDest = legalDest.some(m => m[0] === r && m[1] === c);
      if (isDest) { commitMove(selected, [r, c]); selected = null; legalDest = []; return; }
      if (r === selected[0] && c === selected[1]) { selected = null; legalDest = []; return; }
      if (p && pieceColor(p) === turn) { selected = [r, c]; legalDest = legalMovesFor(board, r, c); return; }
      selected = null; legalDest = [];
      return;
    }
    if (p && pieceColor(p) === turn) { selected = [r, c]; legalDest = legalMovesFor(board, r, c); }
  }

  function pollInput() {
    if (window.__PAUSED__ || !running || botModeOn) return;
    const ax = Input.axisX(), ay = Input.axisY();
    let dx = 0, dy = 0;
    if (Math.abs(ax) > Math.abs(ay)) dx = ax > 0.4 ? 1 : (ax < -0.4 ? -1 : 0);
    else dy = ay > 0.4 ? 1 : (ay < -0.4 ? -1 : 0);
    if ((dx !== dirPrevX || dy !== dirPrevY) && (dx !== 0 || dy !== 0)) {
      cursor = [Math.max(0, Math.min(7, cursor[0] + dy)), Math.max(0, Math.min(7, cursor[1] + dx))];
    }
    dirPrevX = dx; dirPrevY = dy;
    if (Input.actionEdge()) handleAction();
  }

  // ---------- IA propia (minimax + poda alfa-beta, sin motor externo) ----------

  const PIECE_VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };
  function squareBonus(r, c) {
    const dr = Math.abs(3.5 - r), dc = Math.abs(3.5 - c);
    return Math.max(0, 4 - (dr + dc));
  }
  function evaluate(b) {
    let score = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (!p) continue;
      const val = PIECE_VALUE[pieceType(p)] + squareBonus(r, c);
      score += pieceColor(p) === 'w' ? val : -val;
    }
    return score;
  }
  function simulateMove(b, m) {
    const clone = b.map(row => row.slice());
    const moved = clone[m.from[0]][m.from[1]];
    clone[m.to[0]][m.to[1]] = moved;
    clone[m.from[0]][m.from[1]] = null;
    if (pieceType(moved) === 'P' && (m.to[0] === 0 || m.to[0] === 7)) {
      clone[m.to[0]][m.to[1]] = pieceColor(moved) + 'Q';
    }
    return clone;
  }
  function minimax(b, depth, alpha, beta, maximizing) {
    // En las hojas no hace falta generar movimientos legales (lo más caro,
    // por la simulación de jaque en cada uno) — basta con evaluar el material.
    if (depth === 0) return evaluate(b);
    const color = maximizing ? 'w' : 'b';
    const moves = allLegalMoves(b, color);
    if (moves.length === 0) {
      if (inCheck(b, color)) return maximizing ? -100000 - depth : 100000 + depth;
      return 0;
    }
    if (maximizing) {
      let value = -Infinity;
      for (const m of moves) {
        value = Math.max(value, minimax(simulateMove(b, m), depth - 1, alpha, beta, false));
        alpha = Math.max(alpha, value);
        if (beta <= alpha) break;
      }
      return value;
    }
    let value = Infinity;
    for (const m of moves) {
      value = Math.min(value, minimax(simulateMove(b, m), depth - 1, alpha, beta, true));
      beta = Math.min(beta, value);
      if (beta <= alpha) break;
    }
    return value;
  }
  function chooseBotMove(b, color, depth) {
    const moves = allLegalMoves(b, color);
    if (moves.length === 0) return null;
    let best = [], bestScore = color === 'w' ? -Infinity : Infinity;
    for (const m of moves) {
      const score = minimax(simulateMove(b, m), depth - 1, -Infinity, Infinity, color !== 'w');
      if (color === 'w') {
        if (score > bestScore + 25) { bestScore = score; best = [m]; }
        else if (Math.abs(score - bestScore) <= 25) best.push(m);
      } else {
        if (score < bestScore - 25) { bestScore = score; best = [m]; }
        else if (Math.abs(score - bestScore) <= 25) best.push(m);
      }
    }
    return best[Math.floor(Math.random() * best.length)];
  }

  // ---------- Comentarios: sin LLM, clasificación de la jugada + plantillas ----------

  const PIECE_NAME = { P: 'peón', N: 'caballo', B: 'alfil', R: 'torre', Q: 'dama', K: 'rey' };
  const BOT_NAME = { w: 'Alfa', b: 'Beta' };
  const CENTER_SQ = [[3, 3], [3, 4], [4, 3], [4, 4]];
  function sq(r, c) { return String.fromCharCode(97 + c) + (8 - r); }

  const TEMPLATES = {
    checkmate: [
      '¡Jaque mate! {bot} sella la partida con {pieza} en {destino}.',
      'Y ahí está: jaque mate de {bot}. No hay escapatoria para el rey.',
    ],
    check: [
      '{bot} da jaque con {pieza} desde {destino} — el rey rival tiene que responder ya.',
      'Jaque. {bot} pone al rey contrario contra las cuerdas.',
    ],
    capturegrande: [
      '{bot} se lleva {piezaCapturada} con {pieza} en {destino} — cambio de material importante.',
      'Captura fuerte: {bot} gana {piezaCapturada} en {destino}.',
    ],
    captura: [
      '{bot} captura {piezaCapturada} en {destino}.',
      '{pieza} de {bot} recoge {piezaCapturada} en {destino}.',
    ],
    error: [
      'Eso pinta mal para {bot} — {pieza} a {destino} deja algo colgando.',
      '{bot} se complica la vida con este movimiento.',
    ],
    buena: [
      'Gran jugada de {bot}: {pieza} a {destino} mejora la posición claramente.',
      '{bot} encuentra un recurso sólido llevando {pieza} a {destino}.',
    ],
    desarrollo: [
      '{bot} desarrolla {pieza} hacia {destino}, sacándolo de la fila inicial.',
      'Jugada de desarrollo: {bot} saca {pieza} a {destino} para entrar en juego.',
    ],
    centro: [
      '{bot} ocupa {destino}, un cuadro central — más control, más opciones.',
      '{pieza} a {destino}: {bot} pelea por el centro del tablero.',
    ],
    peon: [
      '{bot} avanza el peón a {destino}, ganando espacio.',
      'Empuje de peón: {bot} juega {destino} para abrir líneas.',
    ],
    normal: [
      '{bot} mueve {pieza} a {destino}.',
      '{bot} juega {pieza} desde {origen} hasta {destino}.',
    ],
  };
  const REACTIONS = [
    'Buen punto, aunque yo habría cuidado más la seguridad del rey.',
    'Totalmente de acuerdo, esa jugada abre líneas interesantes.',
    'No lo tengo tan claro, el centro sigue disputado.',
    'Vamos a ver cómo responde el rival a esto.',
    'Ojo con esa pieza, puede quedar expuesta un par de jugadas más adelante.',
    'Yo habría preferido desarrollar antes de lanzarme a esto.',
  ];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function fill(tpl, ctx) { return tpl.replace(/\\{(\\w+)\\}/g, (_, k) => ctx[k] != null ? ctx[k] : ''); }

  function classifyMove(color, movedPiece, capturedPiece, from, to, endedGame, evalDelta) {
    if (endedGame === 'checkmate') return 'checkmate';
    if (checkColor) return 'check';
    if (capturedPiece && PIECE_VALUE[pieceType(capturedPiece)] >= 320) return 'capturegrande';
    if (capturedPiece) return 'captura';
    if (evalDelta <= -150) return 'error';
    if (evalDelta >= 150) return 'buena';
    const type = pieceType(movedPiece);
    if (moveNumber <= 12 && (type === 'N' || type === 'B') && (from[0] === 0 || from[0] === 7)) return 'desarrollo';
    if (CENTER_SQ.some(([r, c]) => r === to[0] && c === to[1])) return 'centro';
    if (type === 'P') return 'peon';
    return 'normal';
  }

  function addRemark(color, text, isReaction) {
    const feed = document.getElementById('commentary-feed');
    if (!feed) return;
    const div = document.createElement('div');
    div.className = 'remark bot-' + color + (isReaction ? ' reaction' : '');
    div.innerHTML = '<span class="who">' + BOT_NAME[color] + ':</span>' + text;
    feed.appendChild(div);
    feed.scrollTop = feed.scrollHeight;
  }

  function addCommentary(color, movedPiece, capturedPiece, from, to, evalDelta) {
    const tag = classifyMove(color, movedPiece, capturedPiece, from, to, lastEndReason, evalDelta);
    const ctx = {
      bot: BOT_NAME[color],
      pieza: PIECE_NAME[pieceType(movedPiece)],
      piezaCapturada: capturedPiece ? PIECE_NAME[pieceType(capturedPiece)] : '',
      origen: sq(from[0], from[1]),
      destino: sq(to[0], to[1]),
    };
    addRemark(color, fill(pick(TEMPLATES[tag]), ctx), false);
    if (running && Math.random() < 0.35) {
      const other = color === 'w' ? 'b' : 'w';
      addRemark(other, pick(REACTIONS), true);
    }
  }

  // ---------- Modo Bot vs Bot ----------

  function buildSidePanel() {
    const panel = document.getElementById('side-panel');
    if (!panel) return;
    panel.innerHTML =
      '<div class="panel-head">🤖 Alfa vs Beta</div>' +
      '<button class="mini-btn bot-toggle-btn" id="bot-toggle">▶ Activar modo Bot vs Bot</button>' +
      '<div class="commentary-feed" id="commentary-feed"></div>';
    document.getElementById('bot-toggle').onclick = toggleBotMode;
  }

  function toggleBotMode() {
    botModeOn = !botModeOn;
    const btn = document.getElementById('bot-toggle');
    if (btn) btn.textContent = botModeOn ? '⏸ Detener modo Bot vs Bot' : '▶ Activar modo Bot vs Bot';
    selected = null; legalDest = [];
    if (botModeOn) scheduleBotMove();
  }

  function scheduleBotMove() {
    if (!botModeOn || !running) return;
    if (window.__PAUSED__) { setTimeout(scheduleBotMove, 300); return; }
    botThinking = true;
    setTimeout(() => {
      botThinking = false;
      if (!botModeOn || !running || window.__PAUSED__) { if (botModeOn) setTimeout(scheduleBotMove, 300); return; }
      playBotMove();
      if (botModeOn && running) setTimeout(scheduleBotMove, 900);
      else if (botModeOn && !running) {
        botModeOn = false;
        const btn = document.getElementById('bot-toggle');
        if (btn) btn.textContent = '▶ Activar modo Bot vs Bot';
      }
    }, 350);
  }

  function playBotMove() {
    const color = turn;
    const move = chooseBotMove(board, color, 2);
    if (!move) return;
    const movedPiece = board[move.from[0]][move.from[1]];
    const capturedPiece = board[move.to[0]][move.to[1]];
    const evalBefore = evaluate(board);
    commitMove(move.from, move.to);
    const evalAfter = evaluate(board);
    const evalDelta = (color === 'w' ? 1 : -1) * (evalAfter - evalBefore);
    addCommentary(color, movedPiece, capturedPiece, move.from, move.to, evalDelta);
  }

  function draw() {
    ctx.fillStyle = '#0c0d0f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#2a2d33' : '#1a1c20';
      ctx.fillRect(OX + c * CELL, OY + r * CELL, CELL, CELL);
    }
    if (checkColor) {
      const k = findKing(board, checkColor);
      if (k) { ctx.fillStyle = 'rgba(255,107,103,.4)'; ctx.fillRect(OX + k[1] * CELL, OY + k[0] * CELL, CELL, CELL); }
    }
    legalDest.forEach(([r, c]) => {
      ctx.fillStyle = 'rgba(105,211,139,.4)';
      ctx.beginPath(); ctx.arc(OX + c * CELL + CELL / 2, OY + r * CELL + CELL / 2, 8, 0, Math.PI * 2); ctx.fill();
    });
    if (selected) {
      ctx.strokeStyle = '#78a9ff'; ctx.lineWidth = 3;
      ctx.strokeRect(OX + selected[1] * CELL + 2, OY + selected[0] * CELL + 2, CELL - 4, CELL - 4);
    }
    ctx.font = (CELL - 8) + 'px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p) {
        ctx.fillStyle = pieceColor(p) === 'w' ? '#f5f6f8' : '#0a0a0b';
        ctx.fillText(GLYPH[p], OX + c * CELL + CELL / 2, OY + r * CELL + CELL / 2 + 2);
      }
    }
    ctx.strokeStyle = '#f0bf59'; ctx.lineWidth = 2;
    ctx.strokeRect(OX + cursor[1] * CELL + 1, OY + cursor[0] * CELL + 1, CELL - 2, CELL - 2);
  }

  function loop() {
    pollInput();
    draw();
    requestAnimationFrame(loop);
  }

  botModeOn = false;
  buildSidePanel();
  reset();
  requestAnimationFrame(loop);
})();
"""

GO_JS = """
(function() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const SIZE = 9;
  const CELL = 42;
  const BOARD_PX = CELL * (SIZE - 1);
  const OX = (canvas.width - BOARD_PX) / 2, OY = (canvas.height - BOARD_PX) / 2;

  let board, turn, cursor, running, history, passCount, dirPrevX, dirPrevY;

  function emptyBoard() { return Array.from({ length: SIZE }, () => Array(SIZE).fill(null)); }

  function reset() {
    board = emptyBoard();
    turn = 'B'; cursor = [4, 4]; running = true; history = []; passCount = 0;
    dirPrevX = 0; dirPrevY = 0;
    hideOverlay();
    setScore('Negro');
  }
  function restartGame() { reset(); }
  window.restartGame = restartGame;

  function neighbors(r, c) {
    const res = [];
    if (r > 0) res.push([r - 1, c]);
    if (r < SIZE - 1) res.push([r + 1, c]);
    if (c > 0) res.push([r, c - 1]);
    if (c < SIZE - 1) res.push([r, c + 1]);
    return res;
  }

  function groupAndLiberties(b, r, c) {
    const color = b[r][c];
    const visited = new Set();
    const stack = [[r, c]];
    const group = [];
    const libSeen = new Set();
    while (stack.length) {
      const [cr, cc] = stack.pop();
      const key = cr + ',' + cc;
      if (visited.has(key)) continue;
      visited.add(key);
      group.push([cr, cc]);
      for (const [nr, nc] of neighbors(cr, cc)) {
        const nv = b[nr][nc];
        if (nv === null) { libSeen.add(nr + ',' + nc); }
        else if (nv === color) { const nk = nr + ',' + nc; if (!visited.has(nk)) stack.push([nr, nc]); }
      }
    }
    return { group, liberties: libSeen.size };
  }

  function boardKey(b) { return b.map(row => row.map(v => v || '.').join('')).join('|'); }
  function cloneBoard(b) { return b.map(row => row.slice()); }

  function attemptMove(r, c) {
    if (board[r][c] !== null) return;
    const color = turn, enemy = color === 'B' ? 'W' : 'B';
    const trial = cloneBoard(board);
    trial[r][c] = color;

    let captured = 0;
    for (const [nr, nc] of neighbors(r, c)) {
      if (trial[nr][nc] === enemy) {
        const { group, liberties } = groupAndLiberties(trial, nr, nc);
        if (liberties === 0) { group.forEach(([gr, gc]) => { trial[gr][gc] = null; }); captured += group.length; }
      }
    }
    const { liberties: ownLiberties } = groupAndLiberties(trial, r, c);
    if (ownLiberties === 0 && captured === 0) return;

    const key = boardKey(trial);
    if (history.length >= 2 && key === history[history.length - 2]) return;

    board = trial;
    history.push(key);
    if (history.length > 6) history.shift();
    passCount = 0;
    turn = enemy;
    setScore(turn === 'B' ? 'Negro' : 'Blanco');
  }

  function passTurn() {
    passCount++;
    turn = turn === 'B' ? 'W' : 'B';
    setScore(turn === 'B' ? 'Negro' : 'Blanco');
    if (passCount >= 2) endGame();
  }

  function endGame() {
    running = false;
    const territory = { B: 0, W: 0 };
    const visited = new Set();
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== null) continue;
      const key = r + ',' + c;
      if (visited.has(key)) continue;
      const stack = [[r, c]], region = [], borders = new Set();
      while (stack.length) {
        const [cr, cc] = stack.pop();
        const k2 = cr + ',' + cc;
        if (visited.has(k2)) continue;
        visited.add(k2); region.push([cr, cc]);
        for (const [nr, nc] of neighbors(cr, cc)) {
          if (board[nr][nc] === null) { if (!visited.has(nr + ',' + nc)) stack.push([nr, nc]); }
          else borders.add(board[nr][nc]);
        }
      }
      if (borders.size === 1) territory[[...borders][0]] += region.length;
    }
    let stonesB = 0, stonesW = 0;
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 'B') stonesB++; else if (board[r][c] === 'W') stonesW++;
    }
    const scoreB = stonesB + territory.B;
    const scoreW = stonesW + territory.W + 5.5;
    const winner = scoreB > scoreW ? 'Negro' : 'Blanco';
    showOverlay('Fin de la partida', 'Negro ' + scoreB + ' · Blanco ' + scoreW.toFixed(1) + ' — gana ' + winner);
  }

  function pollInput() {
    if (window.__PAUSED__ || !running) return;
    const ax = Input.axisX(), ay = Input.axisY();
    let dx = 0, dy = 0;
    if (Math.abs(ax) > Math.abs(ay)) dx = ax > 0.4 ? 1 : (ax < -0.4 ? -1 : 0);
    else dy = ay > 0.4 ? 1 : (ay < -0.4 ? -1 : 0);
    if ((dx !== dirPrevX || dy !== dirPrevY) && (dx !== 0 || dy !== 0)) {
      cursor = [Math.max(0, Math.min(SIZE - 1, cursor[0] + dy)), Math.max(0, Math.min(SIZE - 1, cursor[1] + dx))];
    }
    dirPrevX = dx; dirPrevY = dy;
    if (Input.actionEdge()) attemptMove(cursor[0], cursor[1]);
    if (Input.secondaryEdge()) passTurn();
  }

  function draw() {
    ctx.fillStyle = '#1c140a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#7a5c34'; ctx.lineWidth = 1;
    for (let i = 0; i < SIZE; i++) {
      ctx.beginPath(); ctx.moveTo(OX + i * CELL, OY); ctx.lineTo(OX + i * CELL, OY + BOARD_PX); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(OX, OY + i * CELL); ctx.lineTo(OX + BOARD_PX, OY + i * CELL); ctx.stroke();
    }
    ctx.fillStyle = '#7a5c34';
    [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]].forEach(([r, c]) => {
      ctx.beginPath(); ctx.arc(OX + c * CELL, OY + r * CELL, 3, 0, Math.PI * 2); ctx.fill();
    });
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      if (board[r][c]) {
        ctx.beginPath();
        ctx.arc(OX + c * CELL, OY + r * CELL, CELL / 2 - 2, 0, Math.PI * 2);
        ctx.fillStyle = board[r][c] === 'B' ? '#111214' : '#f0f1f3';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.stroke();
      }
    }
    ctx.strokeStyle = '#f0bf59'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(OX + cursor[1] * CELL, OY + cursor[0] * CELL, CELL / 2 - 2, 0, Math.PI * 2); ctx.stroke();
  }

  function loop() {
    pollInput();
    draw();
    requestAnimationFrame(loop);
  }

  reset();
  requestAnimationFrame(loop);
})();
"""

GAMES = [
    {"slug": "pong", "title": "Pong", "icon": "🏓", "decade": "1970s",
     "desc": "El clásico. Tú contra la CPU, a 5 puntos.",
     "instructions": "Stick / flechas arriba-abajo para mover la pala"},
    {"slug": "breakout", "title": "Breakout", "icon": "🧱", "decade": "1970s",
     "desc": "Rompe todos los bloques sin perder la bola.",
     "instructions": "Stick / flechas izquierda-derecha para mover la pala"},
    {"slug": "simon", "title": "Simon dice", "icon": "🔴", "decade": "1970s",
     "desc": "Repite la secuencia de colores, cada vez más larga.",
     "instructions": "Stick / flechas hacia el color que se ilumina"},
    {"slug": "invaders", "title": "Space Invaders", "icon": "👾", "decade": "1970s",
     "desc": "Dispara a las oleadas antes de que lleguen abajo.",
     "instructions": "Stick / flechas para moverte, acción / espacio para disparar"},
    {"slug": "pacman", "title": "Comecocos", "icon": "🟡", "decade": "1980s",
     "desc": "Come todos los puntos sin que te pille el fantasma.",
     "instructions": "Stick / flechas para moverte por el tablero"},
    {"slug": "snake", "title": "Snake", "icon": "🐍", "decade": "1990s",
     "desc": "Come y crece sin chocar contigo mismo.",
     "instructions": "Stick / flechas para girar"},
    {"slug": "flappy", "title": "Flappy", "icon": "🐦", "decade": "2010s",
     "desc": "Esquiva las tuberías con un solo botón.",
     "instructions": "Botón de acción / espacio para saltar"},
    {"slug": "chess", "title": "Ajedrez", "icon": "♟️", "decade": "clasicos",
     "desc": "A dos jugadores, con jaque y jaque mate reales (sin enroque ni al paso).",
     "instructions": "Stick / flechas mueve el cursor · acción selecciona y mueve una pieza"},
    {"slug": "go", "title": "Go", "icon": "⚫", "decade": "clasicos",
     "desc": "9×9, con capturas por libertades, regla de Ko y conteo de territorio al final.",
     "instructions": "Stick / flechas mueve el cursor · acción coloca ficha · botón secundario (Círculo/X) pasa turno"},
]

GAME_SCRIPTS = {
    "pong": PONG_JS,
    "breakout": BREAKOUT_JS,
    "snake": SNAKE_JS,
    "flappy": FLAPPY_JS,
    "simon": SIMON_JS,
    "invaders": INVADERS_JS,
    "pacman": PACMAN_JS,
    "chess": CHESS_JS,
    "go": GO_JS,
}
