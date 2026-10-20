"""Páginas de banda/cómic y datos enlazados, sin dependencias de servidor."""

from html import escape
from urllib.parse import urlencode

from entities import SITE_URL, SITE_DESCRIPTION, DOMAINS, abs_url
from project_data import BRANCHES, GROUPS, PROFILES, group_profiles
from ontology_editor import load_overlay, merge_overlay, overlay_html, PREFIXES


def h(value):
    return escape(str(value), quote=True)


EN_CONSTRUCCION = "En construcción"
IMAGEN_PENDIENTE = "Imagen pendiente"
CANCION_EN_PREPARACION = "Canción en preparación"
JUEGO_EN_DESARROLLO = "Juego en desarrollo"
HISTORIA_EN_CONSTRUCCION = "Historia en construcción"


def ref(path):
    return {"@id": abs_url(path)}


def entity_id(p):
    return f"/id/{p['id']}"


def ontology_link(url, label="Ontología de esta página"):
    return f'<p class="ontology-link"><a href="{h(url)}">{h(label)} ↗</a></p>'


def portrait(p):
    if p["imagen"]:
        return f'<img src="{h(p["imagen"])}" alt="Retrato de {h(p["nombre"])}" width="600" height="600" loading="lazy">'
    initials = "".join(word[0] for word in p["nombre"].split()[:2])
    return f'<div class="portrait-placeholder"><span aria-hidden="true">{h(initials)}</span><small>{IMAGEN_PENDIENTE}</small></div>'


def cards(profiles):
    return '<div class="people-grid">' + "".join(
        f'<a class="person-card" href="{p["url"]}"><div class="portrait">{portrait(p)}</div>'
        f'<div class="person-caption"><h3>{h(p["nombre"])}</h3><span>Ver ficha ↗</span></div></a>'
        for p in profiles
    ) + '</div>'


def branch_cards():
    return '''<div class="branch-grid">
      <a class="branch-card band-card" href="/banda/">
        <span class="eyebrow">Música · integrantes</span><span class="branch-mark" aria-hidden="true">01 /</span>
        <h2>La banda</h2><p>La formación actual y quienes pasaron por ella.</p>
        <span class="branch-action">Entrar <span aria-hidden="true">↗</span></span>
      </a>
      <a class="branch-card comic-card" href="/comic/">
        <span class="eyebrow">Personajes</span><span class="branch-mark" aria-hidden="true">02 /</span>
        <h2>Cómic</h2><p>Personajes del cómic.</p>
        <span class="branch-action">Entrar <span aria-hidden="true">↗</span></span>
      </a>
    </div>'''


def resources():
    return '''<section class="project-resources"><h2>También</h2>
      <div class="resource-links"><a href="/atlas/">Wiki musical ↗</a><a href="/lab/">Laboratorio ↗</a>
      <a href="/escena/">Escena ↗</a><a href="/productora/">Productora ↗</a></div></section>'''


def osm_urls(location):
    lat, lon = location["lat"], location["lon"]
    query = urlencode({"bbox": f"{max(-180, lon-.025)},{max(-90, lat-.018)},{min(180, lon+.025)},{min(90, lat+.018)}",
                       "layer": "mapnik", "marker": f"{lat},{lon}"})
    return (f"https://www.openstreetmap.org/export/embed.html?{query}",
            f"https://www.openstreetmap.org/?mlat={lat}&mlon={lon}#map=14/{lat}/{lon}")


def map_panel(p):
    loc = p["ubicacion"]
    if not loc:
        return ""
    embed, full = osm_urls(loc)
    return (f'<p>{h(loc["nombre"])}</p><iframe class="location-map" title="Ubicación actual de {h(p["nombre"])} en OpenStreetMap" '
            f'src="{h(embed)}" loading="lazy" referrerpolicy="no-referrer"></iframe>'
            f'<a class="map-credit" href="{h(full)}">Abrir en OpenStreetMap ↗</a> '
            '<small>© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a></small>')


def resource_panel(title, item, empty, action):
    content = (f'<p>{h(item["titulo"])}</p><a class="btn ghost" href="{h(item["url"])}">{action} ↗</a>'
               if item else f'<p class="pending">{empty}</p>')
    return f'<section class="profile-panel"><h2>{title}</h2>{content}</section>'


def game_panel(p):
    if not p["juego"]:
        return ""
    panel = resource_panel("Su juego", p["juego"], JUEGO_EN_DESARROLLO, "Jugar")
    tutorial = p.get("tutorial")
    if not tutorial:
        return panel
    extra = f'<p><a href="{h(tutorial["url"])}">{h(tutorial["titulo"])} ↗</a></p>'
    return panel.replace('</section>', extra + '</section>')


def profile_node(p):
    types = ["rm:Character"] if "personaje" in p["tipos"] else []
    if "persona" in p["tipos"] or "banda" in p["ramas"]:
        types.append("Person")
    node = {"@id": abs_url(entity_id(p)), "@type": types,
            "name": p["nombre"], "description": p["descripcion"], "url": abs_url(p["url"]),
            "mainEntityOfPage": ref(p["url"]), "subjectOf": ref(p["ontology"]),
            "rm:inBranch": [ref(f"/id/{b}") for b in p["ramas"]],
            "rm:inGroup": [ref(GROUPS[g]["url"]) for g in p["grupos"]]}
    if "integrantes" in p["grupos"]:
        node["memberOf"] = ref("/id/banda")
    if "antiguos-integrantes" in p["grupos"]:
        node["rm:formerMemberOf"] = ref("/id/banda")
    appearances = [ref("/id/comic")] if "personajes" in p["grupos"] else []
    appearances += [{"@id": abs_url(x["url"]), "@type": "CreativeWork", "name": x["titulo"], "url": abs_url(x["url"])} for x in p["apariciones"]]
    if appearances:
        node["rm:appearsIn"] = appearances
    if p["imagen"]:
        node["image"] = abs_url(p["imagen"])
    if p["dominios"]:
        node["knowsAbout"] = [ref(f"/id/{d}") for d in p["dominios"]]
    for field, predicate, kind in (("cancion", "rm:themeSong", "song"), ("juego", "rm:game", "game")):
        item = p[field]
        if item:
            node[predicate] = ref(f"/id/{kind}/{item['id']}")
    if p.get("tutorial"):
        item = p["tutorial"]
        node["rm:tutorial"] = {"@id": abs_url(item["url"]), "@type": "LearningResource", "name": item["titulo"], "url": abs_url(item["url"])}
    if p["ubicacion"]:
        loc = p["ubicacion"]
        node["rm:currentLocation"] = {"@type": "Place", "name": loc["nombre"], "hasMap": osm_urls(loc)[1],
                                      "geo": {"@type": "GeoCoordinates", "latitude": loc["lat"], "longitude": loc["lon"]}}
    if p["enlaces"]:
        node["rm:relatedLink"] = [{"@type": "WebPage", "name": x["titulo"], "url": abs_url(x["url"])} for x in p["enlaces"]]
    if p["ontologia_url"]:
        node["rm:externalOntology"] = ref(p["ontologia_url"])
    return node


def project_graph(include_custom=True):
    graph = [{"@id": abs_url("/id/radio-micelio"), "@type": "CreativeWork", "name": "Radio Micelio",
              "url": SITE_URL + "/", "description": SITE_DESCRIPTION,
              "rm:hasBranch": [ref("/id/banda"), ref("/id/comic")]}]
    for key, b in BRANCHES.items():
        node = {"@id": abs_url(f"/id/{key}"), "@type": b["type"], "name": f"{b['label']} · Radio Micelio",
                "description": b["description"], "url": abs_url(b["url"]),
                "rm:inProject": ref("/id/radio-micelio"), "subjectOf": ref(b["url"] + "ontologia/")}
        if key == "banda":
            node["member"] = [ref(entity_id(p)) for p in group_profiles("integrantes")]
            node["rm:formerMember"] = [ref(entity_id(p)) for p in group_profiles("antiguos-integrantes")]
        else:
            node["character"] = [ref(entity_id(p)) for p in group_profiles("personajes")]
        graph.append(node)
    for key, g in GROUPS.items():
        graph.append({"@id": abs_url(g["url"]), "@type": "CollectionPage", "name": g["label"],
                      "url": abs_url(g["url"]), "about": ref(f"/id/{g['branch']}"),
                      "isPartOf": ref(BRANCHES[g["branch"]]["url"]),
                      "hasPart": [ref(p["url"]) for p in group_profiles(key)]})
    for p in PROFILES:
        graph += [profile_node(p), {"@id": abs_url(p["url"]), "@type": "ProfilePage", "name": p["nombre"],
                                   "url": abs_url(p["url"]), "mainEntity": ref(entity_id(p)),
                                   "isPartOf": [ref(GROUPS[g]["url"]) for g in p["grupos"]]}]
    resources_by_id = {}
    for p in PROFILES:
        for field, kind, typ in (("juego", "game", "Game"), ("cancion", "song", "MusicRecording")):
            item = p[field]
            if not item:
                continue
            uri = abs_url(f"/id/{kind}/{item['id']}")
            node = {"@id": uri, "@type": typ, "name": item.get("nombre", item["titulo"])}
            if field == "juego":
                implementation = abs_url(item["url"]) + "#game"
                node["workExample"] = {"@id": implementation}
                resources_by_id[implementation] = {"@id": implementation, "@type": ["VideoGame", "WebApplication"],
                    "name": item["titulo"], "url": abs_url(item["url"]), "exampleOfWork": {"@id": uri}}
            else:
                node["url"] = abs_url(item["url"])
            resources_by_id[uri] = node
    graph.extend(resources_by_id.values())
    for d in DOMAINS:
        node = {"@id": d["entity_id"], "@type": "DefinedTermSet", "name": d["label"], "description": d["description"]}
        if d["current_url"]:
            node["url"] = abs_url(d["current_url"])
        if d["id"] == "microfonia":
            node["subjectOf"] = ref("/ontology.jsonld")
            node["rm:conceptScheme"] = ref("/ontology#MicrofoniaScheme")
        graph.append(node)
    graph.append({"@id": SITE_URL + "/vocab/Character", "@type": "rdfs:Class", "rdfs:label": "Personaje de ficción",
                  "rdfs:subClassOf": ref("https://schema.org/Thing")})
    properties = {"hasBranch": "Rama del proyecto", "inProject": "Pertenece al proyecto", "inBranch": "Pertenece a la rama",
                  "inGroup": "Figura en la colección", "formerMember": "Antiguo integrante", "formerMemberOf": "Fue integrante de",
                  "themeSong": "Canción asociada", "game": "Juego asociado", "currentLocation": "Ubicación actual publicada",
                  "relatedLink": "Enlace relacionado", "externalOntology": "Ontología complementaria", "conceptScheme": "Esquema de conceptos",
                  "appearsIn": "Aparece en", "tutorial": "Recurso para aprender"}
    graph += [{"@id": SITE_URL + "/vocab/" + key, "@type": "rdf:Property", "rdfs:label": label} for key, label in properties.items()]
    return merge_overlay(graph, load_overlay()) if include_custom else graph


def build_project(shell, write_text, write_json, docs, crumbs_html, crumbs_jsonld):
    context = {"@vocab": "https://schema.org/", "rm": SITE_URL + "/vocab/",
               "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#", "rdfs": "http://www.w3.org/2000/01/rdf-schema#"}
    context.update(PREFIXES)
    graph = project_graph()

    def page(path, title, desc, body, nodes=None, branch=None, crumbs=None, canonical=None, extra_head=""):
        if crumbs:
            body = crumbs_html(crumbs) + body
        if nodes is None:
            nodes = [{"@id": abs_url(path), "@type": "CollectionPage", "name": title, "url": abs_url(path)}]
        nodes = list(nodes)
        if crumbs:
            nodes.append(crumbs_jsonld(crumbs))
        html = shell(title=f"{title} · Radio Micelio", description=desc, canonical=abs_url(canonical or path),
                     body_html=body, jsonld_obj={"@context": context, "@graph": nodes},
                     active_nav=BRANCHES[branch]["url"] if branch else None, active_section=branch,
                     active_path=path, body_class="page-project", extra_head=extra_head)
        write_text(docs / path.strip("/") / "index.html", html)

    # Two equal entrances, with resources deliberately placed after them.
    featured = next(p for p in PROFILES if p["id"] == "sismico")
    spotlight = (f'<a class="spotlight" href="{featured["url"]}"><div class="spotlight-portrait">{portrait(featured)}</div>'
                 f'<div><span class="eyebrow">Ficha</span><h2>{h(featured["nombre"])}</h2>'
                 f'<p>{h(featured["descripcion"])}</p></div><span aria-hidden="true">↗</span></a>')
    page("/", "La banda y el cómic", SITE_DESCRIPTION,
         '<section class="home-hero"><h1 class="home-brand">Radio Micelio</h1>'
         '<p class="home-tagline">Una banda. Un cómic.</p></section>'
         + branch_cards() + spotlight
         + resources() + ontology_link("/ontologia/", "Ontología del proyecto"),
         nodes=[graph[0], {"@id": SITE_URL + "/#website", "@type": "WebSite", "name": "Radio Micelio", "url": SITE_URL + "/", "about": ref("/id/radio-micelio")}])

    for key, b in BRANCHES.items():
        body = f'<p class="eyebrow">Radio Micelio · {"Música" if key == "banda" else "Historias"}</p><h1>{b["label"]}</h1><p class="lead">{b["description"]}</p>'
        for group, g in GROUPS.items():
            if g["branch"] == key:
                body += f'<section class="roster-section"><div class="section-heading"><h2><a href="{g["url"]}">{g["label"]}</a></h2><span>{len(group_profiles(group)):02d}</span></div>{cards(group_profiles(group))}</section>'
        body += ontology_link(b["url"] + "ontologia/", f"Ontología · {b['label']}")
        branch_node = next(n for n in graph if n["@id"] == abs_url(f"/id/{key}"))
        page(b["url"], b["label"], b["description"], body,
             nodes=[branch_node, {"@id": abs_url(b["url"]), "@type": "CollectionPage", "name": b["label"],
                                  "about": ref(f"/id/{key}"), "isPartOf": ref("/"),
                                  "hasPart": [ref(g["url"]) for g in GROUPS.values() if g["branch"] == key]}],
             branch=key, crumbs=[("Radio Micelio", "/"), (b["label"], None)])
    for key, g in GROUPS.items():
        b = BRANCHES[g["branch"]]
        page(g["url"], g["label"], f"{g['label']} · {b['label']} · Radio Micelio",
             f'<h1>{g["label"]}</h1><p class="lead">{b["label"]} · Radio Micelio</p>' + cards(group_profiles(key))
             + ontology_link(b["url"] + "ontologia/"),
             nodes=[next(n for n in graph if n["@id"] == abs_url(g["url"]))], branch=g["branch"],
             crumbs=[("Radio Micelio", "/"), (b["label"], b["url"]), (g["label"], None)])

    for p in PROFILES:
        b, g = BRANCHES[p["rama"]], GROUPS[p["grupo"]]
        trail = [("Radio Micelio", "/"), (b["label"], b["url"]), (g["label"], g["url"]), (p["nombre"], None)]
        action = 'Jugar al ajedrez' if p["juego"] and p["juego"]["id"] == 'chess' else 'Jugar'
        quick = f'<a class="btn primary" href="{h(p["juego"]["url"])}">{action} ↗</a>' if p["juego"] else ''
        body = f'<section class="profile-hero"><div class="portrait">{portrait(p)}</div><div><p class="eyebrow">{b["label"]} / {g["label"]}</p><h1>{h(p["nombre"])}</h1><p class="lead">{h(p["descripcion"])}</p>{quick}</div></section>'
        if len(p["grupos"]) > 1:
            body += '<nav class="profile-contexts" aria-label="También en">' + ' · '.join(f'<a href="{GROUPS[group]["url"]}">{BRANCHES[GROUPS[group]["branch"]]["label"]}: {GROUPS[group]["label"]}</a>' for group in p["grupos"]) + '</nav>'
        panels = ""
        if p["cancion"]:
            panels += resource_panel("Su canción", p["cancion"], CANCION_EN_PREPARACION, "Escuchar")
        panels += game_panel(p)
        location = map_panel(p)
        if location:
            panels += f'<section class="profile-panel profile-map"><h2>Ubicación actual</h2>{location}</section>'
        if p["enlaces"]:
            links = ''.join(f'<li><a href="{h(x["url"])}">{h(x["titulo"])} ↗</a></li>' for x in p["enlaces"])
            panels += f'<section class="profile-panel"><h2>Más enlaces</h2><ul class="profile-links">{links}</ul></section>'
        if panels:
            body += f'<div class="profile-grid">{panels}</div>'
        if p["apariciones"]:
            body += '<section class="profile-panel"><h2>Apariciones</h2><ul class="profile-links">' + ''.join(f'<li><a href="{h(x["url"])}">{h(x["titulo"])}</a></li>' for x in p["apariciones"]) + '</ul></section>'
        body += ontology_link(p["ontology"], f"Ontología de {p['nombre']}")
        body += f'<p class="ontology-link"><a href="/editor/?personaje={p["id"]}">Editar ficha y ontología</a></p>'
        nodes = [n for n in graph if n["@id"] in (abs_url(entity_id(p)), abs_url(p["url"]))]
        page(p["url"], p["nombre"], p["descripcion"], body, nodes=nodes, branch=p["rama"], crumbs=trail)

    # Every ontology has an HTML entrance and an adjacent, linked JSON-LD file.
    ontology_targets = [("/ontologia/", "Ontología de Radio Micelio", None, None)]
    ontology_targets += [(b["url"] + "ontologia/", f"Ontología · {b['label']}", k, None) for k, b in BRANCHES.items()]
    ontology_targets += [(p["ontology"], f"Ontología de {p['nombre']}", p["rama"], p) for p in PROFILES]
    for path, title, branch, profile in ontology_targets:
        chosen = [profile] if profile else [p for p in PROFILES if not branch or branch in p["ramas"]]
        ids = {abs_url(entity_id(p)) for p in chosen} | {abs_url(p["url"]) for p in chosen}
        subset = [n for n in graph if n["@id"] in ids or not any(n["@id"] in (abs_url(entity_id(p)), abs_url(p["url"])) for p in PROFILES)]
        # Branch references remain fully resolvable in the complete project graph.
        document = {"@context": context, "@id": abs_url(path), "@type": "CreativeWork", "name": title,
                    "isPartOf": ref("/ontologia/"), "@graph": subset}
        if path == "/ontologia/":
            document.pop("isPartOf")
        write_json(docs / path.strip("/") / "ontology.jsonld", document)
        body = f'<h1>{h(title)}</h1><p class="lead">Relaciones entre el proyecto, sus ramas, las fichas y sus campos de conocimiento.</p>'
        body += '<nav class="ontology-trail" aria-label="Jerarquía ontológica"><a href="/ontologia/">Radio Micelio</a>'
        if branch:
            b = BRANCHES[branch]
            body += f' <span>→</span> <a href="{b["url"]}ontologia/">{b["label"]}</a>'
        if profile:
            body += f' <span>→ {h(GROUPS[profile["grupo"]]["label"])}</span> <span>→ {h(profile["nombre"])}</span>'
        body += '</nav>'
        if not profile:
            for key, b in BRANCHES.items():
                if branch and branch != key:
                    continue
                body += f'<h2><a href="{b["url"]}ontologia/">{b["label"]}</a></h2>'
                for group, g in GROUPS.items():
                    if g["branch"] == key:
                        body += f'<h3>{g["label"]}</h3><ul>' + ''.join(f'<li><a href="{p["ontology"]}">{h(p["nombre"])}</a></li>' for p in group_profiles(group)) + '</ul>'
        else:
            body += f'<p><a href="{profile["url"]}">Volver a la ficha de {h(profile["nombre"])}</a></p>'
            body += f'<p class="entity-id">ID permanente: <code>{abs_url(entity_id(profile))}</code></p>'
            body += '<h2>Tipos y relaciones</h2><dl class="ontology-relations">'
            body += '<dt>Tipo</dt><dd>' + ', '.join(h(t.capitalize()) for t in profile["tipos"]) + '</dd>'
            for group in profile["grupos"]:
                g = GROUPS[group]
                relation = {"integrantes": "Miembro actual de", "antiguos-integrantes": "Antiguo integrante de", "personajes": "Aparece en"}[group]
                body += f'<dt>{relation}</dt><dd><a href="{BRANCHES[g["branch"]]["url"]}ontologia/">{BRANCHES[g["branch"]]["label"]}</a></dd>'
            for field, label in (("cancion", "Canción asociada"), ("juego", "Juego asociado"), ("tutorial", "Tutorial")):
                item = profile.get(field)
                if item:
                    body += f'<dt>{label}</dt><dd><a href="{h(item["url"])}">{h(item.get("nombre", item["titulo"]))}</a></dd>'
            loc = profile["ubicacion"]
            if loc:
                body += f'<dt>Ubicación actual</dt><dd><a href="{h(osm_urls(loc)[1])}">{h(loc["nombre"])}</a></dd>'
            for appearance in profile["apariciones"]:
                body += f'<dt>Aparece en</dt><dd><a href="{h(appearance["url"])}">{h(appearance["titulo"])}</a></dd>'
            body += '</dl>'
            body += '<h2>Campos de conocimiento</h2>'
            if not profile["dominios"]:
                body += f'<p class="pending">{EN_CONSTRUCCION}</p>'
            for domain_id in profile["dominios"]:
                d = next(d for d in DOMAINS if d["id"] == domain_id)
                body += f'<p><a href="{d["current_url"]}">{h(d["label"])}</a></p>' if d["current_url"] else f'<p>{h(d["label"])}. {EN_CONSTRUCCION}</p>'
                if domain_id == "microfonia":
                    body += '<p><a href="/ontology.jsonld">Ontología completa de microfonía (JSON-LD)</a> · <a href="/grafo/">Ver su grafo</a></p>'
            if profile["ontologia_url"]:
                body += f'<p><a href="{h(profile["ontologia_url"])}">Ontología complementaria ↗</a></p>'
        body += overlay_html(load_overlay(), project_graph(False), abs_url(entity_id(profile)) if profile else None)
        editor_query = f'?personaje={profile["id"]}&vista=ontologia' if profile else '?vista=ontologia'
        body += f'<p class="ontology-link"><a href="{path}ontology.jsonld">Datos enlazados · JSON-LD</a> · <a href="/ontologia/ontology.jsonld">Grafo completo del proyecto</a> · <a href="/editor/{editor_query}">Editar ontología</a></p>'
        trail = [("Radio Micelio", "/")]
        if profile:
            trail += [(BRANCHES[branch]["label"], BRANCHES[branch]["url"]), (profile["nombre"], profile["url"])]
        elif branch:
            trail += [(BRANCHES[branch]["label"], BRANCHES[branch]["url"])]
        trail += [("Ontología", None)]
        page(path, title, title, body, nodes=subset, branch=branch, crumbs=trail,
             extra_head=f'<link rel="alternate" type="application/ld+json" href="{path}ontology.jsonld">')

    # Old public links keep working; stable /id/ identifiers are unchanged.
    aliases = {"/universo/": "/", "/universo/personajes/": "/"}
    for p in PROFILES:
        for old in p.get("rutas_anteriores", []):
            aliases[old] = p["url"]
            aliases[old + "ontologia/"] = p["ontology"]
        aliases[f"/universo/personajes/{p['id']}/"] = p["url"]
        if p["id"] != "sismico":
            aliases[f"/proximamente/{p['id']}/"] = p["url"]
    for old, new in aliases.items():
        page(old, "Esta ficha tiene una nueva dirección", "La banda y el cómic de Radio Micelio.",
             f'<h1>Esta ficha tiene una nueva dirección</h1><p><a href="{new}">Continuar</a></p>', canonical=new,
             extra_head=f'<meta http-equiv="refresh" content="0;url={new}">')

    from editor_pages import build_editor
    build_editor(shell, write_text, write_json, docs, project_graph(False))
