/**
 * cli/prefetch.js
 *
 * Implements `ml5 cache prefetch [model...]`.
 *
 * Per model, this:
 *   1. Works out which variants and runtimes to stage (flags, or the
 *      interactive picker when no model is named).
 *   2. Downloads TFJS model.json + weight shards into <out>/<model>/tfjs/.
 *   3. Copies or downloads MediaPipe assets into <out>/<model>/mediapipe/.
 *   4. Writes <out>/<model>/manifest.json listing the staged runtimes,
 *      variants, and a size + SHA-256 record for every file.
 *
 * Running prefetch again adds to what is already there: variants and
 * runtimes from earlier runs stay in the folder and in the manifest.
 */

const path = require("node:path");
const readline = require("node:readline/promises");
const pkg = require("../package.json");
const { runPicker } = require("./picker");
const {
  RUNTIMES,
  listModels,
  getModel,
  resolveVariants,
  variantSupports,
  getTfjsParts,
  getMediaPipeFiles,
  getCoveredVariants,
} = require("./registry");
const { parseArgs, splitList } = require("./utils/args");
const { downloadTfjsModel } = require("./utils/download-tfjs");
const {
  MANIFEST_SCHEMA,
  readManifest,
  isCurrentManifest,
  writeManifest,
  describeFiles,
  manifestSize,
} = require("./utils/manifest");
const { modelRoot, toSketchPath } = require("./utils/paths");
const { log } = require("./utils/progress");
const { formatBytes } = require("./utils/size");
const { stageMediaPipe } = require("./utils/stage-mediapipe");

const USAGE =
  "Usage: ml5 cache prefetch [model...] [--all] [--runtime tfjs|mediapipe|both] [--variant <name>[,<name>]|all] [--out <dir>] [--force]";

function union(a, b) {
  return [...new Set([...a, ...b])];
}

async function selectWithPicker() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await runPicker((question) => rl.question(question));
  } finally {
    rl.close();
  }
}

/** Turns argv into a list of { model, variants } jobs plus shared options. */
async function planJobs(args) {
  const { options, positionals } = parseArgs(args, {
    values: ["out", "runtime", "variant"],
    booleans: ["all", "force", "yes", "quiet"],
  });
  const runtime = (options.runtime || "tfjs").toLowerCase();
  if (!["tfjs", "mediapipe", "both"].includes(runtime))
    throw new Error("--runtime must be tfjs, mediapipe, or both");
  const shared = {
    out: options.out,
    force: Boolean(options.force),
    quiet: Boolean(options.quiet),
  };

  const names = options.all ? listModels() : positionals;
  if (names.length > 0) {
    const requested = splitList(options.variant);
    const jobs = names.map((name) => {
      const model = getModel(name);
      // A model the user named must be staged; with --all, models that do
      // not have the requested runtime are skipped instead.
      return {
        model,
        variants: resolveVariants(model, requested),
        strict: !options.all,
      };
    });
    return { ...shared, runtime, jobs };
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      `${USAGE}\n\nName at least one model (${listModels().join(
        ", "
      )}) or pass --all.`
    );
  }
  const picked = await selectWithPicker();
  if (!picked) return { ...shared, runtime, jobs: [] };
  const jobs = picked.models.map((name) => ({
    model: getModel(name),
    variants: picked.variants[name],
  }));
  return { ...shared, runtime: picked.runtime, jobs };
}

async function stageTfjs({ model, variants, root, force, quiet }) {
  const parts = getTfjsParts(model, variants);
  const sources = {};
  const files = [];
  for (const part of parts) {
    log(`    ${part.path}`, quiet);
    const names = await downloadTfjsModel({
      url: part.url,
      destination: path.join(root, ...part.path.split("/")),
      force,
    });
    sources[part.path] = part.url;
    files.push(...names.map((name) => `${part.path}/${name}`));
  }
  return {
    variants: getCoveredVariants(model, variants, "tfjs"),
    sources,
    files: await describeFiles(root, files),
  };
}

async function stageMediaPipeRuntime({ model, variants, root, force }) {
  const files = getMediaPipeFiles(model, variants);
  const staged = await stageMediaPipe({
    mediapipe: model.mediapipe,
    files,
    destination: path.join(root, "mediapipe"),
    force,
  });
  return {
    ...staged,
    variants: getCoveredVariants(model, variants, "mediapipe"),
    files: await describeFiles(
      root,
      files.map((file) => `mediapipe/${file}`)
    ),
  };
}

async function prefetchModel({
  model,
  variants,
  strict,
  runtime,
  out,
  force,
  quiet,
}) {
  const root = modelRoot(out, model.dir);
  const previous = await readManifest(root);
  const runtimes = isCurrentManifest(previous) ? { ...previous.runtimes } : {};
  const wanted = runtime === "both" ? RUNTIMES : [runtime];

  log(`Fetching ${model.name} (${variants.join(", ")})…`, quiet);
  let staged = 0;
  for (const name of wanted) {
    const supported = variants.filter((variant) =>
      variantSupports(model, variant, name)
    );
    const skipped = variants.filter((variant) => !supported.includes(variant));
    if (skipped.length > 0 && runtime !== "both") {
      log(`  ! ${skipped.join(", ")} has no ${name} files; skipping.`, quiet);
    }
    if (supported.length === 0) continue;
    // Keep variants staged by earlier runs so the manifest stays complete.
    const all = union(
      (runtimes[name] && runtimes[name].variants) || [],
      supported
    );
    if (name === "tfjs") {
      log("  → downloading TensorFlow.js files", quiet);
      runtimes.tfjs = await stageTfjs({
        model,
        variants: all,
        root,
        force,
        quiet,
      });
    } else {
      log("  → staging MediaPipe files", quiet);
      runtimes.mediapipe = await stageMediaPipeRuntime({
        model,
        variants: all,
        root,
        force,
      });
      log(`    from ${runtimes.mediapipe.source}`, quiet);
    }
    staged += 1;
  }
  if (staged === 0) {
    const reason = `${
      model.name
    }: none of the requested variants (${variants.join(
      ", "
    )}) are available for --runtime ${runtime}.`;
    if (strict) throw new Error(reason);
    log(`  ! skipped ${reason}`, quiet);
    return null;
  }

  const manifest = {
    $schema: MANIFEST_SCHEMA,
    model: model.name,
    createdAt: new Date().toISOString(),
    ml5Version: pkg.version,
    runtimes,
  };
  await writeManifest(root, manifest);
  log(
    `✓ ${model.name} ready at ${toSketchPath(root)} (${formatBytes(
      manifestSize(manifest)
    )})`,
    quiet
  );
  return root;
}

async function prefetch(args) {
  const plan = await planJobs(args);
  if (plan.jobs.length === 0) {
    log("Nothing selected.", plan.quiet);
    return;
  }
  const roots = [];
  for (const job of plan.jobs) {
    const root = await prefetchModel({
      ...job,
      runtime: plan.runtime,
      out: plan.out,
      force: plan.force,
      quiet: plan.quiet,
    });
    if (root) roots.push({ model: job.model, root });
  }
  if (roots.length === 0) return;
  log(
    "\nUse the files in your sketch with the modelPath option, for example:",
    plan.quiet
  );
  for (const { model, root } of roots) {
    // modelPath is a URL relative to index.html. When the files were written
    // outside the current folder we cannot know that URL, so show the
    // conventional one.
    const sketchPath = toSketchPath(root);
    const shown = path.isAbsolute(sketchPath)
      ? `./ml5-models/${model.dir}`
      : sketchPath;
    log(`  ml5.${model.function}({ modelPath: "${shown}" });`, plan.quiet);
  }
  log(
    "modelPath is relative to your index.html. See docs/offline-mode.md for the rest of the offline setup.",
    plan.quiet
  );
}

module.exports = { prefetch, planJobs, USAGE };
