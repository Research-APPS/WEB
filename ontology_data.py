"""
Fuente de verdad de la ontología de microfonía (Radio Micelio).

Todo el contenido vive aquí como estructuras Python simples. `build_site.py`
lee este módulo y genera:
  - páginas HTML estáticas con JSON-LD (schema.org) incrustado para SEO
  - un archivo de ontología formal en JSON-LD (SKOS) para reutilización
  - un grafo nodes/edges (data.json) para la vista interactiva

Añadir un concepto o una relación nueva es solo tocar las listas de abajo.
"""

CATEGORIES = [
    {
        "key": "tipos",
        "label": "Tipos de micrófono",
        "icon": "🎙️",
        "desc": "El principio de transducción con el que cada micrófono convierte sonido en señal eléctrica.",
    },
    {
        "key": "patrones",
        "label": "Patrones polares",
        "icon": "🌐",
        "desc": "Cómo de sensible es un micrófono según la dirección de la que llega el sonido.",
    },
    {
        "key": "estereo",
        "label": "Técnicas estéreo",
        "icon": "🎧",
        "desc": "Formas de combinar dos o más micrófonos para capturar una imagen espacial.",
    },
    {
        "key": "instrumentos",
        "label": "Close-miking por instrumento",
        "icon": "🥁",
        "desc": "Colocación práctica de micrófono cerca de una fuente concreta.",
    },
]

# Cada concepto: id único (slug), categoría, etiquetas ES/EN, definición,
# propiedades (clave -> valor, para la ficha) y relaciones salientes
# (predicado legible -> lista de ids de otros conceptos).
CONCEPTS = [
    # ---------------------------------------------------------------- tipos
    {
        "id": "dinamico",
        "category": "tipos",
        "label": "Micrófono dinámico",
        "en_label": "Dynamic microphone",
        "definition": (
            "Genera señal por inducción electromagnética: el sonido mueve una bobina "
            "suspendida en un campo magnético, unida a un diafragma. Es el diseño más "
            "robusto y no necesita alimentación externa."
        ),
        "properties": {
            "Principio": "Bobina móvil (inducción electromagnética)",
            "Alimentación phantom": "No necesita",
            "Sensibilidad": "Media-baja",
            "Resistencia a SPL alto": "Muy alta",
            "Fragilidad": "Baja — apto para uso intensivo en directo",
        },
        "relations": {
            "patrón habitual": ["cardioide"],
            "se usa en": ["ampli-guitarra-electrica", "bateria"],
        },
    },
    {
        "id": "condensador-diafragma-grande",
        "category": "tipos",
        "label": "Condensador de diafragma grande",
        "en_label": "Large-diaphragm condenser (LDC)",
        "definition": (
            "La cápsula es un condensador eléctrico: una membrana metalizada muy fina "
            "vibra frente a una placa fija cargada. Necesita alimentación phantom "
            "(48V) y es mucho más sensible y detallado que un dinámico."
        ),
        "properties": {
            "Principio": "Condensador (placa cargada + diafragma)",
            "Alimentación phantom": "Necesita 48V",
            "Sensibilidad": "Alta",
            "Resistencia a SPL alto": "Media (según modelo, algunos con pad)",
            "Fragilidad": "Media — cuidado con golpes de aire y humedad",
        },
        "relations": {
            "patrón habitual": ["cardioide"],
            "se usa en": ["voz", "piano"],
        },
    },
    {
        "id": "condensador-diafragma-pequeno",
        "category": "tipos",
        "label": "Condensador de diafragma pequeño",
        "en_label": "Small-diaphragm condenser (SDC)",
        "definition": (
            "También llamado 'de lápiz' por su forma. El diafragma pequeño responde "
            "más rápido a los transitorios y mantiene el patrón polar más consistente "
            "en todas las frecuencias que uno grande."
        ),
        "properties": {
            "Principio": "Condensador (diafragma pequeño)",
            "Alimentación phantom": "Necesita 48V",
            "Sensibilidad": "Alta",
            "Respuesta transitoria": "Muy rápida",
            "Fragilidad": "Media",
        },
        "relations": {
            "patrón habitual": ["cardioide", "omnidireccional"],
            "se usa en": ["bateria", "guitarra-acustica"],
        },
    },
    {
        "id": "cinta",
        "category": "tipos",
        "label": "Micrófono de cinta",
        "en_label": "Ribbon microphone",
        "definition": (
            "Una cinta metálica ultrafina, suspendida en un campo magnético, hace de "
            "diafragma y generador a la vez. Sonido cálido y suave en agudos; "
            "frágil ante golpes de aire directos."
        ),
        "properties": {
            "Principio": "Cinta metálica en campo magnético",
            "Alimentación phantom": "No la necesita (algunos modelos activos sí)",
            "Sensibilidad": "Media",
            "Timbre": "Cálido, agudos suavizados",
            "Fragilidad": "Alta — evitar golpes de aire y phantom accidental en modelos pasivos",
        },
        "relations": {
            "patrón habitual": ["figura-8"],
        },
    },
    {
        "id": "pzm-boundary",
        "category": "tipos",
        "label": "Micrófono de superficie (PZM / boundary)",
        "en_label": "Boundary / PZM microphone",
        "definition": (
            "La cápsula va pegada o muy cerca de una superficie grande (mesa, suelo, "
            "tapa de piano). Al captar la onda directa y la reflejada casi en fase, "
            "evita el filtro de peine que sufriría un micro suspendido cerca del suelo."
        ),
        "properties": {
            "Principio": "Cápsula de electret pegada a una superficie",
            "Alimentación phantom": "Suele necesitar",
            "Patrón resultante": "Semiesférico (media esfera sobre la superficie)",
            "Uso típico": "Conferencias, suelo de escenario de teatro, interior de piano de cola",
        },
        "relations": {
            "se usa en": ["piano"],
        },
    },
    # ------------------------------------------------------------ patrones
    {
        "id": "omnidireccional",
        "category": "patrones",
        "label": "Omnidireccional",
        "en_label": "Omnidirectional",
        "definition": (
            "Capta con la misma sensibilidad desde cualquier dirección. Sin efecto de "
            "proximidad, respuesta en graves más extendida y natural, pero también "
            "capta todo el ambiente de la sala."
        ),
        "properties": {
            "Rechazo trasero": "Ninguno (0 dB)",
            "Efecto de proximidad": "No tiene",
            "Sensibilidad al viento/pop": "Baja, comparado con direccionales",
        },
        "relations": {
            "se usa en": ["ab", "decca-tree"],
        },
    },
    {
        "id": "cardioide",
        "category": "patrones",
        "label": "Cardioide",
        "en_label": "Cardioid",
        "definition": (
            "El patrón más común: máxima sensibilidad al frente, rechazo fuerte "
            "(en torno a -25 dB) exactamente detrás (180°). El nombre viene de la "
            "forma de corazón de su gráfica polar."
        ),
        "properties": {
            "Ángulo de máximo rechazo": "180°",
            "Efecto de proximidad": "Sí, notable en distancias cortas",
            "Uso típico": "Voz, instrumento individual, micrófono \"todoterreno\"",
        },
        "relations": {
            "se usa en": ["xy", "ortf"],
        },
    },
    {
        "id": "supercardioide",
        "category": "patrones",
        "label": "Supercardioide",
        "en_label": "Supercardioid",
        "definition": (
            "Lóbulo frontal más estrecho que el cardioide, con un pequeño lóbulo "
            "trasero. El ángulo de máximo rechazo está en torno a 126°, no en 180°. "
            "Mejor aislamiento lateral en directo."
        ),
        "properties": {
            "Ángulo de máximo rechazo": "≈126°",
            "Lóbulo trasero": "Pequeño",
            "Uso típico": "Directo, cuando hay monitores cerca y se busca más rechazo lateral",
        },
        "relations": {},
    },
    {
        "id": "hipercardioide",
        "category": "patrones",
        "label": "Hipercardioide",
        "en_label": "Hypercardioid",
        "definition": (
            "Más estrecho todavía que el supercardioide, con un lóbulo trasero mayor. "
            "El ángulo de máximo rechazo baja hasta ≈110°. Muy usado en boom de cine."
        ),
        "properties": {
            "Ángulo de máximo rechazo": "≈110°",
            "Lóbulo trasero": "Moderado",
            "Uso típico": "Boom de cine/TV, captación muy dirigida en directo",
        },
        "relations": {},
    },
    {
        "id": "figura-8",
        "category": "patrones",
        "label": "Figura en 8 (bidireccional)",
        "en_label": "Figure-8 (bidirectional)",
        "definition": (
            "Capta igual por delante y por detrás, con rechazo total (en teoría) a "
            "90° y 270°. Patrón nativo de los micrófonos de cinta y de muchos "
            "condensadores multipatrón."
        ),
        "properties": {
            "Ángulo de máximo rechazo": "90° y 270° (los laterales)",
            "Efecto de proximidad": "Muy marcado",
            "Uso típico": "Entrevista cara a cara, Blumlein, canal Side de M-S",
        },
        "relations": {
            "se usa en": ["blumlein", "ms"],
            "típico de": ["cinta"],
        },
    },
    {
        "id": "shotgun",
        "category": "patrones",
        "label": "Shotgun (lobular / interferencia)",
        "en_label": "Shotgun (line + gradient)",
        "definition": (
            "Un tubo ranurado delante de la cápsula cancela por interferencia el "
            "sonido que no llega justo de frente, creando un patrón extremadamente "
            "estrecho y direccional."
        ),
        "properties": {
            "Directividad": "Muy alta, especialmente en medios-agudos",
            "Comportamiento en graves": "Se ensancha — pierde directividad en baja frecuencia",
            "Uso típico": "Cine, documental, naturaleza, TV a distancia",
        },
        "relations": {},
    },
    # ------------------------------------------------------------- estéreo
    {
        "id": "xy",
        "category": "estereo",
        "label": "XY (coincidente)",
        "en_label": "XY (coincident pair)",
        "definition": (
            "Dos micrófonos cardioides con las cápsulas prácticamente en el mismo "
            "punto, angulados entre 90° y 135° entre sí. Al no haber separación "
            "física, no hay diferencias de tiempo entre canales: compatibilidad en "
            "mono perfecta."
        ),
        "properties": {
            "Micrófonos": "2 cardioides (o similares)",
            "Separación física": "Ninguna (cápsulas coincidentes)",
            "Compatibilidad mono": "Excelente",
            "Sensación de espacio": "Moderada",
        },
        "relations": {
            "usa patrón": ["cardioide"],
            "recomendada para": ["bateria"],
        },
    },
    {
        "id": "ortf",
        "category": "estereo",
        "label": "ORTF",
        "en_label": "ORTF",
        "definition": (
            "Estándar francés (Office de Radiodiffusion Télévision Française): dos "
            "cardioides separados 17 cm entre cápsulas, angulados 110° entre sí. "
            "Equilibrio entre imagen precisa y sensación de profundidad."
        ),
        "properties": {
            "Micrófonos": "2 cardioides",
            "Separación": "17 cm",
            "Ángulo": "110°",
            "Compatibilidad mono": "Buena",
        },
        "relations": {
            "usa patrón": ["cardioide"],
        },
    },
    {
        "id": "ab",
        "category": "estereo",
        "label": "AB (par espaciado)",
        "en_label": "AB (spaced pair)",
        "definition": (
            "Dos micrófonos (normalmente omnidireccionales) separados una distancia "
            "notable (40-60 cm o más), sin angular. La diferencia de tiempo de "
            "llegada entre canales crea una sensación de espacio muy amplia."
        ),
        "properties": {
            "Micrófonos": "2, normalmente omnidireccionales",
            "Separación": "40-60 cm o más",
            "Sensación de espacio": "Muy amplia",
            "Compatibilidad mono": "Riesgo de cancelaciones de fase",
        },
        "relations": {
            "usa patrón": ["omnidireccional"],
            "recomendada para": ["bateria", "piano"],
        },
    },
    {
        "id": "blumlein",
        "category": "estereo",
        "label": "Blumlein",
        "en_label": "Blumlein pair",
        "definition": (
            "Dos micrófonos en figura de 8, coincidentes, cruzados a 90°. Captura de "
            "forma muy realista tanto la fuente como el ambiente de la sala — exige "
            "una sala que suene bien."
        ),
        "properties": {
            "Micrófonos": "2 en figura de 8",
            "Ángulo": "90°, cápsulas coincidentes",
            "Sensación de espacio": "Muy realista, incluye mucho ambiente",
        },
        "relations": {
            "usa patrón": ["figura-8"],
        },
    },
    {
        "id": "ms",
        "category": "estereo",
        "label": "Mid-Side (M-S)",
        "en_label": "Mid-Side (M-S)",
        "definition": (
            "Un micrófono central (Mid, cardioide u omni) más uno lateral en figura "
            "de 8 (Side). Se decodifica sumando y restando Mid±Side, lo que permite "
            "ajustar la anchura estéreo después de grabar, incluso mezclarlo a mono "
            "sin ningún problema de fase."
        ),
        "properties": {
            "Micrófonos": "1 Mid + 1 Side (figura de 8)",
            "Compatibilidad mono": "Perfecta",
            "Particularidad": "La anchura estéreo se decide en la mezcla, no en el directo",
        },
        "relations": {
            "usa patrón": ["figura-8"],
        },
    },
    {
        "id": "decca-tree",
        "category": "estereo",
        "label": "Decca Tree",
        "en_label": "Decca Tree",
        "definition": (
            "Tres micrófonos omnidireccionales en disposición triangular sobre la "
            "orquesta (uno central algo retrasado, dos laterales). Técnica clásica "
            "de Decca Records para grabación orquestal."
        ),
        "properties": {
            "Micrófonos": "3 omnidireccionales",
            "Disposición": "Triángulo sobre la orquesta",
            "Uso típico": "Grabación orquestal y de música clásica",
        },
        "relations": {
            "usa patrón": ["omnidireccional"],
        },
    },
    # --------------------------------------------------------- instrumentos
    {
        "id": "voz",
        "category": "instrumentos",
        "label": "Voz",
        "en_label": "Vocals",
        "definition": (
            "Condensador de diafragma grande en cardioide, filtro antipop, "
            "15-20 cm de distancia. El efecto de proximidad del cardioide se puede "
            "usar como recurso expresivo, acercando o alejando al cantante."
        ),
        "properties": {
            "Micrófono recomendado": "Condensador de diafragma grande",
            "Patrón recomendado": "Cardioide",
            "Distancia típica": "15-20 cm",
            "Trucos": "Ángulo ligeramente fuera de eje para reducir sibilancia",
        },
        "relations": {
            "recomienda tipo": ["condensador-diafragma-grande"],
            "recomienda patrón": ["cardioide"],
        },
    },
    {
        "id": "guitarra-acustica",
        "category": "instrumentos",
        "label": "Guitarra acústica",
        "en_label": "Acoustic guitar",
        "definition": (
            "Apuntar hacia la unión del mástil con el cuerpo (zona del traste 12), "
            "nunca directamente al rosetón — ahí hay demasiado grave y \"boom\". "
            "Un segundo micro cerca del puente añade cuerpo si se necesita."
        ),
        "properties": {
            "Micrófono recomendado": "Condensador de diafragma pequeño",
            "Punto de referencia": "Unión mástil-cuerpo (traste 12), no el rosetón",
            "Distancia típica": "15-30 cm",
        },
        "relations": {
            "recomienda tipo": ["condensador-diafragma-pequeno"],
        },
    },
    {
        "id": "bateria",
        "category": "instrumentos",
        "label": "Batería",
        "en_label": "Drum kit",
        "definition": (
            "Sistema multimicrófono: dinámico dentro y/o fuera del bombo, dinámico o "
            "de clip en la caja (a veces también por debajo para el bordón), pareja "
            "de overheads en XY o AB para platos y conjunto, condensadores en timbales."
        ),
        "properties": {
            "Bombo": "Dinámico especializado (dentro y/o fuera)",
            "Caja": "Dinámico o de clip, arriba y opcionalmente abajo",
            "Overheads": "Par XY o AB, condensador",
            "Timbales": "Condensador de diafragma pequeño con clip",
        },
        "relations": {
            "recomienda tipo": ["dinamico", "condensador-diafragma-pequeno"],
            "recomienda técnica": ["xy", "ab"],
        },
    },
    {
        "id": "ampli-guitarra-electrica",
        "category": "instrumentos",
        "label": "Amplificador de guitarra eléctrica",
        "en_label": "Electric guitar amp",
        "definition": (
            "Dinámico pegado a la rejilla del altavoz. Apuntar al centro del cono da "
            "un sonido más agresivo/nasal; apuntar cerca del borde ('cap edge') da "
            "más brillo y menos distorsión de proximidad. Se puede combinar con un "
            "condensador algo más retirado para capturar la sala."
        ),
        "properties": {
            "Micrófono recomendado": "Dinámico (clásico: cápsula tipo SM57)",
            "Posición": "Pegado a la rejilla, entre el centro y el borde del cono",
            "Combinación habitual": "+ condensador a 1-2 metros para ambiente",
        },
        "relations": {
            "recomienda tipo": ["dinamico"],
        },
    },
    {
        "id": "piano",
        "category": "instrumentos",
        "label": "Piano (de cola)",
        "en_label": "Grand piano",
        "definition": (
            "Con la tapa apoyada en el palillo largo, un par estéreo de "
            "condensadores apunta uno hacia las cuerdas graves y otro hacia las "
            "agudas. Para escenario, un micrófono de superficie dentro de la caja "
            "evita problemas de feedback."
        ),
        "properties": {
            "Grabación": "Par estéreo de condensadores (AB u ORTF), tapa apoyada en palillo largo",
            "Directo/escenario": "Micrófono de superficie (PZM) dentro de la caja",
        },
        "relations": {
            "recomienda técnica": ["ab"],
            "recomienda tipo": ["pzm-boundary"],
        },
    },
]


def concepts_by_id():
    return {c["id"]: c for c in CONCEPTS}


def concepts_by_category(category_key):
    return [c for c in CONCEPTS if c["category"] == category_key]
