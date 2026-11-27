/**
 * cli/utils/stage-mediapipe.js
 *
 * Places MediaPipe solution assets into the local cache layout. Files are
 * copied from the installed `@mediapipe/*` package when ml5's dependencies
 * are installed, and downloaded from jsDelivr at the registry's pinned
 * version otherwise (for example in a fresh clone without `yarn install`).
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const { downloadToFile, exists } = require("./fetch");

function findInstalledPackage(packageName) {
  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    return {
      dir: path.dirname(packageJsonPath),
      version: require(packageJsonPath).version,
    };
  } catch (error) {
    return null;
  }
}

/**
 * @returns {Promise<{package: string, version: string, source: string}>}
 */
async function stageMediaPipe({
  mediapipe,
  files,
  destination,
  force = false,
}) {
  const installed = findInstalledPackage(mediapipe.package);
  const version = installed ? installed.version : mediapipe.version;
  const cdnBase = `https://cdn.jsdelivr.net/npm/${mediapipe.package}@${version}`;
  await fs.mkdir(destination, { recursive: true });
  for (const file of files) {
    const to = path.join(destination, file);
    if (installed) {
      if (force || !(await exists(to)))
        await fs.copyFile(path.join(installed.dir, file), to);
    } else {
      await downloadToFile(`${cdnBase}/${file}`, to, { force });
    }
  }
  return {
    package: mediapipe.package,
    version,
    source: installed ? "node_modules" : cdnBase,
  };
}

module.exports = { stageMediaPipe, findInstalledPackage };
