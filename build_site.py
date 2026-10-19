"""
Genera el sitio estático completo en docs/ (GitHub Pages).

    python3 build_site.py

La banda y el cómic son las dos ramas principales. El contenido editable
vive en content/personajes.json. Se conservan las URLs de recursos y las
antiguas fichas redirigen a las actuales; /id/... identifica entidades JSON-LD.
"""

import hashlib
from html import escape
import json
import re
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

from ontology_data import CATEGORIES, CONCEPTS, concepts_by_id, concepts_by_category
from arcade_data import ARCADE_DECADES, GAMES as ARCADE_GAMES, GAME_SCRIPTS, render_game
from entities import (
    SITE_URL,
    SITE_NAME,
    SITE_DESCRIPTION,
    SCHEMA_CONTEXT,
    NAV_SECTIONS,
    DOMAINS,
    CHARACTERS,
    LAB_SECTIONS,
    GAME_ENTITIES,
    domains_by_id,
    characters_by_id,
    concept_entities_by_id,
    upcoming_characters,
    abs_url,
)

from project_data import BRANCHES, GROUPS, PROFILES, group_profiles
from project_pages import build_project
from project_pages import project_graph

ONTOLOGY_NS = f"{SITE_URL}/ontology#"
ROOT = Path(__file__).parent
DOCS = ROOT / "docs"

FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🍄</text></svg>'
FAVICON_HREF = "data:image/svg+xml," + urllib.parse.quote(FAVICON_SVG)

MICROFONIA = domains_by_id()["microfonia"]
SISMICO = characters_by_id()["sismico"]


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
    return abs_url(f"/{concept['category']}/{concept['id']}/")


def jsonld_dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2).replace("<", "\\u003c")


def with_context(obj):
    """Adjunta @context mixto Schema.org + vocab RM."""
    if isinstance(obj, list):
        return {"@context": SCHEMA_CONTEXT, "@graph": obj}
    out = dict(obj)
    out["@context"] = SCHEMA_CONTEXT
    return out


def crumbs_html(items):
    """items: list of (label, href|None). Last item has href=None."""
    parts = []
    for i, (label, href) in enumerate(items):
        if i:
            parts.append(" › ")
        if href:
            parts.append(f'<a href="{escape(href, quote=True)}">{escape(label)}</a>')
        else:
            parts.append(escape(label))
    return f'<div class="crumbs">{"".join(parts)}</div>'


def crumbs_jsonld(items):
    """BreadcrumbList; hrefs must be absolute or site-relative paths."""
    elements = []
    for i, (label, href) in enumerate(items, start=1):
        item = {"@type": "ListItem", "position": i, "name": label}
        if href:
            item["item"] = abs_url(href)
        elements.append(item)
    return {"@type": "BreadcrumbList", "itemListElement": elements}


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
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  line-height: 1.6;
  overflow-x: hidden;
}
a { color: var(--accent-2); }

.app-shell { display: flex; align-items: flex-start; min-height: 100vh; position: relative; }
.sidebar {
  width: 250px; flex-shrink: 0; background: var(--panel); border-right: 1px solid var(--line);
  position: sticky; top: 0; height: 100vh; overflow-y: auto;
  transition: width .18s ease, margin-left .18s ease;
}
.sidebar.collapsed { width: 0; margin-left: -250px; }
.sidebar-inner { width: 250px; padding: 18px 12px 30px; }
.side-section-label {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted);
  font-weight: 700; padding: 6px 10px 6px;
}
.side-section-label.sub { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 14px; }
.side-onto-list { display: flex; flex-direction: column; gap: 2px; }
.side-onto {
  display: block; padding: 8px 10px; border-radius: 8px; text-decoration: none;
  color: var(--text-2); border: 1px solid transparent;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.side-onto:hover { background: var(--panel-2); }
.side-onto b { display: block; font-size: 12.5px; color: var(--text); font-weight: 650; }
.side-onto span { display: block; font-size: 10.5px; color: var(--muted); margin-top: 1px; }
.side-onto.active-onto { background: rgba(239,43,43,.13); border-color: rgba(239,43,43,.35); }
.side-onto.active-onto b { color: var(--accent-2); }
.side-onto.soon { color: var(--muted); }
.side-onto.soon b { color: var(--muted); font-weight: 550; }
.side-onto.soon span { color: #5a5a5e; }
.side-onto.soon .soon-tag {
  display: inline-block; margin-top: 3px; font-size: 9px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .06em; color: #6e6e74;
  border: 1px solid #3a3a3e; border-radius: 2px; padding: 1px 5px;
}
body.page-lab-focus .side-onto.soon { display: none; }
.sidebar-backdrop { display: none; }
.content-col { flex: 1; min-width: 0; }
.sidebar-toggle {
  font-size: 15px; padding: 6px 10px; background: transparent; border: 1px solid var(--line);
  color: var(--text-2); border-radius: 6px; cursor: pointer;
}

header.site {
  padding: 16px 20px; border-bottom: 1px solid var(--line);
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  position: sticky; top: 0; background: rgba(17,18,20,.92); backdrop-filter: blur(6px); z-index: 10;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
header.site .brand { font-weight: 800; text-decoration: none; color: var(--text); font-size: 15px; letter-spacing: .02em; }
header.site nav { display: flex; gap: 14px; flex-wrap: wrap; font-size: 13.5px; margin-left: auto; }
header.site nav a { color: var(--text-2); text-decoration: none; }
header.site nav a:hover, header.site nav a.active { color: var(--accent-2); }

@media (max-width: 860px) {
  .sidebar { position: fixed; top: 0; left: 0; z-index: 30; box-shadow: 0 0 40px rgba(0,0,0,.5); }
  .sidebar.collapsed { width: 250px; margin-left: -250px; }
  body.sidebar-open .sidebar-backdrop {
    display: block; position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 25;
  }
}

main { max-width: 880px; margin: 0 auto; padding: 28px 18px 60px; }
h1 { font-size: clamp(26px, 5.5vw, 38px); margin: 0 0 8px; font-weight: 700; letter-spacing: -.02em; }
h2 { font-size: 18px; margin: 28px 0 10px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
p.lead { color: var(--text-2); font-size: 15.5px; max-width: 58ch; }
.crumbs {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 12.5px; color: var(--muted); margin-bottom: 14px;
}
.crumbs a { color: var(--muted); text-decoration: none; }
.crumbs a:hover { color: var(--accent-2); }

.hub-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 22px; }
.hub-card {
  display: block; background: linear-gradient(160deg, #1a1214 0%, var(--panel) 55%);
  border: 1px solid var(--line); border-radius: 4px; padding: 18px 16px;
  text-decoration: none; color: inherit; transition: border-color .15s, transform .15s;
}
.hub-card:hover { border-color: rgba(239,43,43,.45); transform: translateY(-2px); }
.hub-card .hub-kicker {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: var(--accent-2); font-weight: 700;
}
.hub-card h3 { margin: 8px 0 6px; font-size: 18px; color: var(--text); }
.hub-card p { margin: 0; font-size: 13px; color: var(--muted); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }

.cat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; margin-top: 18px; }
.cat-card {
  display: block; background: var(--panel); border: 1px solid var(--line); border-radius: 4px;
  padding: 16px; text-decoration: none; color: inherit; transition: border-color .15s, transform .15s;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.cat-card:hover { border-color: #454a54; transform: translateY(-2px); }
.cat-card .icon { font-size: 24px; }
.cat-card h3 { margin: 8px 0 4px; font-size: 15px; color: var(--text); }
.cat-card p { margin: 0; font-size: 12.5px; color: var(--muted); }
.cat-card.soon { opacity: .55; }
.char-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin-top: 18px; }
.char-card {
  display: block; background: var(--panel); border: 1px solid var(--line); border-radius: 4px;
  padding: 16px 12px; text-decoration: none; color: inherit; text-align: center;
  transition: border-color .15s, transform .15s;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.char-card:hover { border-color: #454a54; transform: translateY(-2px); }
.char-img-wrap { width: 74px; height: 74px; margin: 0 auto 10px; display: flex; align-items: center; justify-content: center; }
.char-img { width: 100%; height: auto; display: block; filter: url(#sismico-wave) drop-shadow(0 0 18px rgba(239,43,43,.18)); animation: hero-breathe 7s ease-in-out infinite; }
.char-placeholder { width: 100%; height: 100%; border-radius: 50%; background: var(--panel-2); border: 1px dashed var(--line); display: flex; align-items: center; justify-content: center; font-size: 26px; opacity: .6; }
.char-card h3 { margin: 0 0 2px; font-size: 13.5px; color: var(--text); }
.char-card p { margin: 0; font-size: 11px; color: var(--muted); }
.char-card.soon { opacity: .6; }
.char-card.soon:hover { opacity: .9; }
.char-card.soon h3::after { content: " · pronto"; font-size: 9px; color: var(--muted); font-weight: 400; text-transform: uppercase; letter-spacing: .04em; }
.concept-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-top: 14px; }
.concept-card {
  display: block; background: var(--panel); border: 1px solid var(--line); border-radius: 4px;
  padding: 12px 14px; text-decoration: none; color: inherit; font-size: 13.5px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.concept-card:hover { border-color: #454a54; }
.concept-card.soon { opacity: .55; }
.concept-card b { display: block; color: var(--text); font-size: 14px; margin-bottom: 2px; }
.concept-card span { color: var(--muted); font-size: 12px; }
table.props { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13.5px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
table.props th, table.props td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); }
table.props th { color: var(--muted); font-weight: 600; width: 40%; }
.relations { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.relation-group { font-size: 13.5px; }
.relation-group .pred { color: var(--muted); margin-right: 6px; }
.relation-group a { margin-right: 10px; }
.pill {
  display: inline-block; font-size: 11px; color: var(--muted); border: 1px solid var(--line);
  border-radius: 2px; padding: 2px 9px; margin-bottom: 8px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
footer.site {
  max-width: 880px; margin: 0 auto; padding: 20px 18px 50px; color: var(--muted); font-size: 12px;
  border-top: 1px solid var(--line);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
footer.site a { color: var(--muted); }

.home-hero {
  padding: 36px 0 10px;
  background:
    radial-gradient(ellipse 80% 60% at 20% 0%, rgba(239,43,43,.14), transparent 55%),
    radial-gradient(ellipse 60% 50% at 90% 30%, rgba(80,40,40,.25), transparent 50%);
  margin: -28px -18px 0; padding-left: 18px; padding-right: 18px; padding-bottom: 8px;
}
.home-brand {
  font-size: clamp(34px, 8vw, 56px); margin: 0 0 10px; font-weight: 800;
  letter-spacing: -.03em; line-height: 1.05;
}
.home-tagline { color: var(--text-2); font-size: clamp(15px, 2.8vw, 18px); max-width: 36ch; margin: 0 0 8px; }
.home-sub { color: var(--muted); font-size: 13.5px; max-width: 48ch; margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }

.hero { text-align: center; padding: 18px 0 6px; }
.hero-img-wrap { width: min(280px, 60vw); margin: 0 auto; position: relative; }
.hero-img {
  width: 100%; height: auto; display: block; filter: url(#sismico-wave) drop-shadow(0 0 40px rgba(239,43,43,.18));
  animation: hero-breathe 7s ease-in-out infinite;
}
@keyframes hero-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.015); }
}
.hero-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
.btn {
  display: inline-block; padding: 9px 16px; border-radius: 2px; text-decoration: none;
  font-size: 13.5px; font-weight: 600; border: 1px solid var(--line);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); font-weight: 700; }
.btn.ghost { color: var(--text-2); }
.split-block {
  display: grid; gap: 18px; margin-top: 20px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
@media (min-width: 700px) { .split-block.two { grid-template-columns: 1fr 1fr; } }
.split-panel { background: var(--panel); border: 1px solid var(--line); border-radius: 4px; padding: 16px; }
.split-panel h3 { margin: 0 0 8px; font-size: 14px; }
.split-panel p { margin: 0; font-size: 13px; color: var(--text-2); }

#graph-wrap { background: var(--panel); border: 1px solid var(--line); border-radius: 4px; overflow: hidden; margin-top: 16px; }
#graph-svg { width: 100%; height: 70vh; min-height: 420px; display: block; touch-action: pan-x pan-y; }
.graph-legend { display: flex; gap: 14px; flex-wrap: wrap; padding: 10px 14px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.graph-legend .sw { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 5px; }
table.props th, table.props td { word-break: break-word; }
@media (max-width: 560px) {
  header.site { flex-direction: column; align-items: flex-start; gap: 8px; }
  header.site nav { margin-left: 0; width: 100%; justify-content: flex-start; }
}

/* Featured lab strip (home + /lab/) */
.feature-strip {
  margin-top: 22px;
  padding: 20px 18px;
  border: 1px solid rgba(239,43,43,.35);
  border-radius: 6px;
  background:
    radial-gradient(ellipse 70% 80% at 0% 50%, rgba(239,43,43,.16), transparent 55%),
    linear-gradient(145deg, #1a1214 0%, var(--panel) 60%);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.feature-strip .feature-kicker {
  font-size: 11px; text-transform: uppercase; letter-spacing: .1em;
  color: var(--accent-2); font-weight: 700; margin: 0 0 6px;
}
.feature-strip h2 {
  margin: 0 0 8px; font-size: clamp(22px, 4vw, 28px);
  font-family: "Iowan Old Style", Palatino, Georgia, serif; letter-spacing: -.02em;
}
.feature-strip p { margin: 0 0 14px; color: var(--text-2); font-size: 14px; max-width: 52ch; }
.feature-strip .hero-actions { margin-top: 0; }

/* Wide play surfaces inside the shared shell (GH Pages MPA) */
body.page-lab-focus main {
  max-width: 1280px;
  padding-top: 14px;
  padding-bottom: 40px;
}
body.page-lab-focus footer.site { max-width: 1280px; }
body.page-lab-focus .lab-crumbs {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 12px; color: var(--muted); margin-bottom: 10px;
}
body.page-lab-focus .lab-crumbs a { color: var(--muted); text-decoration: none; }
body.page-lab-focus .lab-crumbs a:hover { color: var(--accent-2); }
"""

APP_JS = r"""
(function () {
  var sidebar = document.getElementById("sidebar");
  var toggle = document.getElementById("sidebar-toggle");
  var backdrop = document.getElementById("sidebar-backdrop");
  if (!sidebar || !toggle) return;

  var isMobile = function () {
    return window.matchMedia("(max-width: 860px)").matches;
  };

  function apply(collapsed) {
    sidebar.classList.toggle("collapsed", collapsed);
    sidebar.inert = collapsed;
    toggle.setAttribute("aria-expanded", String(!collapsed));
    document.body.classList.toggle("sidebar-open", !collapsed && isMobile());
  }

  var preferCollapsed =
    document.body.classList.contains("page-lab-focus") ||
    document.body.getAttribute("data-sidebar") === "collapsed";

  var saved = null;
  try {
    saved = localStorage.getItem("rm-sidebar-collapsed");
  } catch (e) {}

  if (isMobile()) {
    apply(true);
  } else if (preferCollapsed && saved === null) {
    apply(true);
  } else {
    apply(saved === "1");
  }

  toggle.addEventListener("click", function () {
    var collapsed = !sidebar.classList.contains("collapsed");
    apply(collapsed);
    if (!isMobile()) {
      try {
        localStorage.setItem("rm-sidebar-collapsed", collapsed ? "1" : "0");
      } catch (e) {}
    }
  });

  if (backdrop) {
    backdrop.addEventListener("click", function () {
      apply(true);
    });
  }
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !sidebar.classList.contains("collapsed")) {
      apply(true);
      toggle.focus();
    }
  });
  window.matchMedia("(max-width: 860px)").addEventListener("change", function () {
    apply(isMobile() || sidebar.classList.contains("collapsed"));
  });
})();
"""


def build_sidebar_html(active_section=None, active_path=None):
    sections = []
    for branch, info in BRANCHES.items():
        active = ' active-onto' if active_section == branch else ''
        current = ' aria-current="page"' if active_path == info['url'] else ''
        content = f'<a class="side-onto branch-nav{active}" href="{info["url"]}"{current}><b>{info["label"]}</b></a>'
        for key, group in GROUPS.items():
            if group['branch'] != branch:
                continue
            in_group = any(active_path in (p['url'], p['ontology']) for p in group_profiles(key))
            opened = ' open' if active_path and (active_path.startswith(group['url']) or in_group) else ''
            content += f'<details class="side-group"{opened}><summary>{group["label"]}</summary><nav aria-label="{group["label"]}">'
            content += f'<a class="side-person group-index" href="{group["url"]}">Ver todos →</a>'
            for profile in group_profiles(key):
                on = active_path == profile['url'] or active_path == profile['ontology']
                current = ' aria-current="page"' if on else ''
                content += f'<a class="side-person{" active-onto" if on else ""}" href="{profile["url"]}"{current}>{escape(profile["nombre"])}</a>'
            content += '</nav></details>'
        sections.append(content)
    return f'''<aside class="sidebar" id="sidebar"><div class="sidebar-inner">
      <a class="side-home" href="/">RADIO MICELIO <span>Inicio ↗</span></a>
      <div class="side-section-label">El proyecto</div>{"".join(sections)}
      <details class="side-resources"{" open" if active_section in ("wiki", "lab", "tecnologia") else ""}><summary>Otros espacios</summary>
        <nav aria-label="Otros espacios"><a class="side-person" href="/tecnologia/it/">Tecnología</a>
        <a class="side-person" href="/atlas/">Wiki musical</a>
        <a class="side-person" href="/lab/">Laboratorio</a><a class="side-person" href="/chess-lab/">Chess Lab</a>
        <a class="side-person" href="/story-lab/">Story Lab</a><a class="side-person" href="/arcade/">Arcade</a>
        <a class="side-person" href="/escena/">Escena</a><a class="side-person" href="/productora/">Productora</a></nav>
      </details><a class="side-ontology" href="/ontologia/">Ontología del proyecto ↗</a>
    </div></aside>'''


def page_shell(
    *,
    title,
    description,
    canonical,
    body_html,
    jsonld_obj,
    active_nav=None,
    active_section=None,
    active_path=None,
    body_class="",
    extra_head="",
):
    jsonld = jsonld_dumps(jsonld_obj)
    title, description = escape(title, quote=True), escape(description, quote=True)
    nav_html = "".join(
        f'<a href="{s["href"]}" class="{"active" if s["href"] == active_nav else ""}">{s["label"]}</a>'
        for s in NAV_SECTIONS
    )
    sidebar_html = build_sidebar_html(active_section, active_path=active_path)
    body_attr = f' class="{body_class.strip()}"' if body_class else ""
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
{extra_head}
<script type="application/ld+json">
{jsonld}
</script>
</head>
<body{body_attr}>
<div class="app-shell">
{sidebar_html}
  <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
  <div class="content-col">
    <header class="site">
      <button class="sidebar-toggle" id="sidebar-toggle" aria-label="Mostrar/ocultar menú" aria-controls="sidebar" aria-expanded="true">☰</button>
      <a class="brand" href="/">Radio Micelio</a>
      <nav>{nav_html}</nav>
    </header>
    <main>
{body_html}
    </main>
    <footer class="site">
      <a href="https://www.radiomicelio.es">Radio Micelio</a> ·
      La banda y el cómic ·
      Contenido bajo CC BY 4.0 ·
      <a href="/ontologia/">Ontología del proyecto</a>
      · <a href="/editor/">Editor</a>
      <p id="persistence-note">Edición en esta web: los cambios no se guardan en el sitio publicado.</p>
    </footer>
  </div>
</div>
<script src="/assets/app.js" defer></script>
<script src="/assets/persistence.js" defer></script>
</body>
</html>
"""


# ------------------------------------------------------------------ pages

def build_atlas_hub():
    cards = []
    for d in DOMAINS:
        if d["status"] == "published":
            cards.append(
                f"""<a class="cat-card" href="{d['current_url']}">
              <div class="icon">{d['icon']}</div>
              <h3>{d['label']}</h3>
              <p>{d['short']}</p>
            </a>"""
            )
        else:
            cards.append(
                f"""<div class="cat-card soon">
              <div class="icon">{d['icon']}</div>
              <h3>{d['label']}</h3>
              <p>{d['short']} · en preparación</p>
            </div>"""
            )
    crumbs = [("Radio Micelio", "/"), ("Wiki", None)]
    body = f"""
{crumbs_html(crumbs)}
<p class="pill">Atlas · conocimiento</p>
<h1>Wiki musical</h1>
<p class="lead">
  Ontologías abiertas del universo Radio Micelio. Empieza por lo publicado;
  el resto irá creciendo alrededor de cada personaje y de la escena.
</p>
<div class="cat-grid">
{"".join(cards)}
</div>
"""
    jsonld = with_context(
        {
            "@type": "CollectionPage",
            "@id": f"{SITE_URL}/atlas/#page",
            "name": "Wiki · Radio Micelio",
            "description": "Atlas de conocimiento: ontologías abiertas del universo Radio Micelio.",
            "url": f"{SITE_URL}/atlas/",
            "isPartOf": {"@id": f"{SITE_URL}/#website"},
            "breadcrumb": crumbs_jsonld(crumbs),
        }
    )
    html = page_shell(
        title=f"Wiki · {SITE_NAME}",
        description="Atlas de conocimiento: wiki musical de Radio Micelio.",
        canonical=f"{SITE_URL}/atlas/",
        body_html=body,
        jsonld_obj=jsonld,
        active_nav="/atlas/",
        active_section="wiki",
    )
    write_text(DOCS / "atlas" / "index.html", html)


def build_microfonia_landing():
    cat_cards = "\n".join(
        f"""<a class="cat-card" href="/{c['key']}/">
              <div class="icon">{c['icon']}</div>
              <h3>{c['label']}</h3>
              <p>{c['desc']}</p>
            </a>"""
        for c in CATEGORIES
    )
    crumbs = [("Radio Micelio", "/"), ("Wiki", "/atlas/"), ("Microfonía", None)]
    body = f"""
{crumbs_html(crumbs)}
<p class="pill">DefinedTermSet · {len(CONCEPTS)} conceptos</p>
<h1>Microfonía</h1>
<p class="lead">{MICROFONIA['description']}</p>
<div class="hero-actions">
  <a class="btn primary" href="{SISMICO['current_url']}">Conocer a Sísmico →</a>
  <a class="btn ghost" href="/grafo/">Explorar el grafo</a>
  <a class="btn ghost" href="/ontology.jsonld">Descargar JSON-LD</a>
</div>
<h2>Categorías</h2>
<div class="cat-grid">
{cat_cards}
</div>
"""
    term_refs = [
        {"@id": concept_entities_by_id()[c["id"]]["entity_id"]}
        for c in CONCEPTS
    ]
    jsonld = with_context(
        [
            {
                "@type": "DefinedTermSet",
                "@id": MICROFONIA["entity_id"],
                "name": "Microfonía",
                "description": MICROFONIA["description"],
                "url": abs_url(MICROFONIA["current_url"]),
                "hasDefinedTerm": term_refs,
                "rm:associatedCharacter": {"@id": SISMICO["entity_id"]},
            },
            crumbs_jsonld(crumbs),
        ]
    )
    html = page_shell(
        title=f"Microfonía | Wiki · {SITE_NAME}",
        description=MICROFONIA["description"],
        canonical=abs_url(MICROFONIA["canonical_url"]),
        body_html=body,
        jsonld_obj=jsonld,
        active_nav="/atlas/",
        active_section="wiki",
    )
    write_text(DOCS / "atlas" / "microfonia" / "index.html", html)


def build_escena_hub():
    crumbs = [("Radio Micelio", "/"), ("Escena", None)]
    body = f"""
{crumbs_html(crumbs)}
<p class="pill">Cultura real</p>
<h1>Escena</h1>
<p class="lead">
  Bandas, conciertos, salas, entrevistas, reviews y lanzamientos.
  Empezaremos cerca: nuestra música, la gente con la que compartimos escena
  y las bandas locales que merece la pena conocer.
</p>
<p class="lead">
  Cuando publiquemos la primera banda, concierto o entrevista, aparecerán aquí
  como páginas propias — conectadas entre sí y con la wiki.
</p>
<p class="pill">Próximamente: bandas · conciertos · salas · entrevistas · reviews · lanzamientos</p>
<div class="hero-actions">
  <a class="btn ghost" href="/atlas/">Ir a la Wiki →</a>
</div>
"""
    jsonld = with_context(
        {
            "@type": "CollectionPage",
            "name": f"Escena · {SITE_NAME}",
            "description": "Escena cultural de Radio Micelio: bandas, conciertos, entrevistas y reviews.",
            "url": f"{SITE_URL}/escena/",
            "breadcrumb": crumbs_jsonld(crumbs),
        }
    )
    html = page_shell(
        title=f"Escena · {SITE_NAME}",
        description="Escena cultural: bandas, conciertos, salas, entrevistas y reviews.",
        canonical=f"{SITE_URL}/escena/",
        body_html=body,
        jsonld_obj=jsonld,
        active_nav="/escena/",
    )
    write_text(DOCS / "escena" / "index.html", html)


def build_productora_hub():
    cards = []
    for c in CHARACTERS:
        if not c.get("producer_role"):
            continue
        soon = " soon" if c["status"] != "published" else ""
        cards.append(
            f"""<a class="concept-card{soon}" href="{c['current_url']}">
              <b>{c['label']}</b><span>{c['producer_role']}</span>
            </a>"""
        )
    crumbs = [("Radio Micelio", "/"), ("Productora", None)]
    body = f"""
{crumbs_html(crumbs)}
<p class="pill">Productora cultural</p>
<h1>Productora</h1>
<p class="lead">
  Radio Micelio es también una productora cultural formada por profesionales
  de distintas disciplinas. Sus alter ego del universo son la interfaz pública —
  sin fingir que ficción y realidad son lo mismo.
</p>
<div class="split-block two">
  <div class="split-panel">
    <h3>En la productora</h3>
    <p>Producción musical, fotografía de directo, comunicación, técnica de escenario y más. Portfolios y trabajos irán apareciendo aquí.</p>
  </div>
  <div class="split-panel">
    <h3>En el universo</h3>
    <p>Los mismos nombres existen como personajes ficticios con historias, poderes y campos de investigación propios.</p>
  </div>
</div>
<h2>Alter ego</h2>
<div class="concept-list">
{"".join(cards)}
</div>
"""
    jsonld = with_context(
        {
            "@type": "Organization",
            "@id": f"{SITE_URL}/#organization",
            "name": SITE_NAME,
            "url": f"{SITE_URL}/productora/",
            "description": "Productora cultural Radio Micelio.",
            "breadcrumb": crumbs_jsonld(crumbs),
        }
    )
    html = page_shell(
        title=f"Productora · {SITE_NAME}",
        description="Productora cultural Radio Micelio: profesionales a través de sus alter ego.",
        canonical=f"{SITE_URL}/productora/",
        body_html=body,
        jsonld_obj=jsonld,
        active_nav="/productora/",
    )
    write_text(DOCS / "productora" / "index.html", html)


def build_lab_hub():
    cards = []
    for s in LAB_SECTIONS:
        if s["id"] == "chess-lab":
            continue  # featured above the grid
        if s["status"] == "published" and s["current_url"]:
            cards.append(
                f"""<a class="cat-card" href="{s['current_url']}">
              <div class="icon">{s['icon']}</div>
              <h3>{s['label']}</h3>
              <p>{s['short']}</p>
            </a>"""
            )
        else:
            cards.append(
                f"""<div class="cat-card soon">
              <div class="icon">{s['icon']}</div>
              <h3>{s['label']}</h3>
              <p>{s['short']} · en preparación</p>
            </div>"""
            )
    crumbs = [("Radio Micelio", "/"), ("Lab", None)]
    body = f"""
{crumbs_html(crumbs)}
<p class="pill">I+D · videojuego RM</p>
<h1>Laboratorio</h1>
<p class="lead">
  Cuaderno de laboratorio del videojuego Radio Micelio. Chess Lab es el experimento
  principal ahora; Arcade y AIRAM lo rodean. Lo que se prueba aquí alimenta el juego.
</p>
<aside class="feature-strip" aria-label="Chess Lab">
  <div class="feature-kicker">Destacado · H−2</div>
  <h2>Chess Lab</h2>
  <p>
    GameFrame → GameState con siete variables expresivas, modos de juego claros
    y revisión humana. Sin música todavía — solo semántica del juego.
  </p>
  <div class="hero-actions">
    <a class="btn primary" href="/chess-lab/">Jugar en Chess Lab →</a>
    <a class="btn ghost" href="/lab/airam/">Leer docs AIRAM</a>
  </div>
</aside>
<div class="cat-grid">
{"".join(cards)}
</div>
"""
    jsonld = with_context(
        {
            "@type": "CollectionPage",
            "name": f"Laboratorio · {SITE_NAME}",
            "url": f"{SITE_URL}/lab/",
            "description": "Laboratorio de Radio Micelio: Chess Lab, Arcade, AIRAM, criaturas y RM Game.",
            "breadcrumb": crumbs_jsonld(crumbs),
        }
    )
    html = page_shell(
        title=f"Lab · {SITE_NAME}",
        description="Laboratorio: Chess Lab, Arcade, AIRAM y prototipos del videojuego Radio Micelio.",
        canonical=f"{SITE_URL}/lab/",
        body_html=body,
        jsonld_obj=jsonld,
        active_nav="/lab/",
        active_section="lab",
        active_path="/lab/",
    )
    write_text(DOCS / "lab" / "index.html", html)


def copy_airam_lab_assets():
    src_dir = ROOT / "airam_lab"
    dst = DOCS / "assets" / "airam"
    dst.mkdir(parents=True, exist_ok=True)
    for name in (
        "schemas.js",
        "store.js",
        "ruleset_v0_1.js",
        "musical_map_v0_1.js",
        "chord_voice.js",
        "piano_engine.js",
        "affect_lexicon.js",
        "narrative.js",
        "chess_core.js",
        "horizon_engine.js",
        "character_profiles.js",
        "score_planner.js",
        "harmonic_world.js",
        "musical_horizon.js",
        "character_voices.js",
        "character_commenter.js",
        "dataset_rankings.js",
        "chess_adapter.js",
        "chess_pieces.js",
        "chess_lab.js",
        "chess_lab.css",
        "go_core.js",
        "go_adapter.js",
        "story_mode.js",
        "story_lab.js",
        "story_lab.css",
    ):
        src = src_dir / name
        if src.exists():
            (dst / name).write_text(src.read_text(encoding="utf-8"), encoding="utf-8")


def build_airam_docs():
    """AIRAM pipeline docs through H8."""
    crumbs = [("Radio Micelio", "/"), ("Lab", "/lab/"), ("AIRAM", None)]
    body = f"""
{crumbs_html(crumbs)}
<p class="pill">AIRAM Music · H8</p>
<h1>AIRAM</h1>
<p class="lead">
  Núcleo completo hasta Story Mode: juego (ajedrez/go) → semántica → música →
  personaje → datasets → mundo narrativo.
</p>
<div class="hero-actions">
  <a class="btn primary" href="/chess-lab/">Chess Lab →</a>
  <a class="btn ghost" href="/story-lab/">Story Lab →</a>
</div>

<h2>Pipeline</h2>
<pre style="background:#141416;padding:12px;border-radius:4px;overflow:auto;font-size:13px">GameAdapter (chess | go)
  → GameFrame → GameState → CausalTrace ∥ MusicalState
  → Score + Horizonte + Mundo Alfa/Beta
  → CharacterCommenter · Datasets H6
  → Story: WorldState · CharacterState · PerspectiveHandoff</pre>

<h2>H7 — Go</h2>
<p class="lead">
  Go 9×9 lite → mismos <code>GameFrame</code>/<code>GameState</code>.
  Capturas por libertades; score territorial aproximado.
</p>

<h2>H8 — Story Mode</h2>
<p class="lead">
  Pack <code>micelio-v0.1</code>: selector de perspectiva, escenas, encuentros,
  <strong>PerspectiveHandoff</strong> (WorldState persiste; CharacterState cambia).
  Mapa MapLibre/H3 = deuda futura.
</p>

<h2>Deuda</h2>
<ul>
  <li>Stockfish WASM · en passant · Go ko completo</li>
  <li>Mapa OSM/H3 · StoryPacks ricos · RM Game shell</li>
</ul>
"""
    jsonld = with_context(
        {
            "@type": "WebPage",
            "name": f"AIRAM · Lab · {SITE_NAME}",
            "description": "AIRAM Music H8: Go + Story Mode.",
            "url": f"{SITE_URL}/lab/airam/",
            "breadcrumb": crumbs_jsonld(crumbs),
        }
    )
    html = page_shell(
        title=f"AIRAM · Lab · {SITE_NAME}",
        description="AIRAM Music H7–H8: Go lite + Story Mode + PerspectiveHandoff.",
        canonical=f"{SITE_URL}/lab/airam/",
        body_html=body,
        jsonld_obj=jsonld,
        active_nav="/lab/",
        active_section="lab",
        active_path="/lab/airam/",
    )
    write_text(DOCS / "lab" / "airam" / "index.html", html)


def build_story_lab():
    crumbs = [
        ("Radio Micelio", "/"),
        ("Lab", "/lab/"),
        ("Story Lab", None),
    ]
    scripts = "\n".join(
        [
            '<script src="https://cdn.jsdelivr.net/npm/soundfont-player@0.12.0/dist/soundfont-player.min.js" crossorigin></script>',
        ]
        + [
            f'<script src="/assets/airam/{name}"></script>'
            for name in (
                "schemas.js",
                "ruleset_v0_1.js",
                "musical_map_v0_1.js",
                "chord_voice.js",
                "piano_engine.js",
                "affect_lexicon.js",
                "character_profiles.js",
                "score_planner.js",
                "harmonic_world.js",
                "character_voices.js",
                "character_commenter.js",
                "go_core.js",
                "go_adapter.js",
                "story_mode.js",
                "story_lab.js",
            )
        ]
    )
    body = f"""
<div class="lab-crumbs"><a href="/">Radio Micelio</a> › <a href="/lab/">Lab</a> › Story Lab · <a href="/lab/airam/">docs AIRAM</a> · <a href="/chess-lab/">Chess Lab</a></div>
<link rel="stylesheet" href="/assets/airam/story_lab.css">
<div id="airam-story-lab"></div>
{scripts}
"""
    jsonld = with_context(
        {
            "@type": "WebApplication",
            "name": f"AIRAM Story Lab · {SITE_NAME}",
            "description": "H7–H8: Go + Story Mode + PerspectiveHandoff.",
            "url": f"{SITE_URL}/story-lab/",
            "applicationCategory": "GameApplication",
            "breadcrumb": crumbs_jsonld(crumbs),
            "isPartOf": {"@id": f"{SITE_URL}/lab/"},
        }
    )
    html = page_shell(
        title=f"Story Lab · AIRAM · {SITE_NAME}",
        description="Story Lab H8: personajes, capítulos, go y PerspectiveHandoff.",
        canonical=f"{SITE_URL}/story-lab/",
        body_html=body,
        jsonld_obj=jsonld,
        active_nav="/lab/",
        active_section="lab",
        active_path="/story-lab/",
        body_class="page-lab-focus",
    )
    write_text(DOCS / "story-lab" / "index.html", html)


def build_chess_lab():
    crumbs = [
        ("Radio Micelio", "/"),
        ("Lab", "/lab/"),
        ("Chess Lab", None),
    ]
    scripts = "\n".join(
        [
            '<script src="https://cdn.jsdelivr.net/npm/soundfont-player@0.12.0/dist/soundfont-player.min.js" crossorigin></script>',
        ]
        + [
            f'<script src="/assets/airam/{name}"></script>'
            for name in (
                "schemas.js",
                "store.js",
                "ruleset_v0_1.js",
                "musical_map_v0_1.js",
                "chord_voice.js",
                "piano_engine.js",
                "affect_lexicon.js",
                "narrative.js",
                "chess_core.js",
                "horizon_engine.js",
                "character_profiles.js",
                "score_planner.js",
                "harmonic_world.js",
                "musical_horizon.js",
                "character_voices.js",
                "character_commenter.js",
                "dataset_rankings.js",
                "chess_adapter.js",
                "chess_pieces.js",
                "chess_lab.js",
            )
        ]
    )
    body = f"""
<div class="lab-crumbs"><a href="/">Radio Micelio</a> › <a href="/lab/">Lab</a> › Chess Lab · <a href="/lab/airam/">docs AIRAM</a> · <a href="/story-lab/">Story Lab</a></div>
<link rel="stylesheet" href="/assets/airam/chess_lab.css">
<div id="airam-chess-lab"></div>
{scripts}
"""
    jsonld = with_context(
        {
            "@id": f"{SITE_URL}/chess-lab/#game",
            "@type": ["VideoGame", "WebApplication"],
            "exampleOfWork": {"@id": f"{SITE_URL}/id/game/chess"},
            "name": f"AIRAM Chess Lab · {SITE_NAME}",
            "description": "Laboratorio H−2 de semántica del juego sobre ajedrez.",
            "url": f"{SITE_URL}/chess-lab/",
            "applicationCategory": "GameApplication",
            "breadcrumb": crumbs_jsonld(crumbs),
            "isPartOf": {"@id": f"{SITE_URL}/lab/"},
        }
    )
    html = page_shell(
        title=f"Chess Lab · AIRAM · {SITE_NAME}",
        description="Chess Lab: siete variables expresivas, score, personajes, datasets.",
        canonical=f"{SITE_URL}/chess-lab/",
        body_html=body,
        jsonld_obj=jsonld,
        active_nav="/lab/",
        active_section="lab",
        active_path="/chess-lab/",
        body_class="page-lab-focus",
    )
    write_text(DOCS / "chess-lab" / "index.html", html)


def build_category_pages():
    for cat in CATEGORIES:
        items = concepts_by_category(cat["key"])
        cards = "\n".join(
            f"""<a class="concept-card" href="/{c['category']}/{c['id']}/">
                  <b>{c['label']}</b><span>{c['en_label']}</span>
                </a>"""
            for c in items
        )
        crumbs = [
            ("Radio Micelio", "/"),
            ("Wiki", "/atlas/"),
            ("Microfonía", "/atlas/microfonia/"),
            (cat["label"], None),
        ]
        body = f"""
{crumbs_html(crumbs)}
<p class="pill">{cat['icon']} Microfonía</p>
<h1>{cat['label']}</h1>
<p class="lead">{cat['desc']}</p>
<div class="concept-list">
{cards}
</div>
"""
        jsonld = with_context(
            {
                "@type": "CollectionPage",
                "name": f"{cat['label']} | Wiki · {SITE_NAME}",
                "description": cat["desc"],
                "url": f"{SITE_URL}/{cat['key']}/",
                "isPartOf": {"@id": MICROFONIA["entity_id"]},
                "breadcrumb": crumbs_jsonld(crumbs),
            }
        )
        html = page_shell(
            title=f"{cat['label']} | Wiki · {SITE_NAME}",
            description=cat["desc"],
            canonical=f"{SITE_URL}/{cat['key']}/",
            body_html=body,
            jsonld_obj=jsonld,
            active_nav="/atlas/",
            active_section="wiki",
        )
        write_text(DOCS / cat["key"] / "index.html", html)


def build_concept_pages():
    by_id = concepts_by_id()
    ent_by_id = concept_entities_by_id()
    for c in CONCEPTS:
        cat = category_of(c["category"])
        ent = ent_by_id[c["id"]]
        rows = "\n".join(
            f"<tr><th>{k}</th><td>{v if not isinstance(v, bool) else ('Sí' if v else 'No')}</td></tr>"
            for k, v in c["properties"].items()
        )
        rel_groups = []
        for pred, ids in c.get("relations", {}).items():
            links = " ".join(
                f'<a href="/{by_id[i]["category"]}/{i}/">{by_id[i]["label"]}</a>'
                for i in ids if i in by_id
            )
            if links:
                rel_groups.append(f'<div class="relation-group"><span class="pred">{pred}:</span>{links}</div>')
        relations_html = f'<div class="relations">{"".join(rel_groups)}</div>' if rel_groups else ""

        crumbs = [
            ("Radio Micelio", "/"),
            ("Wiki", "/atlas/"),
            ("Microfonía", "/atlas/microfonia/"),
            (cat["label"], f"/{cat['key']}/"),
            (c["label"], None),
        ]
        body = f"""
{crumbs_html(crumbs)}
<p class="pill">{cat['icon']} {cat['label']}</p>
<h1>{c['label']}</h1>
<p class="lead">{c['definition']}</p>
<table class="props">
{rows}
</table>
{f'<h2>Relacionado</h2>{relations_html}' if rel_groups else ''}
<p class="lead" style="margin-top:24px"><a href="{SISMICO['current_url']}">← Sísmico</a> · <a href="/atlas/microfonia/">Microfonía</a></p>
"""
        jsonld = with_context(
            [
                {
                    "@type": "DefinedTerm",
                    "@id": ent["entity_id"],
                    "name": c["label"],
                    "alternateName": c["en_label"],
                    "description": c["definition"],
                    "url": abs_url(ent["canonical_url"]),
                    "inDefinedTermSet": {"@id": MICROFONIA["entity_id"]},
                    "additionalProperty": [
                        {
                            "@type": "PropertyValue",
                            "name": k,
                            "value": (("Sí" if v else "No") if isinstance(v, bool) else v),
                        }
                        for k, v in c["properties"].items()
                    ],
                },
                crumbs_jsonld(crumbs),
            ]
        )
        html = page_shell(
            title=f"{c['label']} | Wiki · {SITE_NAME}",
            description=c["definition"][:155],
            canonical=abs_url(ent["canonical_url"]),
            body_html=body,
            jsonld_obj=jsonld,
            active_nav="/atlas/",
            active_section="wiki",
        )
        write_text(DOCS / c["category"] / c["id"] / "index.html", html)


def build_graph_page():
    crumbs = [
        ("Radio Micelio", "/"),
        ("Wiki", "/atlas/"),
        ("Microfonía", "/atlas/microfonia/"),
        ("Grafo", None),
    ]
    body = f"""
{crumbs_html(crumbs)}
<h1>Grafo · Microfonía</h1>
<p class="lead">Grafo local del dominio Microfonía. Cada nodo es un concepto; cada línea, una relación.</p>
<div id="graph-wrap">
  <svg id="graph-svg"></svg>
  <div class="graph-legend" id="graph-legend"></div>
</div>
<script src="/assets/graph.js"></script>
"""
    jsonld = with_context(
        {
            "@type": "WebPage",
            "name": f"Grafo · Microfonía · {SITE_NAME}",
            "url": f"{SITE_URL}/grafo/",
            "breadcrumb": crumbs_jsonld(crumbs),
        }
    )
    html = page_shell(
        title=f"Grafo · Microfonía · {SITE_NAME}",
        description="Vista interactiva del grafo local de Microfonía.",
        canonical=f"{SITE_URL}/grafo/",
        body_html=body,
        jsonld_obj=jsonld,
        active_nav="/atlas/",
        active_section="wiki",
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
    crumbs = [("Radio Micelio", "/"), ("Lab", "/lab/"), ("Arcade", None)]
    body = f"""
{crumbs_html(crumbs)}
<p class="pill">🕹️ Laboratorio</p>
<h1>Arcade</h1>
<p class="lead">
  {len(ARCADE_GAMES)} juegos sencillos y clásicos, jugables con mando —
  navegación por gamepad, IA propia por minimax y comentaristas por reglas.
  Cuaderno de mecánicas antes del videojuego Radio Micelio.
</p>
<div class="cat-grid">
{cards}
</div>
"""
    jsonld = with_context(
        {
            "@type": "CollectionPage",
            "name": f"Arcade | Lab · {SITE_NAME}",
            "description": "Arcade de Radio Micelio: experimentos de mecánicas e IA.",
            "url": f"{SITE_URL}/arcade/",
            "isPartOf": {"@id": f"{SITE_URL}/lab/"},
            "breadcrumb": crumbs_jsonld(crumbs),
        }
    )
    html = page_shell(
        title=f"Arcade | Lab · {SITE_NAME}",
        description="Arcade de Radio Micelio: juegos clásicos como cuaderno de laboratorio.",
        canonical=f"{SITE_URL}/arcade/",
        body_html=body,
        jsonld_obj=jsonld,
        active_nav="/lab/",
        active_section="lab",
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
        crumbs = [
            ("Radio Micelio", "/"),
            ("Lab", "/lab/"),
            ("Arcade", "/arcade/"),
            (d["label"], None),
        ]
        body = f"""
{crumbs_html(crumbs)}
<p class="pill">{d['icon']} Arcade</p>
<h1>{d['label']}</h1>
<p class="lead">{d['desc']}</p>
<div class="concept-list">
{cards}
</div>
"""
        jsonld = with_context(
            {
                "@type": "CollectionPage",
                "name": f"{d['label']} | Lab · {SITE_NAME}",
                "description": d["desc"],
                "url": f"{SITE_URL}/arcade/decade/{d['key']}/",
                "breadcrumb": crumbs_jsonld(crumbs),
            }
        )
        html = page_shell(
            title=f"{d['label']} | Lab · {SITE_NAME}",
            description=d["desc"],
            canonical=f"{SITE_URL}/arcade/decade/{d['key']}/",
            body_html=body,
            jsonld_obj=jsonld,
            active_nav="/lab/",
            active_section="lab",
        )
        write_text(DOCS / "arcade" / "decade" / d["key"] / "index.html", html)


def _inject_seo_head(html, *, title, description, canonical, jsonld_obj):
    jsonld = jsonld_dumps(jsonld_obj)
    extra = (
        f'<link rel="icon" href="{FAVICON_HREF}">\n'
        f'<meta name="description" content="{description}">\n'
        f'<link rel="canonical" href="{canonical}">\n'
        f'<meta property="og:title" content="{title}">\n'
        f'<meta property="og:description" content="{description}">\n'
        f'<meta property="og:url" content="{canonical}">\n'
        f'<script type="application/ld+json">\n{jsonld}\n</script>\n'
    )
    html = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", html, count=1)
    return html.replace('<meta charset="utf-8">', f'<meta charset="utf-8">\n{extra}', 1)


def build_arcade_game_pages():
    ent_by_id = {e["id"]: e for e in GAME_ENTITIES}
    for g in ARCADE_GAMES:
        decade = next(d for d in ARCADE_DECADES if d["key"] == g["decade"])
        ent = ent_by_id[g["slug"]]
        html = render_game(
            g["title"],
            g["icon"],
            g["instructions"],
            GAME_SCRIPTS[g["slug"]],
            back_href=f"/arcade/decade/{g['decade']}/",
            back_label=f"← {decade['label']}",
        )
        canonical = abs_url(ent["canonical_url"])
        title = f"{g['title']} | Lab · {SITE_NAME}"
        jsonld = with_context(
            {
                "@type": "VideoGame",
                "@id": ent["entity_id"],
                "name": g["title"],
                "description": g["desc"],
                "url": canonical,
                "genre": decade["label"],
                "playMode": "SinglePlayer",
                "applicationCategory": "Game",
                "isAccessibleForFree": True,
                "gamePlatform": "Web browser",
                "isPartOf": {"@id": f"{SITE_URL}/arcade/"},
            }
        )
        html = _inject_seo_head(
            html, title=title, description=g["desc"], canonical=canonical, jsonld_obj=jsonld
        )
        write_text(DOCS / "arcade" / g["slug"] / "index.html", html)


def build_upcoming_pages():
    for c in upcoming_characters():
        crumbs = [
            ("Radio Micelio", "/"),
            ("Universo", "/universo/"),
            ("Personajes", "/universo/personajes/"),
            (c["label"], None),
        ]
        body = f"""
{crumbs_html(crumbs)}
<p class="pill">Personaje · en preparación</p>
<h1>{c['label']}</h1>
<p class="lead">{c['description']}</p>
<p class="lead">
  Mientras tanto puedes explorar a <a href="{SISMICO['current_url']}">Sísmico</a>
  y su dominio de <a href="/atlas/microfonia/">Microfonía</a>.
</p>
"""
        jsonld = with_context(
            [
                {
                    "@type": "Person",
                    "@id": c["entity_id"],
                    "name": c["label"],
                    "url": abs_url(c["canonical_url"]),
                    "description": c["description"],
                },
                crumbs_jsonld(crumbs),
            ]
        )
        html = page_shell(
            title=f"{c['label']} · Universo · {SITE_NAME}",
            description=c["description"],
            canonical=abs_url(c["canonical_url"]),
            body_html=body,
            jsonld_obj=jsonld,
            active_nav="/universo/",
            active_section="universo",
        )
        # legacy path /proximamente/{slug}/
        slug = c["current_url"].strip("/").split("/")[-1]
        write_text(DOCS / "proximamente" / slug / "index.html", html)


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
        "title": "Microfonía · Radio Micelio",
        "tipo": "grafo",
        "data_file": "data.json",
    }

    data_path = write_json(DOCS / "data.json", data)
    config_path = write_json(DOCS / "config.json", config)
    manifest = {
        "project": "radiomicelio",
        "generated_at": now_iso(),
        "data_sha256": sha256_of(data_path),
        "config_sha256": sha256_of(config_path),
    }
    write_json(DOCS / "manifest.json", manifest)


def build_ontology_jsonld():
    graph = [
        {
            "@id": "mf:MicrofoniaScheme",
            "@type": "skos:ConceptScheme",
            "rdfs:label": "Esquema de microfonía",
            "dcterms:title": "Microfonía · Radio Micelio",
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
                {
                    "mf:propertyName": k,
                    "mf:propertyValue": (("sí" if v else "no") if isinstance(v, bool) else v),
                }
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


def build_tecnologia():
    crumbs = [("Radio Micelio", "/"), ("Tecnología", None)]
    body = f"""
{crumbs_html(crumbs)}
<p class="pill">Modelos · taxonomías · contexto</p>
<h1>Tecnología</h1>
<p class="lead">
  Notas para usar una taxonomía publicada como contexto de un modelo,
  sin meter los vectores dentro del vocabulario.
</p>
<div class="cat-grid">
  <a class="cat-card" href="/tecnologia/it/">
    <div class="icon">IT</div>
    <h3>Taxonomía como contexto</h3>
    <p>Qué trae el SKOS de LexiMus, qué se calcula aparte y en qué orden.</p>
  </a>
</div>
"""
    jsonld = with_context({
        "@type": "CollectionPage",
        "name": f"Tecnología · {SITE_NAME}",
        "url": f"{SITE_URL}/tecnologia/",
        "description": "Documentación técnica de Radio Micelio sobre modelos y taxonomías.",
        "breadcrumb": crumbs_jsonld(crumbs),
    })
    html = page_shell(
        title=f"Tecnología · {SITE_NAME}",
        description="Documentación técnica: modelos fundacionales y taxonomías usadas como contexto.",
        canonical=f"{SITE_URL}/tecnologia/",
        body_html=body,
        jsonld_obj=jsonld,
        active_section="tecnologia",
        active_path="/tecnologia/",
    )
    write_text(DOCS / "tecnologia" / "index.html", html)

    it_crumbs = [("Radio Micelio", "/"), ("Tecnología", "/tecnologia/"), ("Taxonomía como contexto", None)]
    it_body = f"""
{crumbs_html(it_crumbs)}
<p class="pill">LexiMus · SKOS · embeddinggemma:300m</p>
<h1>Usar una taxonomía como contexto</h1>
<p class="lead">
  El fichero SKOS o JSON-LD nombra las clases y el modelo con el que se
  calculan sus perfiles. Los vectores no viajan dentro. Esta página dice
  cómo obtenerlos y cómo dárselos a un modelo.
</p>

<h2>Qué declara el vocabulario</h2>
<p>
  La taxonomía «Los nombres de la música» se publica como esquema SKOS.
  Cada concepto tiene como identificador la ficha oficial del nodo.
  El fichero incluye la etiqueta, la definición cuando existe, los ejemplos,
  la nota de alcance, el concepto más amplio y esta declaración:
</p>
<pre style="background:#141416;padding:12px;border-radius:4px;overflow:auto;font-size:13px">leximus:embeddingModel "embeddinggemma:300m"</pre>
<p>
  Turtle: <a href="https://core.iccmu.es/leximus-corpus/browser/skos/">/leximus-corpus/browser/skos/</a>.
  JSON-LD: el mismo camino con <code>?formato=jsonld</code>.
  El esquema es
  <a href="https://core.iccmu.es/leximus/taxonomias/taxonomia-jc/">taxonomia-jc</a>.
  Esas direcciones piden la sesión de core.iccmu.es.
</p>
<p>
  SKOS no tiene un hueco estándar para un vector de 768 números. El vector
  además cambia si cambia el modelo o una definición. Por eso el fichero
  nombra el modelo y deja el cálculo fuera.
</p>

<h2>Dos cosas que no son el mismo archivo</h2>
<p>
  <strong>Los pesos del modelo</strong> son lo que descarga Ollama al pedir
  <code>embeddinggemma:300m</code>. Sin ese modelo no hay vectores.
</p>
<p>
  <strong>Los vectores</strong> son el resultado de pasar un texto por ese
  modelo. El perfil de un nodo cabe en unos cientos de kilobytes para toda
  la taxonomía: cerca de 132 conceptos por 768 números en coma flotante.
  Una caché de muchos pasajes del corpus puede ocupar más de un gigabyte.
  Esa caché no hace falta para usar la taxonomía, y no se reconstruye
  descargando un fichero ligero.
</p>

<h2>Pasos</h2>
<ol>
  <li>
    <strong>Descarga el vocabulario</strong> en Turtle o JSON-LD.
    Quédate con cada <code>skos:Concept</code>: su URI, su etiqueta,
    su definición, sus ejemplos y su concepto más amplio.
    El nodo raíz no se exporta.
  </li>
  <li>
    <strong>Escribe el texto del perfil</strong>, uno por concepto.
    El orden usado en LexiMus es: etiqueta, camino de categorías
    (sin la raíz), definición curada y ejemplos.
    <pre style="background:#141416;padding:12px;border-radius:4px;overflow:auto;font-size:13px">Sinfonía. Categoría: Los nombres de la música › …. Definición del nodo. Ejemplos: ….
</pre>
    Si el nodo no tiene definición, el perfil se queda en la etiqueta y el
    camino. No inventes el texto que falta: el vector saldría de otra clase.
  </li>
  <li>
    <strong>Pon el prefijo del modelo.</strong> Para <code>embeddinggemma</code>
    el documento lleva <code>title: none | text: </code> delante del perfil.
    El pasaje que quieres clasificar lleva
    <code>task: classification | query: </code> delante del texto.
    Esos prefijos son parte de la entrada: sin ellos el vector no es comparable
    con los que ya calculó LexiMus.
  </li>
  <li>
    <strong>Calcula el vector en local</strong> con el mismo modelo y anota
    su digest. Ollama lo devuelve en <code>/api/tags</code>.
    La misma frase con otro digest es otro vector.
    <pre style="background:#141416;padding:12px;border-radius:4px;overflow:auto;font-size:13px">curl http://localhost:11434/api/embed \\
  -H 'Content-Type: application/json' \\
  -d '{{"model":"embeddinggemma:300m","input":"title: none | text: Sinfonía. Categoría: …"}}'</pre>
    Guarda junto a cada vector la URI del concepto. Así el resultado vuelve
    a la ficha oficial.
  </li>
  <li>
    <strong>Compara</strong> el vector del pasaje con el de cada concepto
    mediante similitud del coseno. Los conceptos más cercanos son el contexto
    taxonómico de ese pasaje.
  </li>
  <li>
    <strong>Pasa texto, no números, al modelo generativo.</strong>
    El embedding solo elige qué clases entran. En el prompt van la etiqueta,
    la definición y la URI de esas clases. Un modelo de lenguaje no lee
    un vector de 768 dimensiones como si fuera una frase.
  </li>
</ol>

<h2>Cuándo hay que repetir el cálculo</h2>
<p>
  Hay que volver a incrustar un concepto si cambia su definición, sus
  ejemplos o el digest del modelo. No mezcles vectores de dos digest en la
  misma comparación. El SKOS puede quedarse igual mientras el modelo
  declarado siga siendo <code>embeddinggemma:300m</code>.
</p>
<p class="lead">
  <a href="https://www.w3.org/TR/skos-reference/">SKOS</a> ·
  <a href="https://ollama.com/library/embeddinggemma">embeddinggemma en Ollama</a> ·
  <a href="https://github.com/ollama/ollama/blob/main/docs/api.md">API de embeddings</a>
</p>
"""
    it_jsonld = with_context({
        "@type": "TechArticle",
        "name": f"Usar una taxonomía como contexto · {SITE_NAME}",
        "url": f"{SITE_URL}/tecnologia/it/",
        "description": (
            "Pasos para calcular el embedding de una taxonomía SKOS "
            "y usarla como contexto de un modelo fundacional."
        ),
        "breadcrumb": crumbs_jsonld(it_crumbs),
        "about": {"@id": "https://core.iccmu.es/leximus/taxonomias/taxonomia-jc/"},
    })
    it_html = page_shell(
        title=f"Taxonomía como contexto · {SITE_NAME}",
        description="Cómo usar el SKOS de LexiMus como contexto: el modelo va declarado y los vectores se calculan aparte.",
        canonical=f"{SITE_URL}/tecnologia/it/",
        body_html=it_body,
        jsonld_obj=it_jsonld,
        active_section="tecnologia",
        active_path="/tecnologia/it/",
    )
    write_text(DOCS / "tecnologia" / "it" / "index.html", it_html)


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
  <p class="hero-sub" style="color:var(--muted)">Esta página no existe (o todavía no la hemos publicado).</p>
</div>
<div class="hero-actions" style="justify-content:center">
  <a class="btn primary" href="/">Volver al inicio</a>
  <a class="btn ghost" href="/atlas/">Ir a la Wiki</a>
</div>
"""
    jsonld = with_context(
        {"@type": "WebPage", "name": f"404 · {SITE_NAME}", "url": f"{SITE_URL}/404.html"}
    )
    html = page_shell(
        title=f"404 · {SITE_NAME}",
        description="Página no encontrada.",
        canonical=f"{SITE_URL}/404.html",
        body_html=body,
        jsonld_obj=jsonld,
    )
    write_text(DOCS / "404.html", html)


def build_sitemap():
    urls = sorted({match.group(1) for path in DOCS.rglob("*.html")
                   if path.name != "404.html" and path.relative_to(DOCS).parts[0] != "editor"
                   for match in re.finditer(r'<link rel="canonical" href="([^"<>]+)"', path.read_text(encoding="utf-8"))})

    today = datetime.now(timezone.utc).date().isoformat()
    entries = "\n".join(f"  <url><loc>{u}</loc><lastmod>{today}</lastmod></url>" for u in urls)
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{entries}\n"
        "</urlset>\n"
    )
    write_text(DOCS / "sitemap.xml", xml)


def build_robots():
    write_text(
        DOCS / "robots.txt",
        f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n",
    )


def build():
    project_graph()  # Valida también la ontología antes de sustituir docs/.
    domain_ids = {d["id"] for d in DOMAINS}
    for profile in PROFILES:
        if not set(profile["dominios"]).issubset(domain_ids):
            raise ValueError(f"Dominios desconocidos en {profile['id']}")
    if DOCS.exists():
        for p in sorted(DOCS.rglob("*"), reverse=True):
            if p.is_file():
                p.unlink()
        for p in sorted(DOCS.rglob("*"), reverse=True):
            if p.is_dir():
                p.rmdir()
    DOCS.mkdir(parents=True, exist_ok=True)

    write_text(DOCS / "assets" / "style.css", STYLE_CSS + (ROOT / "assets_src" / "project.css").read_text(encoding="utf-8"))
    write_text(DOCS / "assets" / "app.js", APP_JS)
    write_text(DOCS / "assets" / "graph.js", GRAPH_JS)
    write_text(DOCS / "CNAME", "www.radiomicelio.es\n")
    copy_airam_lab_assets()

    img_src = ROOT / "assets_src"
    img_dst = DOCS / "assets" / "img"
    img_dst.mkdir(parents=True, exist_ok=True)
    for src in img_src.rglob("*"):
        if src.is_file() and src.suffix.lower() in {".png", ".webp", ".jpg", ".jpeg", ".gif", ".svg", ".avif"}:
            dest = img_dst / src.relative_to(img_src)
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(src.read_bytes())

    build_atlas_hub()
    build_microfonia_landing()
    build_escena_hub()
    build_productora_hub()
    build_lab_hub()
    build_airam_docs()
    build_chess_lab()
    build_story_lab()
    build_category_pages()
    build_concept_pages()
    build_graph_page()
    build_arcade_hub()
    build_arcade_decade_pages()
    build_arcade_game_pages()
    build_upcoming_pages()
    build_tecnologia()
    build_404()
    build_graph_data()
    build_ontology_jsonld()
    build_project(page_shell, write_text, write_json, DOCS, crumbs_html, crumbs_jsonld)
    build_sitemap()
    build_robots()

    n_html = sum(1 for _ in DOCS.rglob("*.html"))
    print(f"OK: {n_html} páginas HTML + data.json + ontology.jsonld + airam H−1 en {DOCS}")


if __name__ == "__main__":
    build()
