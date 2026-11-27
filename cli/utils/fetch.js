/**
 * cli/utils/fetch.js
 *
 * Network helpers for the cache CLI: a fetch wrapper with retries and
 * readable errors, and an atomic download-to-file helper.
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");
const pkg = require("../../package.json");

// Model hosts answer some default client signatures with 404, so always
// identify the CLI explicitly.
const USER_AGENT = `ml5-cli/${pkg.version} (+https://ml5js.org)`;
const RETRY_DELAYS_MS = [500, 2000, 5000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeNetworkError(url, error) {
  const cause = error.cause && (error.cause.code || error.cause.message);
  const lines = [
    `Could not reach ${new URL(url).host} while downloading ${url}${
      cause ? ` (${cause})` : ""
    }.`,
  ];
  lines.push(
    "Check your internet connection and try again; files that already downloaded are kept."
  );
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (proxy && !process.env.NODE_USE_ENV_PROXY) {
    lines.push(
      "A proxy is configured (HTTPS_PROXY) but Node ignores it by default. Try: NODE_USE_ENV_PROXY=1 ml5 cache prefetch ..."
    );
  }
  return new Error(lines.join("\n"));
}

/** fetch() with retries on network errors, 429 and 5xx responses. */
async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    let response;
    try {
      response = await fetch(url, {
        headers: { "user-agent": USER_AGENT },
        redirect: "follow",
      });
    } catch (error) {
      lastError = describeNetworkError(url, error);
      continue;
    }
    if (response.ok) return response;
    lastError = new Error(`Failed to download ${url}: HTTP ${response.status}`);
    if (response.status !== 429 && response.status < 500) break;
  }
  throw lastError;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Downloads a URL to a file. The body is written to `<file>.part` and renamed
 * when complete, so an interrupted download is never mistaken for a finished
 * file on the next run.
 * @returns {Promise<boolean>} true when downloaded, false when reused.
 */
async function downloadToFile(url, filePath, { force = false } = {}) {
  if (!force && (await exists(filePath))) return false;
  const response = await fetchWithRetry(url);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const partPath = `${filePath}.part`;
  const handle = await fs.open(partPath, "w");
  try {
    if (response.body)
      await pipeline(
        Readable.fromWeb(response.body),
        handle.createWriteStream()
      );
    else await handle.close();
  } catch (error) {
    await fs.rm(partPath, { force: true });
    throw describeNetworkError(url, error);
  }
  await fs.rename(partPath, filePath);
  return true;
}

module.exports = { fetchWithRetry, downloadToFile, exists };
