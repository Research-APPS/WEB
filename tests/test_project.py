"""Verifica el sitio generado y las relaciones que importan al reorganizarlo."""

import json
import unittest
from copy import deepcopy
from unittest.mock import patch
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, unquote

from project_data import PROFILES, GROUPS, group_profiles, validate_url
from project_pages import profile_node, map_panel, project_graph
from entities import SITE_URL

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"


class PageParser(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.links = []
        self.jsonld = []
        self._json = None
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("a", "link", "script", "img", "iframe", "source"):
            for key in ("href", "src", "srcset"):
                if attrs.get(key):
                    self.links.append(attrs[key])
        if tag == "script" and attrs.get("type") == "application/ld+json":
            self._json = ""

    def handle_data(self, data):
        if self._json is not None:
            self._json += data

    def handle_endtag(self, tag):
        if tag == "script" and self._json is not None:
            self.jsonld.append(json.loads(self._json))
            self._json = None


class ProjectTests(unittest.TestCase):
    def test_rosters(self):
        self.assertEqual([p["nombre"] for p in group_profiles("integrantes")],
                         ["Sísmico", "Atómico Vaquero", "Amethystos", "Tamen"])
        self.assertEqual([p["nombre"] for p in group_profiles("antiguos-integrantes")],
                         ["Basscolgado", "Musitoxic", "Miguel Mafias (el Muso)", "Will el púas", "Tocarlos el niño Rave"])
        self.assertEqual([p["nombre"] for p in group_profiles("personajes")],
                         ["Marza", "Daphne Rockmore", "Solfa", "Jhonny", "Aro", "Gab", "Foca 1", "Caballo 1", "Cobaya 1", "Cobaya 2", "Cobaya n-1"])

    def test_generated_links_and_jsonld(self):
        checked = 0
        for path in DOCS.rglob("*.html"):
            with self.subTest(page=str(path.relative_to(DOCS))):
                parsed = PageParser(path.read_text(encoding="utf-8"))
                self.assertTrue(parsed.jsonld, "Falta JSON-LD")
                for link in parsed.links:
                    url = urlsplit(link)
                    if url.scheme in ("data", "mailto", "tel") or (url.netloc and url.netloc != urlsplit(SITE_URL).netloc):
                        continue
                    if not url.path:
                        continue
                    target = DOCS / unquote(url.path).lstrip("/") if url.path.startswith("/") else path.parent / unquote(url.path)
                    if target.is_dir():
                        target = target / "index.html"
                    self.assertTrue(target.is_file(), f"Enlace roto: {link}")
                checked += 1
        self.assertGreater(checked, 100)

    def test_every_profile_has_resources_and_ontology(self):
        for p in PROFILES:
            with self.subTest(profile=p["id"]):
                html = (DOCS / p["url"].strip("/") / "index.html").read_text()
                for text in ("Su canción", "Su juego", "Ubicación actual", "Más enlaces", p["ontology"]):
                    self.assertIn(text, html)
                data = json.loads((DOCS / p["ontology"].strip("/") / "ontology.jsonld").read_text())
                self.assertTrue(any(n["@id"] == SITE_URL + "/id/" + p["id"] for n in data["@graph"]))

    def test_membership_semantics(self):
        for p in PROFILES:
            node = profile_node(p)
            self.assertEqual("memberOf" in node, "integrantes" in p["grupos"])
            self.assertEqual("rm:formerMemberOf" in node, "antiguos-integrantes" in p["grupos"])
        graph = json.loads((DOCS / "ontologia/ontology.jsonld").read_text())["@graph"]
        band = next(n for n in graph if n["@id"] == SITE_URL + "/id/banda")
        self.assertEqual(len(band["member"]), 4)
        self.assertEqual(len(band["rm:formerMember"]), 5)
        sismico = next(n for n in graph if n["@id"] == SITE_URL + "/id/sismico")
        self.assertEqual(sismico["rm:game"]["@id"], SITE_URL + "/id/game/chess")
        game = next(n for n in graph if n["@id"] == SITE_URL + "/id/game/chess")
        self.assertEqual(game["@type"], "Game")
        software = next(n for n in graph if n["@id"] == game["workExample"]["@id"])
        self.assertEqual(software["url"], SITE_URL + "/chess-lab/")
        self.assertIn("VideoGame", software["@type"])
        self.assertEqual(sismico["knowsAbout"][0]["@id"], SITE_URL + "/id/microfonia")

    def test_one_entity_in_multiple_groups_keeps_identity(self):
        profiles = deepcopy(PROFILES)
        p = next(p for p in profiles if p["id"] == "amethystos")
        original_id, original_url = profile_node(p)["@id"], p["url"]
        p.update(grupos=["antiguos-integrantes", "personajes"], ramas=["banda", "comic"])
        with patch("project_data.PROFILES", profiles), patch("project_pages.PROFILES", profiles):
            graph = project_graph()
            nodes = [n for n in graph if n["@id"] == original_id]
            self.assertEqual(len(nodes), 1)
            self.assertEqual(nodes[0]["url"], SITE_URL + original_url)
            self.assertNotIn("memberOf", nodes[0])
            self.assertIn("rm:formerMemberOf", nodes[0])
            self.assertIn({"@id": SITE_URL + "/id/comic"}, nodes[0]["rm:appearsIn"])
            comic = next(n for n in graph if n["@id"] == SITE_URL + "/id/comic")
            self.assertIn({"@id": original_id}, comic["character"])

    def test_osm_configured_and_pending(self):
        self.assertNotIn("<iframe", map_panel({"ubicacion": None}))
        panel = map_panel({"nombre": 'A & B', "ubicacion": {"nombre": 'Lugar <ejemplo>', "lat": 40.4, "lon": -3.7}})
        parser = PageParser(panel)
        embed = next(link for link in parser.links if "embed.html" in link)
        self.assertEqual(parse_qs(urlsplit(embed).query)["marker"], ["40.4,-3.7"])
        self.assertIn("Lugar &lt;ejemplo&gt;", panel)
        self.assertIn("openstreetmap.org/copyright", panel)

    def test_urls_reject_active_content(self):
        for url in ("javascript:alert(1)", "//evil.test", "/../outside", "data:text/html,test"):
            with self.assertRaises(ValueError):
                validate_url(url)
        for url in ("/chess-lab/", "https://example.com/?a=1&b=2"):
            validate_url(url)


if __name__ == "__main__":
    unittest.main()
