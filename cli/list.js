/**
 * cli/list.js
 *
 * Implements `ml5 cache list [--out <dir>]` by scanning the cache output
 * directory for model folders that contain a manifest.json.
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const { parseArgs } = require("./utils/args");
const { resolveOutDir } = require("./utils/paths");
const {
  readManifest,
  isMl5Manifest,
  manifestSize,
} = require("./utils/manifest");
const { formatBytes } = require("./utils/size");

/** Names of the subfolders of `out` that hold an ml5 manifest. */
async function findCachedModels(out) {
  let entries = [];
  try {
    entries = await fs.readdir(out, { withFileTypes: true });
  } catch (error) {
    return [];
  }
  const found = [];
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const manifest = await readManifest(path.join(out, entry.name));
    if (isMl5Manifest(manifest)) found.push({ name: entry.name, manifest });
  }
  return found;
}

async function list(args) {
  const { options } = parseArgs(args, { values: ["out"] });
  const out = resolveOutDir(options.out);
  const found = await findCachedModels(out);
  if (found.length === 0) {
    console.log(`No local ml5 model files found in ${out}.`);
    return;
  }
  for (const { name, manifest } of found) {
    const runtimes = Object.keys(manifest.runtimes || {}).map((runtime) => {
      const variants = manifest.runtimes[runtime].variants;
      return Array.isArray(variants)
        ? `${runtime} (${variants.join(", ")})`
        : runtime;
    });
    console.log(
      `${name}: ${runtimes.join("; ")}  ${formatBytes(manifestSize(manifest))}`
    );
  }
}

module.exports = { list, findCachedModels };
