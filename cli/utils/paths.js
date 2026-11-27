/**
 * cli/utils/paths.js
 *
 * Centralizes cache path construction. `--out` is resolved relative to the
 * user's current working directory, and each model gets its own folder
 * under it: <out>/<model>/.
 */

const path = require("node:path");

const DEFAULT_OUT = "ml5-models";

function resolveOutDir(outDir) {
  return path.resolve(process.cwd(), outDir || DEFAULT_OUT);
}

function modelRoot(outDir, modelDir) {
  return path.join(resolveOutDir(outDir), modelDir);
}

/** A path the way a sketch would write it: relative to cwd, forward slashes. */
function toSketchPath(absolutePath) {
  const relative = path
    .relative(process.cwd(), absolutePath)
    .split(path.sep)
    .join("/");
  if (relative.startsWith("..") || path.isAbsolute(relative))
    return absolutePath;
  return `./${relative}`;
}

module.exports = { DEFAULT_OUT, resolveOutDir, modelRoot, toSketchPath };
