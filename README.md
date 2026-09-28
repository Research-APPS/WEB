# Radio Micelio

Sitio estático para GitHub Pages. La portada y la navegación tienen dos ramas:

- **La banda** → Integrantes / Antiguos integrantes.
- **Cómic** → Personajes.

La wiki, la escena, la productora, el laboratorio y los juegos siguen disponibles
en «Otros espacios». Las direcciones anteriores de las fichas redirigen a las
actuales. Sirius se conserva en su dirección anterior y en la productora, sin
añadirlo a ninguna de las dos listas nuevas.

## Editor local: fichas y ontología

Desde esta carpeta ejecuta:

```sh
python3 -B serve_local.py
```

Abre **http://127.0.0.1:8766/editor/**. El servidor se limita a tu ordenador;
no necesita Node, npm, Django, base de datos ni instalar paquetes. Para cambiar
de puerto: `python3 -B serve_local.py --port 8769`.

1. Selecciona una ficha (Sísmico es el punto de partida).
2. Edita descripción, imagen, pertenencia, canción, juego, tutorial, apariciones,
   enlaces y campos de conocimiento. Puedes cargar una imagen desde el ordenador.
3. Para el mapa, introduce coordenadas o pega un enlace de OpenStreetMap con
   `#map=zoom/latitud/longitud` o `mlat` y `mlon`.
4. Pulsa **Guardar en el repositorio** (también ⌘S / Ctrl+S).
5. Revisa los archivos en GitHub Desktop y haz tú el commit y el push.

El botón guarda `content/personajes.json`, `content/ontologia.json`, las nuevas
imágenes en `assets_src/uploads/` y regenera `docs/`. La validación y generación
se hacen primero en una copia temporal. Si fallan, se conservan las versiones
anteriores. Las copias de los JSON previos quedan en `.local-editor/backups/`,
excluidas de Git. Dos pestañas o una edición manual concurrente producen un aviso
de conflicto en lugar de sobrescribir silenciosamente.

**Los cambios son un borrador hasta pulsar Guardar.** Puedes deshacer, descartar,
exportar el borrador completo (incluidas imágenes pendientes) e importarlo más
adelante. Si hay cambios pendientes, se avisa antes de cerrar o recargar.

En GitHub Pages el mismo editor funciona en **modo de prueba**, sin API de
escritura y sin persistencia de cambios. El aviso lo indica, el guardado está
desactivado y puedes exportar un borrador para abrirlo después en local. No se
usa localStorage como sustituto de guardar en el repositorio. Un servidor simple
como `python3 -m http.server` también funciona en modo de prueba.

### Taller de ontología

La pestaña **Ontología** adapta el patrón de Constemad: catálogo buscable, grafo
centrado en el nodo seleccionado e inspector lateral. Pulsa cualquier nodo o
relación para explorarlo y usa las flechas para volver a selecciones anteriores.
El panel agrupa relaciones entrantes y salientes y muestra sus recuentos.

- **+ Padre / + Hijo** crea un concepto conectado al nodo seleccionado. La
  jerarquía es conceptual, no parentesco familiar. Se permite más de un padre y
  se impiden ciclos en esta jerarquía.
- **Conectar un nodo existente** añade relaciones con predicados como
  `rm:inspiradoPor`, `schema:isPartOf`, `skos:related` o `rdfs:subClassOf`.
- **Propiedades** admite texto, números, sí/no y URLs. Sus valores se editan en
  el panel. Puedes quitar conexiones y propiedades o eliminar un nodo nuevo;
  al eliminarlo se quitan también sus conexiones personalizadas.
- El nombre y la descripción del personaje o de un nodo nuevo se editan
  directamente en el inspector. Los IDs se conservan al cambiar el nombre.
- Pertenencia, canción, juego y conocimiento proceden de los campos de la ficha;
  el panel los identifica como «Ficha» para mantener una única fuente de datos.

Los nuevos nodos usan `/id/concepto/…`. Los padres se exportan mediante
`rm:parentConcept` y los hijos mediante su inversa `rm:childConcept`. Las
relaciones libres y los valores tipados se integran en el JSON-LD del proyecto
y en las ontologías de las fichas. **Exportar ontología JSON-LD** permite revisar
el grafo del borrador antes de guardarlo. Es un editor de grafos con validación
de referencias y de la jerarquía conceptual, no un razonador OWL.

## Editar una ficha directamente en archivos

Edita **`content/personajes.json`**. Cada objeto corresponde a una ficha. Su orden
en el archivo determina el orden dentro de sus grupos. No cambies `id` salvo que
quieras cambiar su identificador y sus enlaces.

Campos editables:

| Campo | Contenido |
| --- | --- |
| `nombre` | Nombre visible |
| `grupos` | Lista con `integrantes`, `antiguos-integrantes` y/o `personajes` |
| `tipos` | Lista con `personaje` y/o `persona`; independiente de dónde aparece |
| `descripcion` | Texto breve, sin HTML |
| `imagen` | Ruta como `/assets/img/sismico.png`, URL de imagen o `null` |
| `cancion` | Objeto con `id`, `titulo` y `url`, o `null` |
| `ubicacion` | Objeto con `nombre`, `lat` y `lon`, o `null` |
| `juego` | Objeto con `id`, `nombre` del juego, `titulo` de su implementación y `url`, o `null` |
| `tutorial` | Objeto con `titulo` y `url`, o `null` |
| `apariciones` | Lista de historias u obras con `titulo` y `url` |
| `enlaces` | Lista de objetos con `titulo` y `url`; admite tantos como quieras |
| `dominios` | IDs de conocimiento definidos en `entities.py`, o `[]` |
| `ontologia_url` | Ontología complementaria propia, o `null` |
| `rutas_anteriores` | Rutas locales antiguas que deben redirigir a esta ficha |

**Una entidad puede tener varios papeles.** Por ejemplo, para que Amethystos pase
a ser antiguo integrante y aparezca en el cómic, cambia únicamente:

```json
"grupos": ["antiguos-integrantes", "personajes"]
```

Su ficha seguirá en `/personajes/amethystos/` y su ID en
`https://www.radiomicelio.es/id/amethystos`. Ambas ramas apuntan a la misma ficha;
el primer grupo solo decide la ruta visual de las migas de pan. El generador
impide declarar a alguien integrante actual y antiguo al mismo tiempo.

Ejemplo de **formato** para campos opcionales (sustituye los datos de ejemplo):

```json
{
  "cancion": {"id": "mi-cancion", "titulo": "Título de su canción", "url": "https://example.com/cancion"},
  "ubicacion": {"nombre": "Lugar de ejemplo", "lat": 40.0, "lon": -3.0},
  "enlaces": [
    {"titulo": "Mi enlace", "url": "https://example.com"},
    {"titulo": "Otro enlace", "url": "/atlas/microfonia/"}
  ]
}
```

Las coordenadas son las que decidas publicar como ubicación del personaje:
el sitio no rastrea ubicaciones. Al rellenarlas aparece un mapa OSM con marcador,
atribución y enlace al mapa completo. Sin coordenadas aparece «Ubicación por
anunciar». Las canciones y juegos pendientes también tienen su propio espacio.

Para una imagen local, coloca el archivo en **`assets_src/`** y escribe su ruta
pública `/assets/img/nombre-del-archivo.webp` en la ficha. Se copian imágenes PNG,
WebP, JPG, GIF, SVG y AVIF, incluidas subcarpetas. El marco conserva espacio incluso
cuando todavía no hay retrato.

## Generar y publicar a mano

Desde esta carpeta, con Python 3.9 o posterior y sin instalar dependencias:

```sh
python3 -B build_site.py
python3 -B -m unittest discover -s tests
```

El generador reconstruye `docs/`. **No edites `docs/` directamente**: los cambios
deben hacerse en las fuentes para que sobrevivan a la próxima generación.

Para previsualizar:

```sh
python3 -m http.server 8000 --directory docs
```

Abre `http://localhost:8000`. Después revisa los cambios en GitHub Desktop, haz
commit y push incluyendo **las fuentes y `docs/`**. Se mantiene el despliegue
existente de GitHub Pages desde `docs/`, incluido `CNAME`; no hay servidor de
aplicación ni compilación pendiente en GitHub. **No requiere Node, npm ni un
servidor Node** para generar o publicar. Las herramientas de navegador usadas
durante el desarrollo son exclusivamente de prueba y no se suben a `docs/`.

## Ontología

`/ontologia/` permite recorrer el proyecto → banda/cómic → grupos → fichas →
conocimiento. Cada rama y cada ficha tienen su propia página de ontología,
enlazada discretamente al pie, y un archivo `ontology.jsonld` junto a ella.
`/ontologia/ontology.jsonld` contiene el grafo completo del proyecto.

La navegación es un árbol sencillo; la ontología es un grafo con entidades únicas
y relaciones múltiples, alimentado por los mismos datos que las fichas.
Se conservan los identificadores `/id/…` existentes. Schema.org describe la banda
(`MusicGroup`), el cómic (`ComicSeries`), las fichas, canciones, juegos y lugares.
El vocabulario `rm:` declara las relaciones específicas, incluyendo antiguos
integrantes y personajes ficticios. Los antiguos integrantes no se declaran como
miembros actuales. Sísmico enlaza con Microfonía y su ontología completa, que
permanece en `/ontology.jsonld`. Ajedrez tiene identidad propia en
`/id/game/chess` como `Game`; Chess Lab es su implementación `VideoGame` y
`WebApplication`, conectada mediante `workExample` / `exampleOfWork`. Las canciones
usan `/id/song/{id}`. Un mismo juego o canción mantiene una sola identidad aunque
lo compartan varios personajes.

Referencias del modelo: [identidad en JSON-LD (W3C)](https://www.w3.org/TR/json-ld11/),
[Game](https://schema.org/Game) y [VideoGame](https://schema.org/VideoGame).

Archivos de implementación: `project_data.py` valida los datos;
`project_pages.py` genera fichas y ontologías; `assets_src/project.css` define su
presentación; `build_site.py` construye el conjunto del sitio.
