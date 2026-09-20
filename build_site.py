"""
Genera el sitio estático completo en docs/ a partir de ontology_data.py.

    python3 build_site.py

Produce:
  docs/index.html                      página de inicio
  docs/<categoria>/index.html          índice de cada categoría
  docs/<categoria>/<slug>.html         ficha de cada concepto (con JSON-LD
                                        schema.org incrustado, para SEO)
  docs/grafo.html                      vista interactiva del grafo completo
  docs/data.json                       grafo nodes/edges (mismo patrón que
  docs/config.json                     usa teatrero_core/_static_export:
  docs/manifest.json                   data+config con hash de integridad)
  docs/ontology.jsonld                 ontología formal (SKOS) reutilizable
  docs/assets/style.css
  docs/assets/graph.js
  docs/CNAME                           dominio propio para GitHub Pages
"""

import hashlib
import json
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

from ontology_data import CATEGORIES, CONCEPTS, concepts_by_id, concepts_by_category
from arcade_data import ARCADE_DECADES, GAMES as ARCADE_GAMES, GAME_SCRIPTS, render_game

SITE_NAME = "Microfonía — Radio Micelio"
SITE_URL = "https://microfonia.radiomicelio.com"
SITE_DESCRIPTION = (
    "Ontología abierta de microfonía: tipos de micrófono, patrones polares, "
    "técnicas estéreo y colocación por instrumento."
)
ONTOLOGY_NS = f"{SITE_URL}/ontology#"
ROOT = Path(__file__).parent
DOCS = ROOT / "docs"

FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🎙️</text></svg>'
FAVICON_HREF = "data:image/svg+xml," + urllib.parse.quote(FAVICON_SVG)

# Universo de ontologías de Radio Micelio: un personaje, un dominio de
# conocimiento. Solo Sísmico está publicado; el resto son adelantos.
ONTOLOGY_AVAILABLE = {
    "character": "Sísmico",
    "topic": "Microfonía y otra sensórica",
    "href": "/",
}
ONTOLOGY_UPCOMING = sorted(
    [
        {"character": "Atómico", "topic": "Evolución"},
        {"character": "Marza", "topic": "Naturaleza y tecnología"},
        {"character": "Tamen", "topic": "Nuevas redes"},
        {"character": "Amethystos", "topic": "Botánica"},
        {"character": "Daphne Rockmore", "topic": "Electricidad y electrónica"},
        {"character": "Sirius", "topic": "Exploración espacial"},
        {"character": "Basscolgado", "topic": "España vaciada"},
        {"character": "Musitoxic", "topic": "IMT"},
        {"character": "Jhonny", "topic": "Energía"},
        {"character": "Miguel Mafias, el Muso", "topic": "Demonios internos"},
    ],
    key=lambda o: o["character"],
)


def slugify(text):
    import unicodedata

    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.lower().replace(",", "")
    out, prev_dash = [], False
    for ch in text:
        if ch.isalnum():
            out.append(ch)
            prev_dash = False
        elif not prev_dash:
            out.append("-")
            prev_dash = True
    return "".join(out).strip("-")


for _o in ONTOLOGY_UPCOMING:
    _o["slug"] = slugify(_o["character"])


# ---------------------------------------------------------------- helpers

def now_iso():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_text(path: Path, text: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def write_json(path: Path, obj) -> Path:
    return write_text(path, json.dumps(obj, ensure_ascii=False, indent=2))


def category_of(key):
    return next(c for c in CATEGORIES if c["key"] == key)


def url_for(concept):
    return f"{SITE_URL}/{concept['category']}/{concept['id']}/"


# ------------------------------------------------------------- HTML shell

STYLE_CSS = """
:root {
  color-scheme: dark;
  --bg: #0a0a0b; --panel: #141416; --panel-2: #1b1b1e;
  --line: #2c2c2f; --text: #f4f4f5; --text-2: #c2c2c6; --muted: #8a8a8f;
  --accent: #ef2b2b; --accent-2: #ff5c5c;
}
* { box-sizing: border-box; min-width: 0; }
html { scroll-behavior: smooth; overflow-x: hidden; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.6;
  overflow-x: hidden;
}
a { color: var(--accent-2); }

/* app shell: sidebar persistente + columna de contenido */
.app-shell { display: flex; align-items: flex-start; min-height: 100vh; position: relative; }
.sidebar {
  width: 250px; flex-shrink: 0; background: var(--panel); border-right: 1px solid var(--line);
  position: sticky; top: 0; height: 100vh; overflow-y: auto;
  transition: width .18s ease, margin-left .18s ease;
}
.sidebar.collapsed { width: 0; margin-left: -250px; }
.sidebar-inner { width: 250px; padding: 18px 12px 30px; }
.side-arcade {
  display: flex; align-items: center; gap: 9px; padding: 11px 12px; border-radius: 9px;
  background: linear-gradient(135deg, rgba(239,43,43,.18), rgba(239,43,43,.02));
  border: 1px solid rgba(239,43,43,.35); color: var(--text); text-decoration: none;
  font-weight: 800; font-size: 14px; margin-bottom: 18px;
}
.side-arcade:hover { border-color: var(--accent); }
.side-icon { font-size: 16px; }
.side-section-label {
  font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted);
  font-weight: 700; padding: 6px 10px 6px;
}
.side-section-label.sub { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 14px; }
.side-onto-list { display: flex; flex-direction: column; gap: 2px; }
.side-onto {
  display: block; padding: 8px 10px; border-radius: 8px; text-decoration: none;
  color: var(--text-2); border: 1px solid transparent;
}
.side-onto:hover { background: var(--panel-2); }
.side-onto b { display: block; font-size: 12.5px; color: var(--text); font-weight: 650; }
.side-onto span { display: block; font-size: 10.5px; color: var(--muted); margin-top: 1px; }
.side-onto.active-onto { background: rgba(239,43,43,.13); border-color: rgba(239,43,43,.35); }
.side-onto.active-onto b { color: var(--accent-2); }
.side-onto.soon { opacity: .55; }
.side-onto.soon:hover { opacity: .85; }
.side-onto.soon b::after { content: " · pronto"; font-size: 9px; color: var(--muted); font-weight: 400; text-transform: uppercase; letter-spacing: .04em; }
.sidebar-backdrop { display: none; }
.content-col { flex: 1; min-width: 0; }
.sidebar-toggle { font-size: 15px; padding: 6px 10px; }

header.site {
  padding: 16px 20px; border-bottom: 1px solid var(--line);
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  position: sticky; top: 0; background: rgba(17,18,20,.92); backdrop-filter: blur(6px); z-index: 10;
}
header.site .brand { font-weight: 700; text-decoration: none; color: var(--text); font-size: 15px; }
header.site nav { display: flex; gap: 14px; flex-wrap: wrap; font-size: 13.5px; margin-left: auto; }
header.site nav a { color: var(--text-2); text-decoration: none; }
header.site nav a:hover { color: var(--accent-2); }

@media (max-width: 860px) {
  .sidebar { position: fixed; top: 0; left: 0; z-index: 30; box-shadow: 0 0 40px rgba(0,0,0,.5); }
  .sidebar.collapsed { width: 250px; margin-left: -250px; }
  body.sidebar-open .sidebar-backdrop {
    display: block; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 25;
  }
}

main { max-width: 880px; margin: 0 auto; padding: 28px 18px 60px; }
h1 { font-size: clamp(22px, 5vw, 30px); margin: 0 0 6px; }
h2 { font-size: 18px; margin: 28px 0 10px; }
p.lead { color: var(--text-2); font-size: 15px; max-width: 60ch; }
.crumbs { font-size: 12.5px; color: var(--muted); margin-bottom: 14px; }
.crumbs a { color: var(--muted); }
.cat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; margin-top: 18px; }
.cat-card {
  display: block; background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  padding: 16px; text-decoration: none; color: inherit; transition: border-color .15s, transform .15s;
}
.cat-card:hover { border-color: #454a54; transform: translateY(-2px); }
.cat-card .icon { font-size: 24px; }
.cat-card h3 { margin: 8px 0 4px; font-size: 15px; color: var(--text); }
.cat-card p { margin: 0; font-size: 12.5px; color: var(--muted); }
.concept-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-top: 14px; }
.concept-card {
  display: block; background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
  padding: 12px 14px; text-decoration: none; color: inherit; font-size: 13.5px;
}
.concept-card:hover { border-color: #454a54; }
.concept-card b { display: block; color: var(--text); font-size: 14px; margin-bottom: 2px; }
.concept-card span { color: var(--muted); font-size: 12px; }
table.props { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13.5px; }
table.props th, table.props td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); }
table.props th { color: var(--muted); font-weight: 600; width: 40%; }
.relations { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.relation-group { font-size: 13.5px; }
.relation-group .pred { color: var(--muted); margin-right: 6px; }
.relation-group a { margin-right: 10px; }
.pill { display: inline-block; font-size: 11px; color: var(--muted); border: 1px solid var(--line); border-radius: 20px; padding: 2px 9px; margin-bottom: 8px; }
footer.site { max-width: 880px; margin: 0 auto; padding: 20px 18px 50px; color: var(--muted); font-size: 12px; border-top: 1px solid var(--line); }
footer.site a { color: var(--muted); }
.hero {
  text-align: center; padding: 18px 0 6px;
}
.hero-img-wrap {
  width: min(340px, 70vw); margin: 0 auto; position: relative;
}
.hero-img {
  width: 100%; height: auto; display: block; filter: url(#sismico-wave) drop-shadow(0 0 40px rgba(239,43,43,.18));
  animation: hero-breathe 7s ease-in-out infinite;
}
@keyframes hero-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.015); }
}
.hero-link {
  display: inline-block; margin-top: 4px; font-size: 15px; font-weight: 800;
  letter-spacing: .02em; text-decoration: none; color: var(--text);
  border-bottom: 2px solid var(--accent); padding-bottom: 2px;
}
.hero-link:hover { color: var(--accent-2); }
.hero-sub { color: var(--muted); font-size: 12px; margin: 6px 0 0; }
.hero-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; justify-content: center; }
.btn {
  display: inline-block; padding: 9px 16px; border-radius: 7px; text-decoration: none;
  font-size: 13.5px; font-weight: 600; border: 1px solid var(--line);
}
.btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); font-weight: 700; }
.btn.ghost { color: var(--text-2); }
#graph-wrap { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; margin-top: 16px; }
#graph-svg { width: 100%; height: 70vh; min-height: 420px; display: block; touch-action: pan-x pan-y; }
.graph-legend { display: flex; gap: 14px; flex-wrap: wrap; padding: 10px 14px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); }
.graph-legend .sw { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 5px; }
table.props th, table.props td { word-break: break-word; }
@media (max-width: 560px) {
  header.site { flex-direction: column; align-items: flex-start; gap: 8px; }
  header.site nav { margin-left: 0; width: 100%; justify-content: flex-start; }
}
"""


def build_sidebar_html():
    upcoming_items = "\n".join(
        f"""<a class="side-onto soon" href="/proximamente/{o['slug']}/">
              <b>{o['character']}</b><span>{o['topic']}</span>
            </a>"""
        for o in ONTOLOGY_UPCOMING
    )
    return f"""
<aside class="sidebar" id="sidebar">
  <div class="sidebar-inner">
    <a class="side-arcade" href="/arcade/"><span class="side-icon">🕹️</span> Arcade</a>
    <div class="side-section-label">Ontologías</div>
    <nav class="side-onto-list">
      <a class="side-onto active-onto" href="{ONTOLOGY_AVAILABLE['href']}">
        <b>{ONTOLOGY_AVAILABLE['character']}</b><span>{ONTOLOGY_AVAILABLE['topic']}</span>
      </a>
    </nav>
    <div class="side-section-label sub">Próximamente</div>
    <nav class="side-onto-list upcoming">
{upcoming_items}
    </nav>
  </div>
</aside>
"""


def page_shell(*, title, description, canonical, body_html, jsonld_obj, active_nav=None):
    jsonld = json.dumps(jsonld_obj, ensure_ascii=False, indent=2)
    nav_items = [("/", "Inicio"), ("/grafo/", "Grafo"), ("/ontology.jsonld", "Ontología (JSON-LD)")]
    nav_html = "".join(
        f'<a href="{href}"{" style=\"color:var(--accent-2)\"" if href == active_nav else ""}>{label}</a>'
        for href, label in nav_items
    )
    sidebar_html = build_sidebar_html()
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="canonical" href="{canonical}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:type" content="website">
<meta property="og:url" content="{canonical}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="{FAVICON_HREF}">
<link rel="stylesheet" href="/assets/style.css">
<script type="application/ld+json">
{jsonld}
</script>
</head>
<body>
<div class="app-shell">
{sidebar_html}
  <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
  <div class="content-col">
    <header class="site">
      <button class="mini-btn sidebar-toggle" id="sidebar-toggle" aria-label="Mostrar/ocultar menú">☰</button>
      <a class="brand" href="/">🎙️ Microfonía</a>
      <nav>{nav_html}</nav>
    </header>
    <main>
{body_html}
    </main>
    <footer class="site">
      Parte de <a href="https://radiomicelio.com">Radio Micelio</a> · Ontología libre, contenido bajo CC BY 4.0 ·
      <a href="/ontology.jsonld">datos en JSON-LD</a>
    </footer>
  </div>
</div>
<script>
(function() {{
  var sidebar = document.getElementById('sidebar');
  var toggle = document.getElementById('sidebar-toggle');
  var backdrop = document.getElementById('sidebar-backdrop');
  var isMobile = function() {{ return window.matchMedia('(max-width: 860px)').matches; }};
  function apply(collapsed) {{
    sidebar.classList.toggle('collapsed', collapsed);
    document.body.classList.toggle('sidebar-open', !collapsed && isMobile());
  }}
  var saved = null;
  try {{ saved = localStorage.getItem('mf-sidebar-collapsed'); }} catch (e) {{}}
  apply(isMobile() ? true : saved === '1');
  toggle.addEventListener('click', function() {{
    var collapsed = !sidebar.classList.contains('collapsed');
    apply(collapsed);
    if (!isMobile()) {{ try {{ localStorage.setItem('mf-sidebar-collapsed', collapsed ? '1' : '0'); }} catch (e) {{}} }}
  }});
  backdrop.addEventListener('click', function() {{ apply(true); }});
}})();
</script>
</body>
</html>
"""


# ------------------------------------------------------------------ pages

def build_home():
    cards = "\n".join(
        f"""<a class="cat-card" href="/{c['key']}/">
              <div class="icon">{c['icon']}</div>
              <h3>{c['label']}</h3>
              <p>{c['desc']}</p>
            </a>"""
        for c in CATEGORIES
    )
    body = f"""
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <filter id="sismico-wave" x="-20%" y="-20%" width="140%" height="140%">
    <feTurbulence type="fractalNoise" numOctaves="2" baseFrequency="0.009 0.014" seed="7" result="noise">
      <animate attributeName="baseFrequency" values="0.009 0.014;0.013 0.010;0.009 0.014" dur="14s" repeatCount="indefinite"/>
    </feTurbulence>
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="22" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</svg>
<div class="hero">
  <div class="hero-img-wrap">
    <picture>
      <source srcset="/assets/img/sismico.webp" type="image/webp">
      <img class="hero-img" src="/assets/img/sismico.png" alt="Sísmico — Radio Micelio" width="1000" height="1000" fetchpriority="high">
    </picture>
  </div>
  <h1><a class="hero-link" href="/grafo/">🎙️ Microfonía</a></h1>
  <p class="hero-sub">Parte del universo Radio Micelio</p>
</div>
<p class="pill" style="display:block; text-align:center; margin: 18px auto 0; width:fit-content;">Ontología abierta · {len(CONCEPTS)} conceptos</p>
<p class="lead" style="margin-left:auto; margin-right:auto; text-align:center;">{SITE_DESCRIPTION}</p>
<div class="hero-actions">
  <a class="btn primary" href="/grafo/">Explorar el grafo →</a>
  <a class="btn ghost" href="/ontology.jsonld">Descargar ontología (JSON-LD)</a>
</div>
<h2>Categorías</h2>
<div class="cat-grid">
{cards}
</div>
"""
    jsonld = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": SITE_NAME,
        "url": SITE_URL,
        "description": SITE_DESCRIPTION,
        "inLanguage": "es",
    }
    html = page_shell(
        title=SITE_NAME,
        description=SITE_DESCRIPTION,
        canonical=f"{SITE_URL}/",
        body_html=body,
        jsonld_obj=jsonld,
        active_nav="/",
    )
    write_text(DOCS / "index.html", html)


def build_category_pages():
    for cat in CATEGORIES:
        items = concepts_by_category(cat["key"])
        cards = "\n".join(
            f"""<a class="concept-card" href="/{c['category']}/{c['id']}/">
                  <b>{c['label']}</b><span>{c['en_label']}</span>
                </a>"""
            for c in items
        )
        body = f"""
<div class="crumbs"><a href="/">Inicio</a> / {cat['label']}</div>
<p class="pill">{cat['icon']} Categoría</p>
<h1>{cat['label']}</h1>
<p class="lead">{cat['desc']}</p>
<div class="concept-list">
{cards}
</div>
"""
        jsonld = {
            "@context": "https://schema.org",
            "@type": "DefinedTermSet",
            "name": cat["label"],
            "description": cat["desc"],
            "url": f"{SITE_URL}/{cat['key']}/",
            "hasDefinedTerm": [
                {"@type": "DefinedTerm", "name": c["label"], "url": url_for(c)}
                for c in items
            ],
        }
        html = page_shell(
            title=f"{cat['label']} · {SITE_NAME}",
            description=cat["desc"],
            canonical=f"{SITE_URL}/{cat['key']}/",
            body_html=body,
            jsonld_obj=jsonld,
        )
        write_text(DOCS / cat["key"] / "index.html", html)


def build_concept_pages():
    by_id = concepts_by_id()
    for c in CONCEPTS:
        cat = category_of(c["category"])
        rows = "\n".join(
            f"<tr><th>{k}</th><td>{v if not isinstance(v, bool) else ('Sí' if v else 'No')}</td></tr>"
            for k, v in c["properties"].items()
        )
        rel_groups = []
        for pred, ids in c.get("relations", {}).items():
            links = " ".join(f'<a href="/{by_id[i]["category"]}/{i}/">{by_id[i]["label"]}</a>' for i in ids if i in by_id)
            if links:
                rel_groups.append(f'<div class="relation-group"><span class="pred">{pred}:</span>{links}</div>')
        relations_html = f'<div class="relations">{"".join(rel_groups)}</div>' if rel_groups else ""

        body = f"""
<div class="crumbs"><a href="/">Inicio</a> / <a href="/{cat['key']}/">{cat['label']}</a> / {c['label']}</div>
<p class="pill">{cat['icon']} {cat['label']}</p>
<h1>{c['label']}</h1>
<p class="lead">{c['definition']}</p>
<table class="props">
{rows}
</table>
{f'<h2>Relacionado</h2>{relations_html}' if rel_groups else ''}
"""
        jsonld = {
            "@context": "https://schema.org",
            "@type": "DefinedTerm",
            "name": c["label"],
            "alternateName": c["en_label"],
            "description": c["definition"],
            "url": url_for(c),
            "inDefinedTermSet": {"@type": "DefinedTermSet", "name": cat["label"], "url": f"{SITE_URL}/{cat['key']}/"},
            "additionalProperty": [
                {"@type": "PropertyValue", "name": k, "value": (("Sí" if v else "No") if isinstance(v, bool) else v)}
                for k, v in c["properties"].items()
            ],
        }
        html = page_shell(
            title=f"{c['label']} · {SITE_NAME}",
            description=c["definition"][:155],
            canonical=url_for(c),
            body_html=body,
            jsonld_obj=jsonld,
        )
        write_text(DOCS / c["category"] / c["id"] / "index.html", html)


def build_graph_page():
    body = """
<div class="crumbs"><a href="/">Inicio</a> / Grafo</div>
<h1>Grafo de la ontología</h1>
<p class="lead">Cada nodo es un concepto; cada línea, una relación. Arrastra para mover, toca un nodo para ir a su ficha.</p>
<div id="graph-wrap">
  <svg id="graph-svg"></svg>
  <div class="graph-legend" id="graph-legend"></div>
</div>
<script src="/assets/graph.js"></script>
"""
    jsonld = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": f"Grafo de la ontología · {SITE_NAME}",
        "url": f"{SITE_URL}/grafo/",
    }
    html = page_shell(
        title=f"Grafo · {SITE_NAME}",
        description="Vista interactiva del grafo completo de la ontología de microfonía.",
        canonical=f"{SITE_URL}/grafo/",
        body_html=body,
        jsonld_obj=jsonld,
        active_nav="/grafo/",
    )
    write_text(DOCS / "grafo" / "index.html", html)


def _arcade_game_count(decade_key):
    n = sum(1 for g in ARCADE_GAMES if g["decade"] == decade_key)
    return "1 juego" if n == 1 else f"{n} juegos"


def build_arcade_hub():
    cards = "\n".join(
        f"""<a class="cat-card" href="/arcade/decade/{d['key']}/">
              <div class="icon">{d['icon']}</div>
              <h3>{d['label']}</h3>
              <p>{d['desc']}</p>
              <p class="play-tag">{_arcade_game_count(d['key'])} · Entrar →</p>
            </a>"""
        for d in ARCADE_DECADES
    )
    body = f"""
<div class="crumbs"><a href="/">Inicio</a> / Arcade</div>
<p class="pill">🕹️ Radio Micelio</p>
<h1>Arcade</h1>
<p class="lead">
  {len(ARCADE_GAMES)} juegos sencillos y clásicos milenarios (ajedrez, Go), jugables con mando —
  navegación completa por gamepad, IA propia por minimax y comentaristas por reglas, nada generativo.
  Organizados por décadas, tal y como viven en <strong>MCI MIDI Studio</strong>.
</p>
<div class="cat-grid">
{cards}
</div>
"""
    jsonld = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": f"Arcade · {SITE_NAME}",
        "description": "Colección de juegos jugables con mando, parte de Radio Micelio / MCI.",
        "url": f"{SITE_URL}/arcade/",
    }
    html = page_shell(
        title=f"Arcade · {SITE_NAME}",
        description="Arcade de Radio Micelio: juegos clásicos y milenarios jugables con mando.",
        canonical=f"{SITE_URL}/arcade/",
        body_html=body,
        jsonld_obj=jsonld,
    )
    write_text(DOCS / "arcade" / "index.html", html)


def build_arcade_decade_pages():
    for d in ARCADE_DECADES:
        games = [g for g in ARCADE_GAMES if g["decade"] == d["key"]]
        cards = "\n".join(
            f"""<a class="concept-card" href="/arcade/{g['slug']}/">
                  <b>{g['icon']} {g['title']}</b><span>{g['desc']}</span>
                </a>"""
            for g in games
        )
        body = f"""
<div class="crumbs"><a href="/">Inicio</a> / <a href="/arcade/">Arcade</a> / {d['label']}</div>
<p class="pill">{d['icon']} Arcade</p>
<h1>{d['label']}</h1>
<p class="lead">{d['desc']}</p>
<div class="concept-list">
{cards}
</div>
"""
        jsonld = {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "name": f"{d['label']} · Arcade · {SITE_NAME}",
            "description": d["desc"],
            "url": f"{SITE_URL}/arcade/decade/{d['key']}/",
        }
        html = page_shell(
            title=f"{d['label']} · Arcade · {SITE_NAME}",
            description=d["desc"],
            canonical=f"{SITE_URL}/arcade/decade/{d['key']}/",
            body_html=body,
            jsonld_obj=jsonld,
        )
        write_text(DOCS / "arcade" / "decade" / d["key"] / "index.html", html)


def _inject_seo_head(html, *, description, canonical, jsonld_obj):
    """render_game() no lleva metadatos SEO (venía de una app local) — se
    los añadimos aquí sin tocar la plantilla original."""
    jsonld = json.dumps(jsonld_obj, ensure_ascii=False, indent=2)
    extra = (
        f'<link rel="icon" href="{FAVICON_HREF}">\n'
        f'<meta name="description" content="{description}">\n'
        f'<link rel="canonical" href="{canonical}">\n'
        f'<meta property="og:description" content="{description}">\n'
        f'<meta property="og:url" content="{canonical}">\n'
        f'<script type="application/ld+json">\n{jsonld}\n</script>\n'
    )
    return html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n' + extra, 1)


def build_arcade_game_pages():
    for g in ARCADE_GAMES:
        decade = next(d for d in ARCADE_DECADES if d["key"] == g["decade"])
        html = render_game(
            g["title"], g["icon"], g["instructions"], GAME_SCRIPTS[g["slug"]],
            back_href=f"/arcade/decade/{g['decade']}/", back_label=f"← {decade['label']}",
        )
        canonical = f"{SITE_URL}/arcade/{g['slug']}/"
        jsonld = {
            "@context": "https://schema.org",
            "@type": "VideoGame",
            "name": g["title"],
            "description": g["desc"],
            "url": canonical,
            "genre": decade["label"],
            "playMode": "SinglePlayer",
            "applicationCategory": "Game",
            "isAccessibleForFree": True,
            "gamePlatform": "Web browser",
        }
        html = _inject_seo_head(html, description=g["desc"], canonical=canonical, jsonld_obj=jsonld)
        write_text(DOCS / "arcade" / g["slug"] / "index.html", html)


def build_upcoming_pages():
    for o in ONTOLOGY_UPCOMING:
        body = f"""
<div class="crumbs"><a href="/">Inicio</a> / Próximamente / {o['character']}</div>
<p class="pill">Próximamente</p>
<h1>{o['character']}</h1>
<p class="lead">Ontología en preparación: <strong>{o['topic']}</strong>.</p>
<p class="lead">Todavía no hay contenido publicado aquí — vuelve más adelante, o
  explora mientras tanto la ontología ya disponible de <a href="/">Sísmico — Microfonía y otra sensórica</a>.</p>
"""
        jsonld = {
            "@context": "https://schema.org",
            "@type": "WebPage",
            "name": f"{o['character']} — {o['topic']} · {SITE_NAME}",
            "description": f"Ontología en preparación sobre {o['topic']}, personaje {o['character']}.",
            "url": f"{SITE_URL}/proximamente/{o['slug']}/",
        }
        html = page_shell(
            title=f"{o['character']} · Próximamente · {SITE_NAME}",
            description=f"Ontología en preparación sobre {o['topic']}.",
            canonical=f"{SITE_URL}/proximamente/{o['slug']}/",
            body_html=body,
            jsonld_obj=jsonld,
        )
        write_text(DOCS / "proximamente" / o["slug"] / "index.html", html)


# --------------------------------------------------- grafo (nodes/edges)
# Mismo patrón que teatrero_core/_static_export: data.json + config.json
# + manifest.json con hash de integridad.

def build_graph_data():
    cat_color = {"tipos": "#7aa2ff", "patrones": "#69d38b", "estereo": "#f0bf59", "instrumentos": "#ff6b67"}
    nodes = [
        {
            "id": c["id"],
            "label": c["label"],
            "category": c["category"],
            "color": cat_color[c["category"]],
            "url": f"/{c['category']}/{c['id']}/",
        }
        for c in CONCEPTS
    ]
    edges = []
    for c in CONCEPTS:
        for pred, ids in c.get("relations", {}).items():
            for target in ids:
                edges.append({"source": c["id"], "target": target, "relation": pred})

    graph = {"nodes": nodes, "edges": edges}
    summary = {"nodes": len(nodes), "edges": len(edges), "categories": len(CATEGORIES)}
    data = {"graph": graph, "summary": summary, "categories": CATEGORIES}
    config = {
        "id": "microfonia",
        "title": SITE_NAME,
        "tipo": "grafo",
        "data_file": "data.json",
    }

    data_path = write_json(DOCS / "data.json", data)
    config_path = write_json(DOCS / "config.json", config)
    manifest = {
        "project": "microfonia",
        "generated_at": now_iso(),
        "data_sha256": sha256_of(data_path),
        "config_sha256": sha256_of(config_path),
    }
    write_json(DOCS / "manifest.json", manifest)


# ------------------------------------------------- ontología formal SKOS

def build_ontology_jsonld():
    graph = [
        {
            "@id": "mf:MicrofoniaScheme",
            "@type": "skos:ConceptScheme",
            "rdfs:label": "Esquema de microfonía",
            "dcterms:title": SITE_NAME,
        }
    ]
    for cat in CATEGORIES:
        graph.append(
            {
                "@id": f"mf:cat-{cat['key']}",
                "@type": "skos:Collection",
                "skos:prefLabel": {"@language": "es", "@value": cat["label"]},
                "skos:definition": {"@language": "es", "@value": cat["desc"]},
                "skos:inScheme": {"@id": "mf:MicrofoniaScheme"},
            }
        )
    for c in CONCEPTS:
        entry = {
            "@id": f"mf:{c['id']}",
            "@type": "skos:Concept",
            "skos:prefLabel": {"@language": "es", "@value": c["label"]},
            "skos:altLabel": {"@language": "en", "@value": c["en_label"]},
            "skos:definition": {"@language": "es", "@value": c["definition"]},
            "skos:inScheme": {"@id": "mf:MicrofoniaScheme"},
            "skos:member": {"@id": f"mf:cat-{c['category']}"},
            "mf:hasProperty": [
                {"mf:propertyName": k, "mf:propertyValue": (("sí" if v else "no") if isinstance(v, bool) else v)}
                for k, v in c["properties"].items()
            ],
        }
        related = []
        for pred, ids in c.get("relations", {}).items():
            for target in ids:
                related.append({"@id": f"mf:{target}", "mf:relationLabel": pred})
        if related:
            entry["skos:related"] = [{"@id": r["@id"]} for r in related]
            entry["mf:relation"] = related
        graph.append(entry)

    ontology = {
        "@context": {
            "mf": ONTOLOGY_NS,
            "skos": "http://www.w3.org/2004/02/skos/core#",
            "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
            "dcterms": "http://purl.org/dc/terms/",
        },
        "@id": "mf:MicrofoniaOntology",
        "dcterms:title": "Ontología de microfonía",
        "dcterms:license": "https://creativecommons.org/licenses/by/4.0/",
        "dcterms:created": now_iso(),
        "@graph": graph,
    }
    write_json(DOCS / "ontology.jsonld", ontology)


# ------------------------------------------------------------- graph.js

GRAPH_JS = """
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

    // Repulsión ~1/dist^2 entre TODOS los pares (no solo los cercanos) +
    // muelles en las aristas + gravedad suave hacia el centro.
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
"""


def build_404():
    body = """
<div class="hero">
  <div class="hero-img-wrap">
    <picture>
      <source srcset="/assets/img/404.webp" type="image/webp">
      <img class="hero-img" src="/assets/img/404.png" alt="Página no encontrada" width="641" height="700">
    </picture>
  </div>
  <h1>404</h1>
  <p class="hero-sub">Esta página no existe (o todavía no la hemos publicado).</p>
</div>
<div class="hero-actions">
  <a class="btn primary" href="/">Volver al inicio</a>
  <a class="btn ghost" href="/arcade/">Ir al arcade</a>
</div>
"""
    jsonld = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": f"404 · {SITE_NAME}",
        "url": f"{SITE_URL}/404.html",
    }
    html = page_shell(
        title=f"404 · {SITE_NAME}",
        description="Página no encontrada.",
        canonical=f"{SITE_URL}/404.html",
        body_html=body,
        jsonld_obj=jsonld,
    )
    write_text(DOCS / "404.html", html)


def build_sitemap():
    urls = [f"{SITE_URL}/", f"{SITE_URL}/grafo/", f"{SITE_URL}/arcade/"]
    urls += [f"{SITE_URL}/{cat['key']}/" for cat in CATEGORIES]
    urls += [f"{SITE_URL}/{c['category']}/{c['id']}/" for c in CONCEPTS]
    urls += [f"{SITE_URL}/arcade/decade/{d['key']}/" for d in ARCADE_DECADES]
    urls += [f"{SITE_URL}/arcade/{g['slug']}/" for g in ARCADE_GAMES]
    urls += [f"{SITE_URL}/proximamente/{o['slug']}/" for o in ONTOLOGY_UPCOMING]

    today = datetime.now(timezone.utc).date().isoformat()
    entries = "\n".join(
        f"  <url><loc>{u}</loc><lastmod>{today}</lastmod></url>" for u in urls
    )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{entries}\n"
        "</urlset>\n"
    )
    write_text(DOCS / "sitemap.xml", xml)


def build_robots():
    txt = (
        "User-agent: *\n"
        "Allow: /\n"
        f"Sitemap: {SITE_URL}/sitemap.xml\n"
    )
    write_text(DOCS / "robots.txt", txt)


def build():
    if DOCS.exists():
        for p in sorted(DOCS.rglob('*'), reverse=True):
            if p.is_file():
                p.unlink()
        for p in sorted(DOCS.rglob('*'), reverse=True):
            if p.is_dir():
                p.rmdir()
    DOCS.mkdir(parents=True, exist_ok=True)

    write_text(DOCS / "assets" / "style.css", STYLE_CSS)
    write_text(DOCS / "assets" / "graph.js", GRAPH_JS)
    write_text(DOCS / "CNAME", "microfonia.radiomicelio.com\n")

    img_src = ROOT / "assets_src"
    img_dst = DOCS / "assets" / "img"
    img_dst.mkdir(parents=True, exist_ok=True)
    for name in ("sismico.png", "sismico.webp", "404.png", "404.webp"):
        src = img_src / name
        if src.exists():
            (img_dst / name).write_bytes(src.read_bytes())

    build_home()
    build_category_pages()
    build_concept_pages()
    build_graph_page()
    build_arcade_hub()
    build_arcade_decade_pages()
    build_arcade_game_pages()
    build_upcoming_pages()
    build_404()
    build_graph_data()
    build_ontology_jsonld()
    build_sitemap()
    build_robots()

    total_pages = (
        1 + len(CATEGORIES) + len(CONCEPTS) + 1
        + 1 + len(ARCADE_DECADES) + len(ARCADE_GAMES)
        + len(ONTOLOGY_UPCOMING)
    )
    print(f"OK: {total_pages} páginas HTML + data.json + ontology.jsonld generadas en {DOCS}")


if __name__ == "__main__":
    build()
