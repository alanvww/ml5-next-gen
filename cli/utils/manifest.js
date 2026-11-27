/**
 * cli/utils/manifest.js
 *
 * Read, write, and verify <out>/<model>/manifest.json files.
 *
 * The manifest is what `src/utils/modelResolver.js` reads in the browser to
 * learn which runtimes and variants a model folder contains. Its `$schema`
 * value must match MODEL_MANIFEST_SCHEMA in `src/utils/modelRegistry.js`.
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const { sha256File } = require("./sha");

const MANIFEST_SCHEMA = "ml5-models-manifest-v2";

async function readManifest(root) {
  try {
    const content = await fs.readFile(path.join(root, "manifest.json"), "utf8");
    const manifest = JSON.parse(content);
    return manifest && typeof manifest === "object" ? manifest : null;
  } catch (error) {
    return null;
  }
}

/** True for a manifest this CLI version wrote and can extend. */
function isCurrentManifest(manifest) {
  return Boolean(manifest) && manifest.$schema === MANIFEST_SCHEMA;
}

function isMl5Manifest(manifest) {
  return (
    Boolean(manifest) &&
    typeof manifest.$schema === "string" &&
    manifest.$schema.startsWith("ml5-models-manifest")
  );
}

async function writeManifest(root, manifest) {
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}

/** Size + SHA-256 records for files given as POSIX paths relative to root. */
async function describeFiles(root, relativePaths) {
  const files = [];
  for (const relativePath of relativePaths) {
    const fullPath = path.join(root, ...relativePath.split("/"));
    const stat = await fs.stat(fullPath);
    files.push({
      path: relativePath,
      size: stat.size,
      sha256: await sha256File(fullPath),
    });
  }
  return files;
}

async function verifyManifest(root, manifest) {
  // Return per-file results instead of throwing so callers can print every
  // mismatch before choosing the final process exit code.
  const results = [];
  for (const runtime of Object.keys(manifest.runtimes || {})) {
    for (const file of manifest.runtimes[runtime].files || []) {
      const fullPath = path.join(root, ...file.path.split("/"));
      try {
        const stat = await fs.stat(fullPath);
        const sha256 = await sha256File(fullPath);
        results.push({
          ...file,
          runtime,
          ok: stat.size === file.size && sha256 === file.sha256,
        });
      } catch (error) {
        results.push({ ...file, runtime, ok: false });
      }
    }
  }
  return results;
}

function manifestSize(manifest) {
  let total = 0;
  for (const runtime of Object.keys(manifest.runtimes || {})) {
    for (const file of manifest.runtimes[runtime].files || [])
      total += file.size || 0;
  }
  return total;
}

module.exports = {
  MANIFEST_SCHEMA,
  readManifest,
  isCurrentManifest,
  isMl5Manifest,
  writeManifest,
  describeFiles,
  verifyManifest,
  manifestSize,
};
