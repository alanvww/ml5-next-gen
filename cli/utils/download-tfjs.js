/**
 * cli/utils/download-tfjs.js
 *
 * Downloads a TFJS model.json file and every weight shard listed in its
 * weightsManifest. This lets the CLI avoid hardcoding shard filenames.
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const { fetchWithRetry, downloadToFile, exists } = require("./fetch");

function toModelJsonUrl(url) {
  if (url.includes("tfhub.dev"))
    return `${url.replace(/\/+$/, "")}/model.json?tfjs-format=file`;
  return url.endsWith("model.json")
    ? url
    : `${url.replace(/\/+$/, "")}/model.json`;
}

function dirnameUrl(url) {
  // Strip `/model.json` and any query string so shard paths resolve beside the
  // fetched model file.
  return url.replace(/\/model\.json(?:\?.*)?$/, "").replace(/\/+$/, "");
}

function toShardUrl(base, shard) {
  if (/^https?:\/\//i.test(shard)) return shard;
  const url = `${base}/${shard}`;
  // tfhub.dev requires the same file-format query for shards as model.json;
  // omitting it can return an HTML redirect/403 instead of binary weights.
  return base.includes("tfhub.dev") ? `${url}?tfjs-format=file` : url;
}

function shardPaths(model) {
  return [
    ...new Set(
      (model.weightsManifest || []).flatMap((group) => group.paths || [])
    ),
  ];
}

/**
 * @returns {Promise<string[]>} File names (relative to `destination`) that
 * make up the model: model.json plus its weight shards.
 */
async function downloadTfjsModel({ url, destination, force = false }) {
  const modelJsonUrl = toModelJsonUrl(url);
  const modelJsonPath = path.join(destination, "model.json");
  let modelJson;
  if (!force && (await exists(modelJsonPath))) {
    modelJson = await fs.readFile(modelJsonPath, "utf8");
  } else {
    modelJson = await (await fetchWithRetry(modelJsonUrl)).text();
  }
  let model;
  try {
    model = JSON.parse(modelJson);
  } catch (error) {
    throw new Error(
      `${modelJsonUrl} did not return a TensorFlow.js model.json file.`
    );
  }
  const base = dirnameUrl(modelJsonUrl);
  const shards = shardPaths(model);
  for (const shard of shards) {
    await downloadToFile(
      toShardUrl(base, shard),
      path.join(destination, shard),
      { force }
    );
  }
  // model.json is written last so its presence means the shards are complete.
  await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(modelJsonPath, modelJson);
  return ["model.json", ...shards];
}

module.exports = { downloadTfjsModel };
