"""Contenido local compartido por la navegación, las fichas y la ontología."""

import json
import math
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).parent
BRANCHES = {
    "banda": {"label": "La banda", "url": "/banda/", "type": "MusicGroup",
              "description": "La música y las personas que forman Radio Micelio."},
    "comic": {"label": "Cómic", "url": "/comic/", "type": "ComicSeries",
              "description": "Las historias y los personajes del cómic de Radio Micelio."},
}
GROUPS = {
    "integrantes": {"label": "Integrantes", "branch": "banda", "url": "/banda/integrantes/"},
    "antiguos-integrantes": {"label": "Antiguos integrantes", "branch": "banda", "url": "/banda/antiguos-integrantes/"},
    "personajes": {"label": "Personajes", "branch": "comic", "url": "/comic/personajes/"},
}


def validate_url(value):
    if not isinstance(value, str) or not value or any(c.isspace() for c in value) or "\\" in value:
        raise ValueError(f"URL no válida: {value!r}")
    parsed = urlsplit(value)
    if value.startswith("/") and not value.startswith("//") and ".." not in parsed.path.split("/"):
        return
    if parsed.scheme in ("http", "https") and parsed.netloc:
        return
    raise ValueError(f"Usa una URL https://… o una ruta /…: {value!r}")


def load_profiles():
    profiles = json.loads((ROOT / "content/personajes.json").read_text(encoding="utf-8"))
    seen = set()
    for p in profiles:
        slug = p["id"]
        if not slug or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-" for c in slug) or slug in seen:
            raise ValueError(f"Identificador no válido o repetido: {slug}")
        seen.add(slug)
        groups = p["grupos"]
        if not groups or len(groups) != len(set(groups)) or any(g not in GROUPS for g in groups):
            raise ValueError(f"Grupos no válidos: {slug}")
        if {"integrantes", "antiguos-integrantes"}.issubset(groups):
            raise ValueError(f"{slug}: no puede ser integrante actual y antiguo a la vez")
        if not p["tipos"] or any(t not in ("personaje", "persona") for t in p["tipos"]):
            raise ValueError(f"{slug}: tipos admitidos: personaje, persona")
        # El primer grupo solo establece la ruta visual de migas de pan.
        p["grupo"] = groups[0]
        p["rama"] = GROUPS[groups[0]]["branch"]
        p["ramas"] = list(dict.fromkeys(GROUPS[g]["branch"] for g in groups))
        for field in ("nombre", "descripcion"):
            if not isinstance(p[field], str) or not p[field].strip():
                raise ValueError(f"{slug}: falta {field}")
        for field in ("imagen", "ontologia_url"):
            if p.get(field):
                validate_url(p[field])
        if p.get("imagen", "") and p["imagen"].startswith("/assets/img/"):
            if not (ROOT / "assets_src" / p["imagen"].removeprefix("/assets/img/")).is_file():
                raise ValueError(f"{slug}: la imagen no existe en assets_src")
        for link in [p.get("cancion"), p.get("juego"), p.get("tutorial"), *p["enlaces"], *p["apariciones"]]:
            if link is not None:
                if not isinstance(link.get("titulo"), str) or not link["titulo"].strip():
                    raise ValueError(f"{slug}: enlace sin título")
                validate_url(link["url"])
        for field in ("juego", "cancion"):
            item = p.get(field)
            if item:
                item_id = item.get("id", "")
                if not item_id or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-" for c in item_id):
                    raise ValueError(f"{slug}: {field} necesita un id estable (minúsculas y guiones)")
        for old in p.get("rutas_anteriores", []):
            validate_url(old)
            if not old.startswith("/") or not old.endswith("/") or old in ("/", "/banda/", "/comic/", "/ontologia/"):
                raise ValueError(f"{slug}: ruta anterior no válida: {old}")
        loc = p.get("ubicacion")
        if loc is not None:
            if not isinstance(loc.get("nombre"), str) or not loc["nombre"].strip():
                raise ValueError(f"{slug}: ubicación sin nombre")
            for key, limit in (("lat", 90), ("lon", 180)):
                val = loc[key]
                if isinstance(val, bool) or not isinstance(val, (int, float)) or not math.isfinite(val) or not -limit <= val <= limit:
                    raise ValueError(f"{slug}: coordenada {key} no válida")
        p["url"] = f"/personajes/{slug}/"
        p["ontology"] = p["url"] + "ontologia/"
    for field in ("juego", "cancion"):
        definitions = {}
        for p in profiles:
            item = p.get(field)
            if item:
                old = definitions.setdefault(item["id"], item)
                if old != item:
                    raise ValueError(f"{field} {item['id']}: hay dos definiciones diferentes")
    return profiles


PROFILES = load_profiles()


def group_profiles(group):
    return [p for p in PROFILES if group in p["grupos"]]


def apply_profiles(characters):
    """Mantiene los IDs originales y el archivo de personajes anteriores."""
    previous = {c["id"]: c for c in characters}
    for p in PROFILES:
        c = previous.get(p["id"])
        if c is None:
            c = {"id": p["id"], "entity_id": f"https://www.radiomicelio.es/id/{p['id']}",
                 "producer_role": "", "relations": {"appears_in": [], "alter_ego_of": []}}
            characters.append(c)
        c.update(label=p["nombre"], schema_type="Person" if p["rama"] == "banda" else "Thing",
                 section=p["rama"], status="published", description=p["descripcion"],
                 image=p["imagen"], current_url=p["url"], canonical_url=p["url"], future_url=p["url"])
        c.setdefault("topic", "")
        c["relations"]["knows_about"] = p["dominios"]
