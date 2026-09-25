/**
 * H8 — Story Mode: WorldState, CharacterState, StoryPack, PerspectiveHandoff.
 * Semilla jugable: selector → capítulo → escenas → encuentro (chess|go) → handoff.
 */
(function (global) {
  "use strict";

  function uid(prefix) {
    return global.AiramH2.uid(prefix);
  }

  function createWorldState(partial) {
    return {
      id: uid("world"),
      chapter_id: null,
      scene_id: null,
      flags: {},
      secrets_known: [],
      locations_visited: [],
      tension_arc: 0,
      ...(partial || {}),
    };
  }

  function createCharacterState(partial) {
    return {
      id: uid("cstate"),
      character_id: (partial && partial.character_id) || "sismico",
      knowledge: (partial && partial.knowledge) || [],
      aptitudes: (partial && partial.aptitudes) || [
        "escuchar",
        "recordar",
        "jugar",
      ],
      relationships: (partial && partial.relationships) || {},
      music_profile_id:
        (partial && partial.music_profile_id) ||
        (partial && partial.character_id) ||
        "sismico",
      mood: (partial && partial.mood) || "calma",
      ...(partial || {}),
    };
  }

  /** One story pack = chapter with scene nodes */
  const PACK_MICELIO_V01 = {
    id: "micelio-v0.1",
    title: "Micelio · Primer arco",
    blurb: "Semilla H8: eliges perspectiva, juegas un encuentro, entregas el relato.",
    chapters: [
      {
        id: "ch1",
        title: "La toma abierta",
        scenes: [
          {
            id: "sc_intro",
            type: "dialogue",
            title: "Entrada",
            body:
              "El laboratorio huele a cable caliente. Alguien tiene que elegir desde qué oído se escucha el mundo.",
            choices: [
              { id: "stay", label: "Quedarme en esta perspectiva", next: "sc_brief" },
              { id: "look", label: "Mirar el tablero del encuentro", next: "sc_brief" },
            ],
            unlocks: [],
          },
          {
            id: "sc_brief",
            type: "dialogue",
            title: "Encargo",
            body:
              "Hay un encuentro: ajedrez o go. El GameState alimentará tu música. Si cambias de personaje a mitad, es un PerspectiveHandoff.",
            choices: [
              { id: "chess", label: "Encuentro de ajedrez", next: "sc_chess", game: "chess" },
              { id: "go", label: "Encuentro de go 9×9", next: "sc_go", game: "go" },
            ],
            unlocks: ["knows_encounter"],
          },
          {
            id: "sc_chess",
            type: "encounter",
            title: "Tablero · ajedrez",
            body: "Juega unos plies. AIRAM comenta y el mundo armónico recuerda la tonalidad.",
            game: "chess",
            choices: [
              { id: "done_chess", label: "Cerrar encuentro", next: "sc_handoff" },
            ],
            unlocks: ["played_chess"],
          },
          {
            id: "sc_go",
            type: "encounter",
            title: "Tablero · go",
            body: "9×9 lite. Cada piedra es un Frame; la captura tensa el relato.",
            game: "go",
            choices: [
              { id: "done_go", label: "Cerrar encuentro", next: "sc_handoff" },
            ],
            unlocks: ["played_go"],
          },
          {
            id: "sc_handoff",
            type: "handoff",
            title: "PerspectiveHandoff",
            body:
              "Puedes entregar la perspectiva a otro personaje. Conservas WorldState; cambia CharacterState y el perfil musical.",
            choices: [
              { id: "to_atomico", label: "Pasar a Atómico", handoff: "atomico", next: "sc_coda" },
              { id: "to_marza", label: "Pasar a Marza", handoff: "marza", next: "sc_coda" },
              { id: "to_sismico", label: "Volver a Sísmico", handoff: "sismico", next: "sc_coda" },
              { id: "stay_end", label: "Seguir con el mismo", next: "sc_coda" },
            ],
            unlocks: ["handoff_ready"],
          },
          {
            id: "sc_coda",
            type: "dialogue",
            title: "Coda",
            body:
              "Arco corto cerrado. El núcleo juego→semántica→música sigue vivo; el Story Mode solo lo enmarca.",
            choices: [
              { id: "restart", label: "Reiniciar arco", next: "sc_intro", restart: true },
            ],
            unlocks: ["chapter_done"],
          },
        ],
      },
    ],
  };

  function getPack() {
    return PACK_MICELIO_V01;
  }

  function findScene(pack, sceneId) {
    for (let i = 0; i < pack.chapters.length; i++) {
      const ch = pack.chapters[i];
      for (let j = 0; j < ch.scenes.length; j++) {
        if (ch.scenes[j].id === sceneId) {
          return { chapter: ch, scene: ch.scenes[j] };
        }
      }
    }
    return null;
  }

  function startRun(characterId) {
    const pack = getPack();
    const ch = pack.chapters[0];
    const scene = ch.scenes[0];
    return {
      pack_id: pack.id,
      world: createWorldState({
        chapter_id: ch.id,
        scene_id: scene.id,
        locations_visited: [scene.id],
      }),
      character: createCharacterState({
        character_id: characterId || "sismico",
        music_profile_id: characterId || "sismico",
        knowledge: ["lab_airam"],
      }),
      handoff_log: [],
    };
  }

  /**
   * Apply a choice. May trigger PerspectiveHandoff.
   */
  function applyChoice(run, choice) {
    if (!run || !choice) return run;
    const pack = getPack();
    const found = findScene(pack, run.world.scene_id);
    if (!found) return run;

    if (choice.restart) {
      const fresh = startRun(run.character.character_id);
      fresh.handoff_log = run.handoff_log.slice();
      return fresh;
    }

    if (choice.handoff) {
      const from = run.character.character_id;
      const to = choice.handoff;
      run.handoff_log.push({
        at: new Date().toISOString(),
        from: from,
        to: to,
        scene_id: run.world.scene_id,
        world_id: run.world.id,
      });
      run.character = createCharacterState({
        character_id: to,
        music_profile_id: to,
        knowledge: (run.character.knowledge || []).concat(["handoff_from_" + from]),
        aptitudes: run.character.aptitudes,
        relationships: Object.assign({}, run.character.relationships, {
          previous: from,
        }),
      });
      run.world.flags.last_handoff = from + "→" + to;
    }

    if (choice.next) {
      run.world.scene_id = choice.next;
      if (run.world.locations_visited.indexOf(choice.next) < 0) {
        run.world.locations_visited.push(choice.next);
      }
      const next = findScene(pack, choice.next);
      if (next && next.scene.unlocks) {
        next.scene.unlocks.forEach(function (u) {
          if (run.character.knowledge.indexOf(u) < 0) {
            run.character.knowledge.push(u);
          }
          run.world.flags[u] = true;
        });
      }
      if (next && next.scene.type === "encounter") {
        run.world.flags.active_game = next.scene.game || choice.game || null;
      } else if (choice.game) {
        run.world.flags.active_game = choice.game;
      }
    }

    run.world.tension_arc = Math.min(
      1,
      (run.world.locations_visited.length - 1) / 5
    );
    return run;
  }

  function currentScene(run) {
    if (!run) return null;
    const hit = findScene(getPack(), run.world.scene_id);
    return hit ? hit.scene : null;
  }

  function canKnowSecret(characterState, secretId) {
    return (
      characterState &&
      characterState.knowledge &&
      characterState.knowledge.indexOf(secretId) >= 0
    );
  }

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.Story = {
    createWorldState: createWorldState,
    createCharacterState: createCharacterState,
    getPack: getPack,
    startRun: startRun,
    applyChoice: applyChoice,
    currentScene: currentScene,
    findScene: findScene,
    canKnowSecret: canKnowSecret,
    PACK: PACK_MICELIO_V01,
  };
})(typeof window !== "undefined" ? window : globalThis);
