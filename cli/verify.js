/**
 * cli/verify.js
 *
 * Implements `ml5 cache verify [model...] [--out <dir>]` by reading each
 * model's manifest, recomputing size + SHA-256 for each recorded file, and
 * setting a non-zero exit code if any file is missing or changed. With no
 * model names it verifies every cached model.
 */

const path = require("node:path");
const { findCachedModels } = require("./list");
const { parseArgs } = require("./utils/args");
const { resolveOutDir } = require("./utils/paths");
const {
  readManifest,
  isMl5Manifest,
  verifyManifest,
} = require("./utils/manifest");

async function verify(args) {
  const { options, positionals } = parseArgs(args, { values: ["out"] });
  const out = resolveOutDir(options.out);
  const names =
    positionals.length > 0
      ? positionals.map((name) => name.toLowerCase())
      : (await findCachedModels(out)).map((item) => item.name);
  if (names.length === 0)
    throw new Error(`No local ml5 model files found in ${out}.`);
  for (const name of names) {
    const root = path.join(out, name);
    const manifest = await readManifest(root);
    if (!isMl5Manifest(manifest))
      throw new Error(`No manifest found for ${name} in ${out}.`);
    const results = await verifyManifest(root, manifest);
    const failed = results.filter((result) => !result.ok);
    console.log(
      `${failed.length === 0 ? "✓" : "✗"} ${name}: ${
        results.length - failed.length
      }/${results.length} files match the manifest`
    );
    failed.forEach((result) =>
      console.log(`    ✗ ${result.path} is missing or changed`)
    );
    if (failed.length > 0) {
      console.log(`    Repair with: ml5 cache prefetch ${name} --force`);
      process.exitCode = 1;
    }
  }
}

module.exports = { verify };
