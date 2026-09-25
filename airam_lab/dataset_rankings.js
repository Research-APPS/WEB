/**
 * H6 — Datasets + rankings (supervised signal only).
 *
 * Cuatro datasets separados:
 *   game_validity  — ¿la semántica del juego es correcta?
 *   music_validity — ¿el mapeo / score es coherente?
 *   aesthetic      — ¿suena bien? (A/B, gusto)
 *   identity       — ¿suena / habla como el personaje?
 *
 * Rankings agregados para inspección humana.
 * NUNCA auto-actualiza ruleset / ScorePlanner / perfiles.
 */
(function (global) {
  "use strict";

  const DATASET_KINDS = [
    {
      id: "game_validity",
      label: "Validez de juego",
      blurb: "Dims / tags / causalidad del tablero",
    },
    {
      id: "music_validity",
      label: "Validez musical",
      blurb: "MusicalState → Score coherente y explicable",
    },
    {
      id: "aesthetic",
      label: "Gusto estético",
      blurb: "Preferencia A/B y placer auditivo",
    },
    {
      id: "identity",
      label: "Identidad de personaje",
      blurb: "¿Suena / habla como el perfil elegido?",
    },
  ];

  const POLICY =
    "H6: rankings son señal supervisada para humanos. " +
    "Nunca reescriben ruleset, MusicalMap ni CharacterMusicProfile automáticamente.";

  function inferKind(review) {
    if (review.dataset_kind) return review.dataset_kind;
    if (review.dimension === "aesthetic" || review.target_type === "score_proposal")
      return "aesthetic";
    if (review.dimension === "identity") return "identity";
    if (
      review.target_type === "musical_state" ||
      review.dimension === "music_validity"
    )
      return "music_validity";
    return "game_validity";
  }

  function verdictScore(verdict) {
    if (verdict === "accept" || verdict === "prefer_a" || verdict === "prefer_b")
      return 1;
    if (verdict === "reject") return -1;
    if (verdict === "modify") return 0.25;
    if (verdict === "unsure") return 0;
    return 0;
  }

  function partition(reviews) {
    const bags = {
      game_validity: [],
      music_validity: [],
      aesthetic: [],
      identity: [],
    };
    (reviews || []).forEach(function (r) {
      const k = inferKind(r);
      if (!bags[k]) bags[k] = [];
      bags[k].push(r);
    });
    return bags;
  }

  function tally(reviews) {
    const t = {
      n: 0,
      accept: 0,
      reject: 0,
      unsure: 0,
      modify: 0,
      prefer_a: 0,
      prefer_b: 0,
      score: 0,
    };
    (reviews || []).forEach(function (r) {
      t.n++;
      const v = r.verdict || "unsure";
      if (t[v] != null) t[v]++;
      else t.unsure++;
      t.score += verdictScore(v);
    });
    t.mean = t.n ? t.score / t.n : 0;
    return t;
  }

  /**
   * Rank keys (profile_id, dimension, ruleset_version, …) within a dataset.
   */
  function rankBy(reviews, keyFn) {
    const map = {};
    (reviews || []).forEach(function (r) {
      const key = keyFn(r) || "(none)";
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return Object.keys(map)
      .map(function (key) {
        const t = tally(map[key]);
        return {
          key: key,
          n: t.n,
          mean: Math.round(t.mean * 1000) / 1000,
          score: Math.round(t.score * 100) / 100,
          accept: t.accept,
          reject: t.reject,
          prefer_a: t.prefer_a,
          prefer_b: t.prefer_b,
        };
      })
      .sort(function (a, b) {
        if (b.mean !== a.mean) return b.mean - a.mean;
        return b.n - a.n;
      });
  }

  function buildReport(reviews) {
    const bags = partition(reviews);
    const byKind = {};
    DATASET_KINDS.forEach(function (dk) {
      const list = bags[dk.id] || [];
      byKind[dk.id] = {
        meta: dk,
        tally: tally(list),
        by_profile: rankBy(list, function (r) {
          return r.profile_id || "(no profile)";
        }),
        by_dimension: rankBy(list, function (r) {
          return r.dimension || "(no dim)";
        }),
        by_ruleset: rankBy(list, function (r) {
          return r.ruleset_version || "(no ruleset)";
        }),
        recent: list.slice().sort(function (a, b) {
          return (b.timestamp || "").localeCompare(a.timestamp || "");
        }).slice(0, 8),
      };
    });
    return {
      policy: POLICY,
      auto_rule: false,
      total_reviews: (reviews || []).length,
      generated_at: new Date().toISOString(),
      by_kind: byKind,
    };
  }

  /**
   * Export one dataset as JSON (for Python/MCI later).
   * Does NOT mutate rules.
   */
  function exportDataset(kind, reviews, extras) {
    const bags = partition(reviews);
    const list = bags[kind] || [];
    return {
      format: "airam-h6-dataset",
      dataset_kind: kind,
      policy: POLICY,
      auto_rule: false,
      exported_at: new Date().toISOString(),
      n: list.length,
      reviews: list,
      ranking_preview: rankBy(list, function (r) {
        return (r.profile_id || "none") + " · " + (r.dimension || "none");
      }).slice(0, 20),
      ...(extras || {}),
    };
  }

  function exportAll(reviews, extras) {
    const out = {
      format: "airam-h6-datasets-bundle",
      policy: POLICY,
      auto_rule: false,
      exported_at: new Date().toISOString(),
      report: buildReport(reviews),
      datasets: {},
      ...(extras || {}),
    };
    DATASET_KINDS.forEach(function (dk) {
      out.datasets[dk.id] = exportDataset(dk.id, reviews, extras);
    });
    return out;
  }

  global.AiramH2 = global.AiramH2 || {};
  global.AiramH2.Datasets = {
    DATASET_KINDS: DATASET_KINDS,
    POLICY: POLICY,
    inferKind: inferKind,
    partition: partition,
    tally: tally,
    rankBy: rankBy,
    buildReport: buildReport,
    exportDataset: exportDataset,
    exportAll: exportAll,
  };
})(typeof window !== "undefined" ? window : globalThis);
