
(function() {
  const svg = document.getElementById('graph-svg');
  const legendEl = document.getElementById('graph-legend');

  fetch('/data.json').then(r => r.json()).then(init);

  function init(data) {
    const nodes = data.graph.nodes.map(n => ({ ...n, x: Math.random() * 600 + 40, y: Math.random() * 360 + 40, vx: 0, vy: 0 }));
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    const edges = data.graph.edges.filter(e => byId[e.source] && byId[e.target]);

    const COLORS = { tipos: '#7aa2ff', patrones: '#69d38b', estereo: '#f0bf59', instrumentos: '#ff6b67' };
    legendEl.innerHTML = data.categories.map(c =>
      `<span><span class="sw" style="background:${COLORS[c.key]}"></span>${c.label}</span>`
    ).join('');

    const W = svg.clientWidth || 800, H = svg.clientHeight || 500;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    nodes.forEach(n => { n.x = Math.random() * W; n.y = Math.random() * H; });

    function tick() {
      for (const n of nodes) { n.vx *= 0.85; n.vy *= 0.85; }
      const REPEL = 2200;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = REPEL / (dist * dist);
          const fx = (dx / dist) * f, fy = (dy / dist) * f;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }
      for (const e of edges) {
        const a = byId[e.source], b = byId[e.target];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (dist - 130) * 0.01;
        a.vx += (dx / dist) * f; a.vy += (dy / dist) * f;
        b.vx -= (dx / dist) * f; b.vy -= (dy / dist) * f;
      }
      const cx = W / 2, cy = H / 2;
      for (const n of nodes) {
        n.vx += (cx - n.x) * 0.0006; n.vy += (cy - n.y) * 0.0006;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(30, Math.min(W - 30, n.x));
        n.y = Math.max(30, Math.min(H - 30, n.y));
      }
      draw();
    }

    function draw() {
      const parts = [];
      for (const e of edges) {
        const a = byId[e.source], b = byId[e.target];
        parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#3a3f4a" stroke-width="1.2"/>`);
      }
      for (const n of nodes) {
        parts.push(`<a href="${n.url}"><circle cx="${n.x}" cy="${n.y}" r="10" fill="${n.color}" stroke="#111214" stroke-width="2"/>` +
          `<text x="${n.x}" y="${n.y + 22}" font-size="10.5" fill="#b7bcc4" text-anchor="middle">${n.label}</text></a>`);
      }
      svg.innerHTML = parts.join('');
    }

    let frames = 0;
    const interval = setInterval(() => { tick(); frames++; if (frames > 320) clearInterval(interval); }, 30);
  }
})();
