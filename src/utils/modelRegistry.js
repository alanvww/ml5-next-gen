/**
 * Browser-side accessors for the offline model registry.
 *
 * The data lives in `modelRegistry.json` so the Node CLI (`cli/registry.js`)
 * can read exactly the same file without a build step. Do not add model URLs
 * or file lists here; edit the JSON instead.
 */

import registry from "./modelRegistry.json";

export const MODEL_MANIFEST_SCHEMA = "ml5-models-manifest-v2";

/**
 * @param {string} modelName - A registry key such as "handpose".
 * @returns {Object|undefined} The registry entry, or undefined when the model
 * has no offline support.
 */
export function getModelInfo(modelName) {
  return registry.models[modelName];
}

export function getModelDirName(modelName) {
  const info = getModelInfo(modelName);
  return (info && info.dir) || modelName;
}

/**
 * Resolves a user-facing variant name (or alias) to a registry variant key.
 * @returns {string|undefined} The canonical variant key, or undefined.
 */
export function resolveVariantName(modelName, variant) {
  const info = getModelInfo(modelName);
  if (!info || !variant) return undefined;
  if (info.variants[variant]) return variant;
  const alias = info.aliases && info.aliases[variant];
  return alias && info.variants[alias] ? alias : undefined;
}

export function getVariantInfo(modelName, variant) {
  const info = getModelInfo(modelName);
  const key = resolveVariantName(modelName, variant);
  return key ? info.variants[key] : undefined;
}

/**
 * Local TFJS `model.json` paths for one variant, keyed by the config option
 * they belong to (`modelUrl`, `detectorModelUrl`, `landmarkModelUrl`).
 * Paths are relative to the model root.
 */
export function getTfjsLocalPaths(modelName, variant) {
  const variantInfo = getVariantInfo(modelName, variant);
  if (!variantInfo || !variantInfo.tfjs) return undefined;
  const paths = {};
  Object.keys(variantInfo.tfjs).forEach((key) => {
    paths[key] = `${variantInfo.tfjs[key].path}/model.json`;
  });
  return paths;
}

/**
 * MediaPipe files one variant needs, relative to the `mediapipe/` folder.
 * Returns undefined when the variant has no MediaPipe runtime (MoveNet).
 */
export function getMediaPipeFiles(modelName, variant) {
  const info = getModelInfo(modelName);
  const variantInfo = getVariantInfo(modelName, variant);
  if (!info || !info.mediapipe || !variantInfo || !variantInfo.mediapipe) {
    return undefined;
  }
  return [...info.mediapipe.shared, ...variantInfo.mediapipe];
}

/**
 * Turns a path that is relative to index.html into a full URL. Loaders that
 * work out sibling file URLs themselves (metadata.json next to model.json)
 * need this.
 */
export function toAbsoluteUrl(url) {
  return typeof document !== "undefined"
    ? new URL(url, document.baseURI).href
    : url;
}

export function joinUrl(base, path) {
  const normalizedBase = String(base).replace(/\/+$/, "");
  const normalizedPath = String(path).replace(/^\/+/, "");
  return `${normalizedBase}/${normalizedPath}`;
}
