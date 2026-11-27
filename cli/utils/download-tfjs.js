/**
 * cli/utils/download-tfjs.js
 *
 * Downloads a TFJS model.json file and every weight shard listed in its
 * weightsManifest. This lets the CLI avoid hardcoding shard filenames.
 *
 * The model file is always saved as `model.json`, also when the source uses
 * another name (BodyPix has `model-stride16.json`).
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const { fetchWithRetry, downloadToFile, exists } = require("./fetch");

// TF Hub and Kaggle model pages only return the files themselves when the
// request carries `?tfjs-format=file`.
function isHubUrl(url) {
  return url.includes("tfhub.dev") || url.includes("kaggle.com/models/");
}

function toModelJsonUrl(url) {
  if (isHubUrl(url)) return `${url.replace(/\/+$/, "")}/model.json?tfjs-format=file`;
  return url.endsWith(".json") ? url : `${url.replace(/\/+$/, "")}/model.json`;
}

function dirnameUrl(url) {
  // Strip the model file name and any query string so shard paths resolve
  // beside the fetched model file.
  return url.replace(/\/[^/]+\.json(?:\?.*)?$/, "").replace(/\/+$/, "");
}

function toShardUrl(base, shard) {
  if (/^https?:\/\//i.test(shard)) return shard;
  const url = `${base}/${shard}`;
  // tfhub.dev requires the same file-format query for shards as model.json;
  // omitting it can return an HTML redirect/403 instead of binary weights.
  return isHubUrl(base) ? `${url}?tfjs-format=file` : url;
}

function shardPaths(model) {
  return [
    ...new Set(
      (model.weightsManifest || []).flatMap((group) => group.paths || [])
    ),
  ];
}

/**
 * @param {string[]} [extraFiles] - Other files in the same remote folder
 * that the model needs, such as `metadata.json`.
 * @returns {Promise<string[]>} File names (relative to `destination`) that
 * make up the model: model.json, its weight shards, and the extra files.
 */
async function downloadTfjsModel({ url, destination, force = false, extraFiles = [] }) {
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
  for (const name of extraFiles) {
    await downloadToFile(`${base}/${name}`, path.join(destination, name), { force });
  }
  // model.json is written last so its presence means the shards are complete.
  await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(modelJsonPath, modelJson);
  return ["model.json", ...shards, ...extraFiles];
}

module.exports = { downloadTfjsModel, toModelJsonUrl, dirnameUrl, toShardUrl };
