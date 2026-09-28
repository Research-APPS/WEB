import base64
import json
import shutil
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch

from ontology_editor import merge_overlay, validate_overlay, SITE, PARENT
from serve_local import Repository, ConflictError

ROOT = Path(__file__).resolve().parents[1]


class OntologyEditorTests(unittest.TestCase):
    def setUp(self):
        self.base = [{"@id": SITE + "/id/sismico", "@type": "Person", "name": "Sísmico"}]
        self.parent = SITE + "/id/concepto/sonido"
        self.overlay = {"nodes": [{"id": self.parent, "label": "Sonido", "description": "", "type": "skos:Concept"}],
                        "relations": [{"source": self.base[0]["@id"], "predicate": PARENT, "target": self.parent}],
                        "properties": [{"node": self.parent, "predicate": "rm:intensidad", "type": "number", "value": 7}]}

    def test_parent_child_and_typed_properties_export(self):
        graph = merge_overlay(self.base, self.overlay)
        child = next(n for n in graph if n["@id"] == self.base[0]["@id"])
        parent = next(n for n in graph if n["@id"] == self.parent)
        self.assertEqual(child[PARENT], {"@id": self.parent})
        self.assertEqual(parent["rm:childConcept"], {"@id": child["@id"]})
        self.assertEqual(parent["rm:intensidad"], 7)
        self.assertNotIn(PARENT, self.base[0])

    def test_reject_cycle_dangling_reference_and_wrong_type(self):
        cycle = deepcopy(self.overlay)
        cycle["relations"].append({"source": self.parent, "predicate": PARENT, "target": self.base[0]["@id"]})
        with self.assertRaisesRegex(ValueError, "ciclo"):
            validate_overlay(cycle, self.base)
        missing = deepcopy(self.overlay)
        missing["relations"][0]["target"] = SITE + "/id/missing"
        with self.assertRaisesRegex(ValueError, "no existe"):
            validate_overlay(missing, self.base)
        wrong = deepcopy(self.overlay)
        wrong["properties"][0]["value"] = "seven"
        with self.assertRaisesRegex(ValueError, "incompatible"):
            validate_overlay(wrong, self.base)


class RepositoryEditorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="rm-editor-test-")
        self.root = Path(self.temp.name)
        for path in ROOT.glob("*.py"):
            shutil.copy2(path, self.root / path.name)
        for name in ("content", "assets_src", "airam_lab", "docs"):
            shutil.copytree(ROOT / name, self.root / name)
        self.repo = Repository(self.root)
        self.state = self.repo.state()

    def tearDown(self):
        self.temp.cleanup()

    def test_save_persists_sources_rebuilds_pages_and_detects_conflicts(self):
        payload = deepcopy(self.state)
        p = next(p for p in payload["profiles"] if p["id"] == "sismico")
        p["descripcion"] = 'Descripción guardada <sin HTML> & música.'
        p["cancion"] = {"id": "prueba", "titulo": "Canción de prueba", "url": "https://example.com/song"}
        p["ubicacion"] = {"nombre": "Lugar de prueba", "lat": 40.4, "lon": -3.7}
        node_id = SITE + "/id/concepto/prueba"
        payload["ontology"]["nodes"].append({"id": node_id, "label": "Concepto prueba", "description": "", "type": "skos:Concept"})
        payload["ontology"]["relations"].append({"source": SITE + "/id/sismico", "predicate": PARENT, "target": node_id})
        result = self.repo.save(payload)
        self.assertNotEqual(result["revision"], self.state["revision"])
        saved = json.loads((self.root / "content/personajes.json").read_text())
        self.assertEqual(next(x for x in saved if x["id"] == "sismico")["descripcion"], p["descripcion"])
        html = (self.root / "docs/personajes/sismico/index.html").read_text()
        self.assertIn('Descripción guardada &lt;sin HTML&gt; &amp; música.', html)
        self.assertIn('mlat=40.4', html)
        graph = json.loads((self.root / "docs/personajes/sismico/ontologia/ontology.jsonld").read_text())["@graph"]
        self.assertTrue(any(n["@id"] == node_id for n in graph))
        self.assertTrue(list((self.root / ".local-editor/backups").glob("*/personajes.json")))
        with self.assertRaises(ConflictError):
            self.repo.save(payload)
        # A fresh process would read the exact same persisted sources.
        self.assertEqual(Repository(self.root).state()["profiles"], result["profiles"])

    def test_invalid_build_never_overwrites_sources_or_pages(self):
        old_page = (self.root / "docs/index.html").read_bytes()
        payload = deepcopy(self.state)
        payload["profiles"][0]["ubicacion"] = {"nombre": "Invalid", "lat": 95, "lon": 0}
        with self.assertRaises(ValueError):
            self.repo.save(payload)
        self.assertEqual(self.repo.revision(), self.state["revision"])
        self.assertEqual((self.root / "docs/index.html").read_bytes(), old_page)

    def test_transaction_rolls_back_if_installing_docs_fails(self):
        import os
        original_replace = os.replace
        def fail_on_docs(source, target):
            if Path(source).name == "new-docs":
                raise OSError("Simulated disk failure")
            return original_replace(source, target)
        payload = deepcopy(self.state)
        payload["profiles"][0]["descripcion"] = "Must roll back"
        old_page = (self.root / "docs/index.html").read_bytes()
        with patch("serve_local.os.replace", side_effect=fail_on_docs), self.assertRaises(OSError):
            self.repo.save(payload)
        self.assertEqual(self.repo.revision(), self.state["revision"])
        self.assertEqual((self.root / "docs/index.html").read_bytes(), old_page)

    def test_image_upload_is_copied_to_repo_and_generated_site(self):
        payload = deepcopy(self.state)
        image = (ROOT / "assets_src/sismico.webp").read_bytes()
        payload["images"] = [{"name": "test-upload.webp", "data": base64.b64encode(image).decode()}]
        payload["profiles"][0]["imagen"] = "/assets/img/uploads/test-upload.webp"
        self.repo.save(payload)
        self.assertEqual((self.root / "assets_src/uploads/test-upload.webp").read_bytes(), image)
        self.assertEqual((self.root / "docs/assets/img/uploads/test-upload.webp").read_bytes(), image)
        with self.assertRaises(ValueError):
            Repository.stage_images([{"name": "../outside.png", "data": ""}], self.root)


if __name__ == "__main__":
    unittest.main()
