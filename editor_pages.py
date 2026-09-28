"""Publica el editor estático y su instantánea; la escritura solo existe en local."""

import json
from pathlib import Path
from entities import SITE_URL, DOMAINS
from ontology_editor import load_overlay

ROOT = Path(__file__).parent


def build_editor(shell, write_text, write_json, docs, graph):
    for name in ("editor.js", "editor.css", "persistence.js"):
        write_text(docs / "assets" / name, (ROOT / "assets_src" / name).read_text(encoding="utf-8"))
    write_json(docs / "editor/data.json", {
        "format": 1,
        "profiles": json.loads((ROOT / "content/personajes.json").read_text(encoding="utf-8")),
        "ontology": load_overlay(), "catalog": graph,
        "domains": [{"id": d["id"], "label": d["label"]} for d in DOMAINS],
    })
    body = (ROOT / "assets_src/editor.html").read_text(encoding="utf-8")
    html = shell(title="Editor local · Radio Micelio", description="Fichas y ontologías editables de Radio Micelio.",
                 canonical=SITE_URL + "/editor/", body_html=body,
                 jsonld_obj={"@context": "https://schema.org", "@type": "WebPage", "name": "Editor de Radio Micelio", "url": SITE_URL + "/editor/"},
                 body_class="page-editor page-lab-focus",
                 extra_head='<meta name="robots" content="noindex"><link rel="stylesheet" href="/assets/editor.css">')
    write_text(docs / "editor/index.html", html)
