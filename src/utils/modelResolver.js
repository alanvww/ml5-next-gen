/**
 * Resolves the `modelPath` option into the URL options the underlying
 * TensorFlow.js / MediaPipe detectors understand (`modelUrl`,
 * `detectorModelUrl`, `landmarkModelUrl`, `solutionPath`).
 *
 * A model folder is recognised in this order:
 *   1. `<modelPath>/manifest.json` written by `ml5 cache prefetch`. It lists
 *      which runtimes and variants are present, so nothing else is probed.
 *   2. The same folder layout without a manifest (files placed by hand).
 *   3. A "leaf" folder that directly contains one `model.json`, or the
 *      MediaPipe solution files.
 */

import {
  MODEL_MANIFEST_SCHEMA,
  getMediaPipeFiles,
  getModelDirName,
  getModelInfo,
  getTfjsLocalPaths,
  joinUrl,
  resolveVariantName,
} from "./modelRegistry";

const RUNTIME_LABELS = { tfjs: "TensorFlow.js", mediapipe: "MediaPipe" };

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

function isExplicitString(userOptions, key) {
  return typeof userOptions[key] === "string" && userOptions[key].length > 0;
}

/**
 * Fetches and parses a JSON file. Returns undefined for a missing file and
 * for a 200 response that is not JSON, which is what single-page-app dev
 * servers send (their index.html) for any unknown path.
 */
async function fetchJson(url) {
  if (typeof fetch !== "function") return undefined;
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const parsed = JSON.parse(await response.text());
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch (error) {
    return undefined;
  }
}

/**
 * Checks that a binary file is served, without downloading it.
 * Returns true/false, or undefined when the server refuses HEAD requests.
 */
async function binaryFileExists(url) {
  if (typeof fetch !== "function") return false;
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (response.status === 405 || response.status === 501) return undefined;
    if (!response.ok) return false;
    const type =
      (response.headers && response.headers.get("content-type")) || "";
    return !type.includes("text/html");
  } catch (error) {
    return false;
  }
}

async function readManifest(modelPath) {
  const manifest = await fetchJson(joinUrl(modelPath, "manifest.json"));
  if (!manifest || typeof manifest.$schema !== "string") return undefined;
  if (!manifest.$schema.startsWith("ml5-models-manifest")) return undefined;
  return manifest;
}

function manifestVariants(manifest, runtime) {
  const entry = manifest.runtimes && manifest.runtimes[runtime];
  return entry && Array.isArray(entry.variants) ? entry.variants : [];
}

/**
 * Works out which runtimes of one variant a model folder can serve.
 *
 * With a manifest the answer is read from it. Without one the files are
 * probed, and only as far as needed to pick a runtime: `checkTfjs` and
 * `checkMediaPipe` are returned so an error message can probe the rest.
 */
async function inspectModelFolder({
  modelPath,
  modelName,
  variant,
  supportsRuntime,
  explicitRuntime,
}) {
  const tfjsPaths = getTfjsLocalPaths(modelName, variant);
  const mediaPipeFiles = getMediaPipeFiles(modelName, variant);
  const manifest = await readManifest(modelPath);

  if (manifest && manifest.$schema === MODEL_MANIFEST_SCHEMA) {
    const cached = {
      tfjs: manifestVariants(manifest, "tfjs"),
      mediapipe: manifestVariants(manifest, "mediapipe"),
    };
    return {
      source: "manifest",
      tfjs: Boolean(tfjsPaths) && cached.tfjs.includes(variant),
      mediapipe: Boolean(mediaPipeFiles) && cached.mediapipe.includes(variant),
      cached,
    };
  }

  // No manifest (or one from an older CLI): look for the files themselves.
  const checkTfjs = async () => {
    if (!tfjsPaths) return false;
    const models = await Promise.all(
      Object.keys(tfjsPaths).map((key) =>
        fetchJson(joinUrl(modelPath, tfjsPaths[key]))
      )
    );
    return models.every(Boolean);
  };

  // The last MediaPipe file is the variant-specific .tflite when there is
  // one. The small marker file is checked too, for servers that refuse HEAD.
  const checkMediaPipe = async () => {
    if (!mediaPipeFiles) return false;
    const marker = getModelInfo(modelName).mediapipe.marker;
    const variantFile = mediaPipeFiles[mediaPipeFiles.length - 1];
    const [hasMarker, hasVariantFile] = await Promise.all([
      binaryFileExists(joinUrl(modelPath, `mediapipe/${marker}`)),
      binaryFileExists(joinUrl(modelPath, `mediapipe/${variantFile}`)),
    ]);
    if (hasMarker === false || hasVariantFile === false) return false;
    return hasMarker === true || hasVariantFile === true;
  };

  let tfjs = false;
  let mediapipe = false;
  if (explicitRuntime !== "mediapipe") tfjs = await checkTfjs();
  if (supportsRuntime && !tfjs && explicitRuntime !== "tfjs") {
    mediapipe = await checkMediaPipe();
  }
  return { source: "folder", tfjs, mediapipe, checkTfjs, checkMediaPipe };
}

/**
 * Handles a `modelPath` that points straight at the files instead of at the
 * model root: a folder holding one `model.json`, or the MediaPipe solution.
 * @returns {Promise<boolean>} true when the folder was recognised.
 */
async function applyLeafFolder({
  modelPath,
  modelName,
  variant,
  modelConfig,
  userOptions,
  supportsRuntime,
  explicitRuntime,
}) {
  const tfjsPaths = getTfjsLocalPaths(modelName, variant);
  const tfjsKeys = tfjsPaths ? Object.keys(tfjsPaths) : [];
  const info = getModelInfo(modelName);

  if (tfjsKeys.length === 1 && explicitRuntime !== "mediapipe") {
    const leafUrl = joinUrl(modelPath, "model.json");
    if (await fetchJson(leafUrl)) {
      if (supportsRuntime) modelConfig.runtime = "tfjs";
      if (!isExplicitString(userOptions, tfjsKeys[0])) {
        modelConfig[tfjsKeys[0]] = leafUrl;
      }
      return true;
    }
  }

  if (
    supportsRuntime &&
    info.mediapipe &&
    getMediaPipeFiles(modelName, variant) &&
    explicitRuntime !== "tfjs"
  ) {
    if (await binaryFileExists(joinUrl(modelPath, info.mediapipe.marker))) {
      modelConfig.runtime = "mediapipe";
      modelConfig.solutionPath = modelPath;
      return true;
    }
  }
  return false;
}

function prefetchCommand(modelName, variant, runtime) {
  const info = getModelInfo(modelName);
  const parts = ["npx ml5 cache prefetch", modelName];
  if (!info.defaultVariants.includes(variant))
    parts.push(`--variant ${variant}`);
  if (runtime && runtime !== "tfjs") parts.push(`--runtime ${runtime}`);
  return parts.join(" ");
}

function describeCached(cached) {
  const parts = Object.keys(cached)
    .filter((runtime) => cached[runtime].length > 0)
    .map(
      (runtime) => `${RUNTIME_LABELS[runtime]} (${cached[runtime].join(", ")})`
    );
  return parts.length > 0 ? parts.join("; ") : "no model files";
}

function missingFilesError({ modelPath, modelName, variant, runtime, found }) {
  const label = getModelInfo(modelName).label;
  const wanted = runtime
    ? `${RUNTIME_LABELS[runtime]} files for the '${variant}' variant`
    : `files for the '${variant}' variant`;
  const lines = [`ml5: '${modelPath}' does not contain ${label} ${wanted}.`];
  if (found.cached) {
    lines.push(`It contains: ${describeCached(found.cached)}.`);
  } else if (found.tfjs || found.mediapipe) {
    const other = found.tfjs ? "tfjs" : "mediapipe";
    lines.push(
      `It only contains ${RUNTIME_LABELS[other]} files for that variant.`
    );
  }
  lines.push("", "To add the missing files, run this in your project folder:");
  lines.push(`  ${prefetchCommand(modelName, variant, runtime)}`);
  if (runtime) {
    lines.push(
      `Or remove the 'runtime' option to use the files that are there.`
    );
  }
  return new Error(lines.join("\n"));
}

function notFoundError({ modelPath, modelName, variant }) {
  const dir = getModelDirName(modelName);
  const tfjsPaths = getTfjsLocalPaths(modelName, variant) || {};
  const examples = Object.keys(tfjsPaths).map((key) =>
    joinUrl(modelPath, tfjsPaths[key])
  );
  return new Error(
    [
      `ml5: no local model files found at modelPath '${modelPath}' for ${
        getModelInfo(modelName).label
      }.`,
      "",
      "Looked for:",
      `  - ${joinUrl(
        modelPath,
        "manifest.json"
      )} (written by 'ml5 cache prefetch')`,
      ...examples.map((url) => `  - ${url}`),
      "",
      `modelPath should point at the model root, for example './ml5-models/${dir}',`,
      `not at a runtime subfolder like './ml5-models/${dir}/tfjs'.`,
      "The path is relative to your index.html and must be served by a web server (not file://).",
      "",
      "If you have not downloaded the files yet, run this in your project folder:",
      `  ${prefetchCommand(modelName, variant)}`,
    ].join("\n")
  );
}

async function resolveExplicitModelPath({
  modelName,
  variant,
  modelConfig,
  modelPath,
  userOptions,
}) {
  const supportsRuntime = hasOwn(modelConfig, "runtime");
  const explicitRuntime =
    supportsRuntime && userOptions.runtime !== undefined
      ? modelConfig.runtime
      : undefined;

  const found = await inspectModelFolder({
    modelPath,
    modelName,
    variant,
    supportsRuntime,
    explicitRuntime,
  });
  const canUseMediaPipe = supportsRuntime && found.mediapipe;

  let runtime;
  if (explicitRuntime === "mediapipe" && canUseMediaPipe) runtime = "mediapipe";
  else if (explicitRuntime !== "mediapipe" && found.tfjs) runtime = "tfjs";
  else if (!explicitRuntime && canUseMediaPipe) runtime = "mediapipe";

  if (!runtime) {
    const leaf = await applyLeafFolder({
      modelPath,
      modelName,
      variant,
      modelConfig,
      userOptions,
      supportsRuntime,
      explicitRuntime,
    });
    if (leaf) return;
    if (found.source === "folder" && explicitRuntime) {
      // The requested runtime is missing; see whether the other one is there
      // so the error can say what the folder does contain.
      if (explicitRuntime === "mediapipe") found.tfjs = await found.checkTfjs();
      else found.mediapipe = supportsRuntime && (await found.checkMediaPipe());
    }
    if (found.source === "manifest" || found.tfjs || found.mediapipe) {
      throw missingFilesError({
        modelPath,
        modelName,
        variant,
        runtime: explicitRuntime,
        found,
      });
    }
    throw notFoundError({ modelPath, modelName, variant });
  }

  if (runtime === "mediapipe") {
    modelConfig.runtime = "mediapipe";
    if (!isExplicitString(userOptions, "solutionPath")) {
      modelConfig.solutionPath = joinUrl(modelPath, "mediapipe");
    }
    return;
  }

  if (supportsRuntime) modelConfig.runtime = "tfjs";
  const tfjsPaths = getTfjsLocalPaths(modelName, variant);
  Object.keys(tfjsPaths).forEach((key) => {
    // An explicit URL option from the sketch wins over the folder layout.
    if (!isExplicitString(userOptions, key)) {
      modelConfig[key] = joinUrl(modelPath, tfjsPaths[key]);
    }
  });
}

/**
 * Applies the user's `modelPath` option to a model config, in place.
 *
 * @param {Object} args
 * @param {string} args.modelName - Registry key in modelRegistry.json, such as "handpose".
 * @param {string} args.variant - Registry variant the sketch's options select.
 * @param {Object} args.modelConfig - Config that will be passed to the detector.
 * @param {Object} [args.userOptions] - The options object the user passed to ml5.
 * @returns {Promise<Object>} The same `modelConfig` object.
 */
export async function resolveModelUrls({
  modelName,
  variant,
  modelConfig,
  userOptions = {},
}) {
  const modelPath = userOptions.modelPath;
  if (
    modelPath !== "auto" &&
    (typeof modelPath !== "string" || modelPath.length === 0)
  ) {
    return modelConfig;
  }

  const variantKey = resolveVariantName(modelName, variant);
  if (!variantKey) {
    throw new Error(
      `ml5: modelPath is not supported for ${modelName} variant '${variant}'.`
    );
  }

  if (modelPath === "auto") {
    // "auto" uses ./ml5-models/<model> when a prefetch manifest is there and
    // otherwise leaves the config alone, so the model loads from the network.
    const autoRoot = `./ml5-models/${getModelDirName(modelName)}`;
    if (!(await readManifest(autoRoot))) return modelConfig;
    await resolveExplicitModelPath({
      modelName,
      variant: variantKey,
      modelConfig,
      modelPath: autoRoot,
      userOptions,
    });
    return modelConfig;
  }

  await resolveExplicitModelPath({
    modelName,
    variant: variantKey,
    modelConfig,
    modelPath,
    userOptions,
  });
  return modelConfig;
}
