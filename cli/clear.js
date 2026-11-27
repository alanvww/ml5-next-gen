/**
 * cli/clear.js
 *
 * Implements `ml5 cache clear [model...] [--out <dir>]`.
 *
 * Only folders that contain an ml5 manifest are removed, so a mistyped
 * `--out` (for example `--out .`) cannot delete unrelated project files.
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const { findCachedModels } = require("./list");
const { parseArgs } = require("./utils/args");
const { resolveOutDir } = require("./utils/paths");

async function clear(args) {
  const { options, positionals } = parseArgs(args, { values: ["out"] });
  const out = resolveOutDir(options.out);
  const cached = (await findCachedModels(out)).map((item) => item.name);
  const names =
    positionals.length > 0
      ? positionals.map((name) => name.toLowerCase())
      : cached;
  if (names.length === 0) {
    console.log(`No local ml5 model files found in ${out}.`);
    return;
  }
  for (const name of names) {
    if (!cached.includes(name)) {
      console.log(
        `Skipped ${name}: no ml5 model folder with that name in ${out}.`
      );
      continue;
    }
    await fs.rm(path.join(out, name), { recursive: true, force: true });
    console.log(`Cleared ${path.join(out, name)}`);
  }
  // Remove the cache folder itself once nothing is left in it.
  try {
    if ((await fs.readdir(out)).length === 0) await fs.rmdir(out);
  } catch (error) {}
}

module.exports = { clear };
