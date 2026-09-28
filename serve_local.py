"""Editor local con persistencia en el repo. Solo Python estándar; nunca se despliega.

    python3 -B serve_local.py
"""

import argparse
import base64
import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

SOURCE_FILES = ("content/personajes.json", "content/ontologia.json")


class ConflictError(ValueError):
    pass


def encoded(data):
    return (json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode()


class Repository:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.lock = threading.Lock()
        self.token = secrets.token_urlsafe(32)

    def revision(self):
        return hashlib.sha256(b"\0".join((self.root / name).read_bytes() for name in SOURCE_FILES)).hexdigest()

    def state(self):
        data = json.loads((self.root / "docs/editor/data.json").read_text())
        data.update(mode="local", token=self.token, revision=self.revision())
        data["profiles"], data["ontology"] = [json.loads((self.root / name).read_text()) for name in SOURCE_FILES]
        return data

    def save(self, payload):
        with self.lock:
            if payload.get("revision") != self.revision():
                raise ConflictError("Los archivos han cambiado en otra pestaña o fuera del editor. Exporta tu borrador y recarga antes de guardar.")
            if not isinstance(payload.get("profiles"), list) or not isinstance(payload.get("ontology"), dict):
                raise ValueError("Faltan las fichas o la ontología.")
            previous = {name: (self.root / name).read_bytes() for name in SOURCE_FILES}
            with tempfile.TemporaryDirectory(prefix="rm-editor-") as directory:
                stage = Path(directory)
                for source in self.root.glob("*.py"):
                    shutil.copy2(source, stage / source.name)
                for name in ("content", "assets_src", "airam_lab"):
                    shutil.copytree(self.root / name, stage / name)
                for name, value in zip(SOURCE_FILES, (payload["profiles"], payload["ontology"])):
                    (stage / name).write_bytes(encoded(value))
                images = self.stage_images(payload.get("images", []), stage)
                result = subprocess.run([sys.executable, "-B", str(stage / "build_site.py")], cwd=stage,
                                        capture_output=True, text=True, timeout=90)
                if result.returncode:
                    message = (result.stderr or result.stdout).strip().splitlines()[-1]
                    raise ValueError(f"No se ha guardado: {message}")
                if payload["revision"] != self.revision():
                    raise ConflictError("Los archivos cambiaron durante la validación. No se ha sobrescrito nada.")
                # Stage on the same filesystem, then swap docs; roll back on failure.
                local = self.root / ".local-editor"
                local.mkdir(exist_ok=True)
                with tempfile.TemporaryDirectory(prefix="save-", dir=local) as commit_dir:
                    commit = Path(commit_dir)
                    shutil.copytree(stage / "docs", commit / "new-docs")
                    backup = local / "backups" / str(time.time_ns())
                    backup.mkdir(parents=True)
                    for name, value in previous.items():
                        (backup / Path(name).name).write_bytes(value)
                    added_images = []
                    moved_old = False
                    installed_new = False
                    try:
                        for name in images:
                            target = self.root / "assets_src/uploads" / name
                            target.parent.mkdir(exist_ok=True)
                            if not target.exists():
                                shutil.copy2(stage / "assets_src/uploads" / name, target)
                                added_images.append(target)
                        for name in SOURCE_FILES:
                            self.atomic_write(self.root / name, (stage / name).read_bytes())
                        os.replace(self.root / "docs", commit / "old-docs")
                        moved_old = True
                        os.replace(commit / "new-docs", self.root / "docs")
                        installed_new = True
                    except Exception:
                        for name, value in previous.items():
                            self.atomic_write(self.root / name, value)
                        if moved_old:
                            if installed_new:
                                shutil.rmtree(self.root / "docs")
                            os.replace(commit / "old-docs", self.root / "docs")
                        for image in added_images:
                            image.unlink()
                        raise
            return self.state()

    @staticmethod
    def atomic_write(path, data):
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)

    @staticmethod
    def stage_images(images, stage):
        if not isinstance(images, list) or len(images) > 20:
            raise ValueError("Máximo 20 imágenes por guardado.")
        names = []
        for image in images:
            name = image["name"]
            if not re.fullmatch(r"[a-z0-9-]{1,100}\.(png|jpg|webp|gif)", name):
                raise ValueError("Nombre de imagen no válido.")
            try:
                data = base64.b64decode(image["data"], validate=True)
            except (ValueError, TypeError) as exc:
                raise ValueError("Imagen no válida.") from exc
            signatures = {"png": data.startswith(b"\x89PNG\r\n\x1a\n"), "jpg": data.startswith(b"\xff\xd8\xff"),
                          "gif": data.startswith((b"GIF87a", b"GIF89a")),
                          "webp": data.startswith(b"RIFF") and data[8:12] == b"WEBP"}
            if len(data) > 5 * 1024 * 1024 or not signatures[name.rsplit(".", 1)[1]]:
                raise ValueError("Usa una imagen PNG, JPG, WebP o GIF de hasta 5 MB.")
            path = stage / "assets_src/uploads" / name
            path.parent.mkdir(exist_ok=True)
            if path.exists() and path.read_bytes() != data:
                raise ValueError("Ese nombre de imagen ya está ocupado.")
            path.write_bytes(data)
            names.append(name)
        return names


def handler_for(repository):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(repository.root / "docs"), **kwargs)

        def valid_host(self):
            port = self.server.server_port
            return self.headers.get("Host") in (f"127.0.0.1:{port}", f"localhost:{port}")

        def json_response(self, data, status=200):
            body = encoded(data)
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if not self.valid_host():
                return self.json_response({"error": "Host local no válido."}, 403)
            path = urlsplit(self.path).path
            if path == "/api/editor/state":
                if self.headers.get("Sec-Fetch-Site") == "cross-site":
                    return self.json_response({"error": "Solo desde el editor local."}, 403)
                with repository.lock:
                    return self.json_response(repository.state())
            if path.startswith("/api/"):
                return self.json_response({"error": "Ruta desconocida."}, 404)
            target = Path(self.translate_path(self.path)).resolve()
            if not target.is_relative_to(repository.root / "docs"):
                return self.send_error(403)
            return super().do_GET()

        def do_POST(self):
            if urlsplit(self.path).path != "/api/editor/save":
                return self.json_response({"error": "Ruta desconocida."}, 404)
            expected_origin = "http://" + self.headers.get("Host", "")
            if (not self.valid_host() or self.headers.get("Origin") != expected_origin or
                    not secrets.compare_digest(self.headers.get("X-Editor-Token", ""), repository.token)):
                return self.json_response({"error": "Abre el editor desde este servidor local para guardar."}, 403)
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 32 * 1024 * 1024:
                    return self.json_response({"error": "El envío está vacío o supera 32 MB."}, 413)
                if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                    return self.json_response({"error": "Se espera JSON."}, 415)
                payload = json.loads(self.rfile.read(size))
                if not isinstance(payload, dict):
                    raise ValueError("El envío debe ser un objeto JSON.")
                return self.json_response(repository.save(payload))
            except ConflictError as exc:
                return self.json_response({"error": str(exc)}, 409)
            except (ValueError, KeyError, TypeError, RecursionError) as exc:
                return self.json_response({"error": str(exc)}, 400)
            except subprocess.TimeoutExpired:
                return self.json_response({"error": "La generación tardó demasiado. No se ha guardado."}, 500)
            except Exception as exc:
                print(f"Error de guardado: {exc}", file=sys.stderr)
                return self.json_response({"error": "No se pudo completar el guardado; se restauraron los archivos anteriores."}, 500)
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()
    root = Path(__file__).parent
    subprocess.run([sys.executable, "-B", str(root / "build_site.py")], cwd=root, check=True)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler_for(Repository(root)))
    print(f"Editor local: http://127.0.0.1:{args.port}/editor/", flush=True)
    print("Guarda en content/ y docs/. Publica tú con GitHub Desktop. Ctrl+C para cerrar.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
