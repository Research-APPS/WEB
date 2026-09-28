"""Extensiones editables del grafo, compartidas por el editor y el sitio estático."""

import copy
import json
import math
import re
from pathlib import Path
from html import escape
from urllib.parse import urlsplit

SITE = "https://www.radiomicelio.es"
PREFIXES = {"rm": SITE + "/vocab/", "schema": "https://schema.org/",
            "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
            "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
            "skos": "http://www.w3.org/2004/02/skos/core#",
            "xsd": "http://www.w3.org/2001/XMLSchema#"}
PARENT = "rm:parentConcept"


def iri(value):
    if not isinstance(value, str) or not value or any(c.isspace() for c in value):
        raise ValueError("Los identificadores y predicados deben ser URIs o términos como rm:relacion.")
    prefix, _, suffix = value.partition(":")
    if prefix in PREFIXES and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]*", suffix):
        return PREFIXES[prefix] + suffix
    parsed = urlsplit(value)
    if parsed.scheme in ("https", "http") and parsed.netloc and "\\" not in value:
        return value
    raise ValueError(f"Identificador o predicado no válido: {value}")


def load_overlay(root=None):
    path = (root or Path(__file__).parent) / "content/ontologia.json"
    return json.loads(path.read_text(encoding="utf-8"))


def validate_overlay(data, base):
    if not isinstance(data, dict) or set(data) != {"nodes", "relations", "properties"}:
        raise ValueError("La ontología debe contener nodes, relations y properties.")
    if any(not isinstance(data[k], list) for k in data):
        raise ValueError("Nodos, relaciones y propiedades deben ser listas.")
    if sum(len(v) for v in data.values()) > 10000:
        raise ValueError("Máximo 10.000 elementos por ontología editable.")
    known = {n["@id"] for n in base}
    for n in data["nodes"]:
        if set(n) != {"id", "label", "type", "description"}:
            raise ValueError("Un nodo necesita id, label, type y description.")
        uri = iri(n["id"])
        if not uri.startswith(SITE + "/id/concepto/") or uri in known:
            raise ValueError(f"ID de nodo repetido o fuera de /id/concepto/: {uri}")
        if not isinstance(n["label"], str) or not n["label"].strip():
            raise ValueError("Cada nodo necesita un nombre.")
        if not isinstance(n["description"], str):
            raise ValueError("La descripción del nodo debe ser texto.")
        iri(n["type"])
        known.add(uri)
    seen = set()
    parents = {}
    for r in data["relations"]:
        if set(r) != {"source", "predicate", "target"}:
            raise ValueError("Una relación necesita source, predicate y target.")
        source, target, pred = iri(r["source"]), iri(r["target"]), iri(r["predicate"])
        if source not in known or target not in known:
            raise ValueError("La relación apunta a un nodo que no existe; créalo o selecciona uno del catálogo.")
        key = (source, pred, target)
        if key in seen:
            raise ValueError("Hay una relación repetida.")
        seen.add(key)
        if pred == iri(PARENT):
            parents.setdefault(source, []).append(target)
    # La jerarquía conceptual no puede contener ciclos; otras relaciones sí.
    done, visiting = set(), set()
    def visit(node):
        if node in visiting:
            raise ValueError("Los padres conceptuales forman un ciclo. Revisa esa conexión.")
        if node in done:
            return
        visiting.add(node)
        for parent in parents.get(node, []):
            visit(parent)
        visiting.remove(node)
        done.add(node)
    for node in parents:
        visit(node)
    for p in data["properties"]:
        if set(p) != {"node", "predicate", "type", "value"} or iri(p["node"]) not in known:
            raise ValueError("Propiedad incompleta o nodo desconocido.")
        iri(p["predicate"])
        typ, value = p["type"], p["value"]
        valid = ((typ == "text" and isinstance(value, str)) or
                 (typ == "number" and type(value) in (int, float) and math.isfinite(value)) or
                 (typ == "boolean" and type(value) is bool) or
                 (typ == "url" and isinstance(value, str) and urlsplit(value).scheme in ("https", "http") and bool(urlsplit(value).netloc)))
        if not valid:
            raise ValueError(f"Valor incompatible con el tipo de propiedad: {typ}")
    return data


def merge_overlay(base, overlay):
    validate_overlay(overlay, base)
    graph = copy.deepcopy(base)
    by_id = {n["@id"]: n for n in graph}
    for n in overlay["nodes"]:
        node = {"@id": n["id"], "@type": n["type"], "name": n["label"], "description": n["description"]}
        graph.append(node)
        by_id[n["id"]] = node
    def add(source, predicate, value):
        node = by_id[source]
        # Compact Schema.org terms and explicit schema: terms share one key.
        pred_iri = iri(predicate)
        key = pred_iri.removeprefix(PREFIXES["schema"]) if pred_iri.startswith(PREFIXES["schema"]) else predicate
        current = node.get(key)
        if current is None:
            node[key] = value
        elif current != value:
            values = current if isinstance(current, list) else [current]
            if value not in values:
                node[key] = values + [value]
    for r in overlay["relations"]:
        add(r["source"], r["predicate"], {"@id": r["target"]})
        if iri(r["predicate"]) == iri(PARENT):
            add(r["target"], "rm:childConcept", {"@id": r["source"]})
    for p in overlay["properties"]:
        add(p["node"], p["predicate"], p["value"])
    predicates = {p["predicate"] for p in overlay["properties"]} | {r["predicate"] for r in overlay["relations"]}
    predicates.update((PARENT, "rm:childConcept"))
    for pred in sorted(predicates):
        uri = iri(pred)
        if uri.startswith(PREFIXES["rm"]) and uri not in by_id:
            graph.append({"@id": uri, "@type": "rdf:Property", "rdfs:label": pred.split(":")[-1]})
    return graph


def overlay_html(overlay, base, focus=None):
    labels = {n["@id"]: n.get("name", n.get("rdfs:label", n["@id"])) for n in base}
    labels.update({n["id"]: n["label"] for n in overlay["nodes"]})
    related = {focus} if focus else set(labels)
    if focus:
        # Traverse the custom component so grandchildren remain discoverable.
        changed = True
        while changed:
            changed = False
            for r in overlay["relations"]:
                if r["source"] in related or r["target"] in related:
                    before = len(related)
                    related.update((r["source"], r["target"]))
                    changed |= len(related) != before
    rows = []
    for r in overlay["relations"]:
        if r["source"] in related:
            label = "tiene como padre conceptual" if iri(r["predicate"]) == iri(PARENT) else r["predicate"]
            rows.append(f'<li>{escape(str(labels[r["source"]]))} → <strong>{escape(label)}</strong> → {escape(str(labels[r["target"]]))}</li>')
    for p in overlay["properties"]:
        if p["node"] in related:
            rows.append(f'<li>{escape(str(labels[p["node"]]))} · <strong>{escape(p["predicate"])}</strong>: {escape(str(p["value"]))}</li>')
    if not rows:
        return ''
    return '<section class="ontology-custom"><h2>Conexiones y propiedades añadidas</h2><ul>' + ''.join(rows) + '</ul></section>'
