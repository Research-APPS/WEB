"""
Capa de entidades de Radio Micelio.

Fuente conceptual del sitio: cada entidad tiene schema_type, URLs
(current / canonical / future), entity_id persistente y relations.
En F1 current_url == canonical_url; future_url prepara la migración F2.
Los /id/... son solo identificadores JSON-LD, no páginas HTML.
"""

from __future__ import annotations

from ontology_data import CATEGORIES, CONCEPTS
from arcade_data import GAMES as ARCADE_GAMES

SITE_URL = "https://www.radiomicelio.es"
SITE_NAME = "Radio Micelio"
SITE_DESCRIPTION = (
    "Plataforma cultural: wiki musical, escena, productora, universo narrativo "
    "y laboratorio de experimentos con IA y videojuegos."
)
RM_VOCAB = f"{SITE_URL}/vocab/"
SCHEMA_CONTEXT = {
    "@vocab": "https://schema.org/",
    "rm": RM_VOCAB,
}


def entity_uri(*parts: str) -> str:
    return f"{SITE_URL}/id/" + "/".join(parts)


def abs_url(path: str) -> str:
    if path.startswith("http"):
        return path
    return f"{SITE_URL}{path}"


# ---------------------------------------------------------------------------
# Dominios de conocimiento (Wiki / Atlas)
# ---------------------------------------------------------------------------

DOMAINS = [
    {
        "id": "microfonia",
        "label": "Microfonía",
        "schema_type": "DefinedTermSet",
        "section": "atlas",
        "status": "published",
        "icon": "🎙️",
        "short": "Sonido, sensores y captación acústica",
        "description": (
            "Ontología abierta de microfonía: tipos de micrófono, patrones polares, "
            "técnicas estéreo y colocación por instrumento."
        ),
        "current_url": "/atlas/microfonia/",
        "canonical_url": "/atlas/microfonia/",
        "future_url": "/atlas/microfonia/",
        "entity_id": entity_uri("microfonia"),
        "relations": {
            "associated_characters": ["sismico"],
            "terms": [c["id"] for c in CONCEPTS],
            "categories": [c["key"] for c in CATEGORIES],
        },
    },
    {
        "id": "evolucion",
        "label": "Evolución",
        "schema_type": "DefinedTermSet",
        "section": "atlas",
        "status": "upcoming",
        "icon": "🧬",
        "short": "Biología evolutiva y adaptación",
        "description": "Dominio de conocimiento asociado a Atómico. En preparación.",
        "current_url": None,
        "canonical_url": None,
        "future_url": "/atlas/evolucion/",
        "entity_id": entity_uri("evolucion"),
        "relations": {"associated_characters": ["atomico"], "terms": []},
    },
    {
        "id": "botanica",
        "label": "Botánica",
        "schema_type": "DefinedTermSet",
        "section": "atlas",
        "status": "upcoming",
        "icon": "🌱",
        "short": "Plantas, ecología y redes vegetales",
        "description": "Dominio de conocimiento asociado a Amethystos. En preparación.",
        "current_url": None,
        "canonical_url": None,
        "future_url": "/atlas/botanica/",
        "entity_id": entity_uri("botanica"),
        "relations": {"associated_characters": ["amethystos"], "terms": []},
    },
    {
        "id": "electronica",
        "label": "Electricidad y electrónica",
        "schema_type": "DefinedTermSet",
        "section": "atlas",
        "status": "upcoming",
        "icon": "⚡",
        "short": "Circuitos, energía y maquinaria",
        "description": "Dominio de conocimiento asociado a Daphne Rockmore. En preparación.",
        "current_url": None,
        "canonical_url": None,
        "future_url": "/atlas/electronica/",
        "entity_id": entity_uri("electronica"),
        "relations": {"associated_characters": ["daphne-rockmore"], "terms": []},
    },
    {
        "id": "tecno-naturaleza",
        "label": "Naturaleza y tecnología",
        "schema_type": "DefinedTermSet",
        "section": "atlas",
        "status": "upcoming",
        "icon": "🌿",
        "short": "Interfaces entre lo vivo y lo técnico",
        "description": "Dominio de conocimiento asociado a Marza. En preparación.",
        "current_url": None,
        "canonical_url": None,
        "future_url": "/atlas/tecno-naturaleza/",
        "entity_id": entity_uri("tecno-naturaleza"),
        "relations": {"associated_characters": ["marza"], "terms": []},
    },
    {
        "id": "exploracion-espacial",
        "label": "Exploración espacial",
        "schema_type": "DefinedTermSet",
        "section": "atlas",
        "status": "upcoming",
        "icon": "🚀",
        "short": "Espacio, observación y viaje",
        "description": "Dominio de conocimiento asociado a Sirius. En preparación.",
        "current_url": None,
        "canonical_url": None,
        "future_url": "/atlas/exploracion-espacial/",
        "entity_id": entity_uri("exploracion-espacial"),
        "relations": {"associated_characters": ["sirius"], "terms": []},
    },
]


# ---------------------------------------------------------------------------
# Personajes (Universo)
# ---------------------------------------------------------------------------

CHARACTERS = [
    {
        "id": "sismico",
        "label": "Sísmico",
        "schema_type": "Person",
        "section": "universo",
        "status": "published",
        "topic": "Microfonía y sensórica",
        "producer_role": "Producción musical · Grabación · Sonido",
        "description": (
            "Personaje del universo Radio Micelio. Su extraordinario sistema auditivo "
            "conecta su historia con el estudio del sonido, los sensores y la captación acústica."
        ),
        "current_url": "/universo/personajes/sismico/",
        "canonical_url": "/universo/personajes/sismico/",
        "future_url": "/universo/personajes/sismico/",
        "entity_id": entity_uri("sismico"),
        "image": "/assets/img/sismico.png",
        "relations": {
            "knows_about": ["microfonia"],
            "appears_in": [],
            "alter_ego_of": [],
        },
    },
]

# Personajes aún en /proximamente/ (URL legacy F1)
_UPCOMING_RAW = [
    {"id": "atomico", "label": "Atómico", "topic": "Evolución",
     "domain": "evolucion", "producer_role": "Investigación · Divulgación científica"},
    {"id": "marza", "label": "Marza", "topic": "Naturaleza y tecnología",
     "domain": "tecno-naturaleza", "producer_role": "Diseño · Interfaces"},
    {"id": "tamen", "label": "Tamen", "topic": "Nuevas redes",
     "domain": None, "producer_role": "Comunicación · Divulgación · Audiovisual"},
    {"id": "amethystos", "label": "Amethystos", "topic": "Botánica",
     "domain": "botanica", "producer_role": "Ecología · Contenido editorial"},
    {"id": "daphne-rockmore", "label": "Daphne Rockmore", "topic": "Electricidad y electrónica",
     "domain": "electronica", "producer_role": "Técnica · Electrónica de escenario"},
    {"id": "sirius", "label": "Sirius", "topic": "Exploración espacial",
     "domain": "exploracion-espacial", "producer_role": "Fotografía de directo · Fotografía cultural"},
    {"id": "basscolgado", "label": "Basscolgado", "topic": "España vaciada",
     "domain": None, "producer_role": "Documentación · Campo"},
    {"id": "musitoxic", "label": "Musitoxic", "topic": "IMT",
     "domain": None, "producer_role": "Producción · Experimentación sonora"},
    {"id": "jhonny", "label": "Jhonny", "topic": "Energía",
     "domain": None, "producer_role": "Producción técnica"},
    {"id": "miguel-mafias-el-muso", "label": "Miguel Mafias, el Muso", "topic": "Demonios internos",
     "domain": None, "producer_role": "Narración · Performance"},
]

for _raw in _UPCOMING_RAW:
    _slug = _raw["id"]
    CHARACTERS.append(
        {
            "id": _slug,
            "label": _raw["label"],
            "schema_type": "Person",
            "section": "universo",
            "status": "upcoming",
            "topic": _raw["topic"],
            "producer_role": _raw["producer_role"],
            "description": (
                f"Personaje del universo Radio Micelio. Campo de investigación: {_raw['topic']}. "
                "Contenido en preparación."
            ),
            "current_url": f"/proximamente/{_slug}/",
            "canonical_url": f"/proximamente/{_slug}/",
            "future_url": f"/universo/personajes/{_slug}/",
            "entity_id": entity_uri(_slug),
            "image": None,
            "relations": {
                "knows_about": [_raw["domain"]] if _raw["domain"] else [],
                "appears_in": [],
                "alter_ego_of": [],
            },
        }
    )

CHARACTERS.sort(key=lambda c: c["label"])


# ---------------------------------------------------------------------------
# Conceptos de Microfonía (DefinedTerm) — derivados de ontology_data
# ---------------------------------------------------------------------------

def build_concept_entities():
    out = []
    for c in CONCEPTS:
        cat = c["category"]
        current = f"/{cat}/{c['id']}/"
        out.append(
            {
                "id": c["id"],
                "label": c["label"],
                "en_label": c["en_label"],
                "definition": c["definition"],
                "properties": c["properties"],
                "category": cat,
                "schema_type": "DefinedTerm",
                "section": "atlas",
                "domain": "microfonia",
                "current_url": current,
                "canonical_url": current,
                "future_url": f"/atlas/microfonia/{cat}/{c['id']}/",
                "entity_id": entity_uri("microfonia", c["id"]),
                "relations": c.get("relations", {}),
            }
        )
    return out


CONCEPT_ENTITIES = build_concept_entities()


# ---------------------------------------------------------------------------
# Lab / Arcade
# ---------------------------------------------------------------------------

LAB_SECTIONS = [
    {
        "id": "chess-lab",
        "label": "Chess Lab",
        "status": "published",
        "icon": "♟️",
        "short": "Juego → semántica · H−2 en vivo",
        "description": (
            "Laboratorio principal AIRAM: siete variables expresivas sobre ajedrez, "
            "revisión humana e IndexedDB. Estático, compatible con GitHub Pages."
        ),
        "current_url": "/chess-lab/",
        "canonical_url": "/chess-lab/",
        "future_url": "/chess-lab/",
    },
    {
        "id": "story-lab",
        "label": "Story Lab",
        "status": "published",
        "icon": "📖",
        "short": "H7 Go · H8 Story Mode + PerspectiveHandoff",
        "description": (
            "Semilla del mundo narrativo Radio Micelio: selector de personaje, "
            "capítulos, encuentros de go/ajedrez y handoff de perspectiva."
        ),
        "current_url": "/story-lab/",
        "canonical_url": "/story-lab/",
        "future_url": "/story-lab/",
    },
    {
        "id": "arcade",
        "label": "Arcade",
        "status": "published",
        "icon": "🕹️",
        "short": "Minijuegos clásicos como cuaderno de mecánicas",
        "description": (
            "Antes de construir un videojuego grande, Radio Micelio experimenta "
            "con mecánicas fundamentales en juegos pequeños y sistemas clásicos."
        ),
        "current_url": "/arcade/",
        "canonical_url": "/arcade/",
        "future_url": "/lab/arcade/",
    },
    {
        "id": "airam",
        "label": "AIRAM",
        "status": "published",
        "icon": "🤖",
        "short": "H−1 · CausalTrace ∥ MusicalState",
        "description": (
            "Documentación AIRAM: GameFrame → GameState → CausalTrace ∥ MusicalState. "
            "Sin audio todavía."
        ),
        "current_url": "/lab/airam/",
        "canonical_url": "/lab/airam/",
        "future_url": "/lab/airam/",
    },
    {
        "id": "criaturas",
        "label": "Criaturas",
        "status": "upcoming",
        "icon": "🦴",
        "short": "IK, FABRIK y comportamiento",
        "description": "Experimentos de cuerpos y movimiento para el videojuego RM.",
        "current_url": None,
        "canonical_url": None,
        "future_url": "/lab/criaturas/",
    },
    {
        "id": "rm-game",
        "label": "RM Game",
        "status": "upcoming",
        "icon": "🎮",
        "short": "Prototipos del videojuego Radio Micelio",
        "description": "El cuaderno de laboratorio converge aquí.",
        "current_url": None,
        "canonical_url": None,
        "future_url": "/lab/rm-game/",
    },
]

GAME_EXPERIMENTS = {
    "pong": ["collision", "game-ai"],
    "breakout": ["collision", "physics"],
    "simon": ["memory", "input"],
    "invaders": ["collision", "waves"],
    "pacman": ["pathfinding", "behavior"],
    "snake": ["pathfinding", "behavior"],
    "flappy": ["timing", "input"],
    "chess": ["decision", "minimax"],
    "go": ["search", "minimax"],
}


def build_game_entities():
    out = []
    for g in ARCADE_GAMES:
        current = f"/arcade/{g['slug']}/"
        out.append(
            {
                "id": g["slug"],
                "label": g["title"],
                "icon": g["icon"],
                "decade": g["decade"],
                "desc": g["desc"],
                "instructions": g["instructions"],
                "schema_type": "VideoGame",
                "section": "lab",
                "subsection": "arcade",
                "current_url": current,
                "canonical_url": current,
                "future_url": f"/lab/arcade/{g['slug']}/",
                "entity_id": entity_uri("lab", "arcade", g["slug"]),
                "relations": {
                    "part_of": ["arcade"],
                    "experiments_with": GAME_EXPERIMENTS.get(g["slug"], []),
                },
            }
        )
    return out


GAME_ENTITIES = build_game_entities()


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------

def domains_by_id():
    return {d["id"]: d for d in DOMAINS}


def characters_by_id():
    return {c["id"]: c for c in CHARACTERS}


def concept_entities_by_id():
    return {c["id"]: c for c in CONCEPT_ENTITIES}


def published_characters():
    return [c for c in CHARACTERS if c["status"] == "published"]


def upcoming_characters():
    return [c for c in CHARACTERS if c["status"] == "upcoming"]


def published_domains():
    return [d for d in DOMAINS if d["status"] == "published"]


NAV_SECTIONS = [
    {"id": "wiki", "label": "Wiki", "href": "/atlas/"},
    {"id": "escena", "label": "Escena", "href": "/escena/"},
    {"id": "productora", "label": "Productora", "href": "/productora/"},
    {"id": "universo", "label": "Universo", "href": "/universo/"},
    {"id": "lab", "label": "Lab", "href": "/lab/"},
]
