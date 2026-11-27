/**
 * cli/registry.js
 *
 * Node-side accessors for the offline model registry. The data itself lives in
 * `src/utils/modelRegistry.json`, the same file the browser bundle imports, so
 * the CLI and the runtime cannot drift apart.
 */

const registry = require("../src/utils/modelRegistry.json");

const RUNTIMES = ["tfjs", "mediapipe"];

function listModels() {
  return Object.keys(registry.models);
}

function getModel(name) {
  const key = String(name).toLowerCase();
  const info = registry.models[key];
  if (!info) {
    throw new Error(
      `Unknown model '${name}'. Available models: ${listModels().join(
        ", "
      )}.\nRun 'ml5 cache models' to see variants.`
    );
  }
  return { name: key, ...info };
}

/**
 * Turns the user's --variant values into canonical registry variant keys.
 * No values means the model's default variants; "all" means every variant.
 */
function resolveVariants(model, requested = []) {
  if (requested.length === 0) return [...model.defaultVariants];
  if (requested.includes("all")) return Object.keys(model.variants);
  const resolved = [];
  for (const value of requested) {
    const key = model.variants[value]
      ? value
      : model.aliases && model.aliases[value];
    if (!key || !model.variants[key]) {
      throw new Error(
        `Unknown variant '${value}' for ${
          model.name
        }. Available variants: ${Object.keys(model.variants).join(
          ", "
        )}, or 'all'.`
      );
    }
    if (!resolved.includes(key)) resolved.push(key);
  }
  return resolved;
}

function variantSupports(model, variant, runtime) {
  return Boolean(model.variants[variant] && model.variants[variant][runtime]);
}

/**
 * TFJS models to download for a set of variants. Variants that share a model
 * (BlazePose lite/full/heavy share one detector) produce a single entry.
 * @returns {Array<{key: string, path: string, url: string}>}
 */
function getTfjsParts(model, variants) {
  const byPath = new Map();
  for (const variant of variants) {
    const parts = model.variants[variant].tfjs || {};
    for (const key of Object.keys(parts)) {
      const { path, url } = parts[key];
      const existing = byPath.get(path);
      if (existing && existing.url !== url) {
        throw new Error(
          `Registry error: ${model.name} maps '${path}' to two different URLs.`
        );
      }
      byPath.set(path, { key, path, url });
    }
  }
  return [...byPath.values()];
}

/** MediaPipe files (relative to the package root) for a set of variants. */
function getMediaPipeFiles(model, variants) {
  const files = new Set(model.mediapipe ? model.mediapipe.shared : []);
  for (const variant of variants) {
    for (const file of model.variants[variant].mediapipe || []) files.add(file);
  }
  return [...files];
}

/**
 * Every variant whose files for `runtime` are fully covered by staging
 * `variants`. FaceMesh's MediaPipe variants share one file set, for example,
 * so staging "default" also makes "refined" usable.
 */
function getCoveredVariants(model, variants, runtime) {
  const staged =
    runtime === "tfjs"
      ? new Set(getTfjsParts(model, variants).map((part) => part.path))
      : new Set(getMediaPipeFiles(model, variants));
  return Object.keys(model.variants).filter((variant) => {
    if (!variantSupports(model, variant, runtime)) return false;
    const needed =
      runtime === "tfjs"
        ? getTfjsParts(model, [variant]).map((part) => part.path)
        : model.variants[variant].mediapipe;
    return needed.every((item) => staged.has(item));
  });
}

module.exports = {
  getCoveredVariants,
  RUNTIMES,
  listModels,
  getModel,
  resolveVariants,
  variantSupports,
  getTfjsParts,
  getMediaPipeFiles,
};
