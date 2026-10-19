// Copyright (c) 2026 ml5
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

const OPFS_CACHE_DIR = "ml5-litert-models";

/**
 * Convert a model URL into a deterministic, filesystem-safe OPFS filename.
 * @param {string} url
 * @returns {string}
 */
export function urlToCacheKey(url) {
  return String(url)
    .replace(/^https?:\/\//i, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-180);
}

/**
 * Check whether the Origin Private File System (OPFS) API is available.
 * @returns {boolean}
 */
export function isOpfsAvailable() {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.storage) &&
    typeof navigator.storage.getDirectory === "function"
  );
}

/**
 * Check if a value is a ReadableStream-like object.
 * @param {*} value
 * @returns {boolean}
 */
export function isReadableStream(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.getReader === "function"
  );
}

/**
 * Check if a value is a Blob or File instance.
 * @param {*} value
 * @returns {boolean}
 */
export function isBlob(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

/**
 * Read JSON metadata for a cached OPFS entry if it exists.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} metaKey
 * @returns {Promise<object | null>}
 */
async function readCacheMeta(dirHandle, metaKey) {
  try {
    const metaHandle = await dirHandle.getFileHandle(metaKey);
    const metaFile = await metaHandle.getFile();
    const text = await metaFile.text();
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

/**
 * Write JSON metadata for a cached OPFS entry.
 * @param {FileSystemDirectoryHandle} dirHandle
 * @param {string} metaKey
 * @param {object} data
 * @returns {Promise<void>}
 */
async function writeCacheMeta(dirHandle, metaKey, data) {
  const metaHandle = await dirHandle.getFileHandle(metaKey, { create: true });
  const writable = await metaHandle.createWritable();
  await writable.write(JSON.stringify(data));
  await writable.close();
}

/**
 * Create a progress-reporting ReadableStream from a Fetch Response.
 * @param {Response} response
 * @param {function} [onProgress]
 * @returns {ReadableStream<Uint8Array>}
 */
function createProgressStream(response, onProgress) {
  const total = Number(response.headers?.get?.("content-length")) || 0;
  const reader = response.body.getReader();
  let loaded = 0;

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        if (typeof onProgress === "function") {
          onProgress({
            loaded,
            total: total || loaded,
            percent: 100,
            cached: false,
          });
        }
        controller.close();
        return;
      }

      loaded += value.byteLength;
      if (typeof onProgress === "function") {
        const percent = total > 0 ? Math.round((loaded / total) * 100) : null;
        onProgress({ loaded, total, percent, cached: false });
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

/**
 * Resolve a model source (URL, Blob, or ReadableStream) for LiteRT-LM Engine.
 * Supports persistent browser caching in OPFS and download progress reporting.
 *
 * @param {string | Blob | ReadableStream<Uint8Array>} modelSource
 * @param {object} [options]
 * @param {boolean} [options.cache=true]
 * @param {function} [options.onProgress]
 * @returns {Promise<string | Blob | ReadableStream<Uint8Array>>}
 */
export async function resolveModelSource(modelSource, options = {}) {
  const { cache = true, onProgress } = options;

  if (isBlob(modelSource)) {
    if (typeof onProgress === "function") {
      onProgress({
        loaded: modelSource.size,
        total: modelSource.size,
        percent: 100,
        cached: true,
      });
    }
    return modelSource;
  }

  if (isReadableStream(modelSource)) {
    return modelSource;
  }

  if (typeof modelSource !== "string") {
    throw new Error(
      "Invalid model source provided to ml5.languageModel. Expected a model preset name, URL string, Blob, or ReadableStream."
    );
  }

  // Attempt OPFS cache lookup and persistence when enabled
  if (cache && isOpfsAvailable()) {
    try {
      const root = await navigator.storage.getDirectory();
      const dirHandle = await root.getDirectoryHandle(OPFS_CACHE_DIR, {
        create: true,
      });
      const cacheKey = urlToCacheKey(modelSource);
      const metaKey = `${cacheKey}.meta.json`;

      // Check existing cached entry
      const meta = await readCacheMeta(dirHandle, metaKey);
      if (meta && meta.completed && meta.size > 0) {
        try {
          const existingHandle = await dirHandle.getFileHandle(cacheKey);
          const existingFile = await existingHandle.getFile();
          if (existingFile && existingFile.size === meta.size) {
            if (typeof onProgress === "function") {
              onProgress({
                loaded: existingFile.size,
                total: existingFile.size,
                percent: 100,
                cached: true,
              });
            }
            return existingFile;
          }
        } catch (err) {
          // Cache miss or corrupted file; proceed to re-download
        }
      }

      // Download and stream into OPFS if createWritable is supported
      const fileHandle = await dirHandle.getFileHandle(cacheKey, {
        create: true,
      });
      if (typeof fileHandle.createWritable === "function") {
        // Clear any previous completion metadata before writing
        try {
          await dirHandle.removeEntry(metaKey);
        } catch (err) {
          // Ignore if metaKey did not exist
        }

        const response = await fetch(modelSource, {
          credentials: "same-origin",
        });
        if (!response.ok || !response.body) {
          throw new Error(
            `Failed to fetch language model from ${modelSource} (HTTP ${response.status})`
          );
        }

        const total = Number(response.headers?.get?.("content-length")) || 0;
        const reader = response.body.getReader();
        const writable = await fileHandle.createWritable();
        let loaded = 0;

        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            // eslint-disable-next-line no-await-in-loop
            const { done, value } = await reader.read();
            if (done) break;
            // eslint-disable-next-line no-await-in-loop
            await writable.write(value);
            loaded += value.byteLength;
            if (typeof onProgress === "function") {
              const percent =
                total > 0 ? Math.round((loaded / total) * 100) : null;
              onProgress({ loaded, total, percent, cached: false });
            }
          }
          await writable.close();
        } catch (writeErr) {
          try {
            await writable.abort();
          } catch (abortErr) {
            // Ignore abort error
          }
          throw writeErr;
        }

        await writeCacheMeta(dirHandle, metaKey, {
          url: modelSource,
          size: loaded,
          completed: true,
          timestamp: Date.now(),
        });

        if (typeof onProgress === "function") {
          onProgress({
            loaded,
            total: total || loaded,
            percent: 100,
            cached: false,
          });
        }

        return await fileHandle.getFile();
      }
    } catch (opfsErr) {
      // If OPFS quota or permissions fail, fall back to direct streaming
      console.warn(
        `🟪ml5.js warns: OPFS model caching unavailable (${opfsErr.message}). Falling back to direct network stream.`
      );
    }
  }

  // Fallback when cache is disabled or OPFS is unavailable
  if (typeof onProgress === "function" && typeof fetch === "function") {
    const response = await fetch(modelSource, { credentials: "same-origin" });
    if (!response.ok || !response.body) {
      throw new Error(
        `Failed to fetch language model from ${modelSource} (HTTP ${response.status})`
      );
    }
    return createProgressStream(response, onProgress);
  }

  return modelSource;
}

/**
 * Clear cached language models stored in OPFS.
 * @param {string} [modelUrl] - Specific model URL to remove. If omitted, clears all cached models.
 * @returns {Promise<boolean>} True if cache entries were removed.
 */
export async function clearModelCache(modelUrl) {
  if (!isOpfsAvailable()) return false;
  try {
    const root = await navigator.storage.getDirectory();
    if (!modelUrl) {
      await root.removeEntry(OPFS_CACHE_DIR, { recursive: true });
      return true;
    }

    const dirHandle = await root.getDirectoryHandle(OPFS_CACHE_DIR);
    const cacheKey = urlToCacheKey(modelUrl);
    const metaKey = `${cacheKey}.meta.json`;
    await dirHandle.removeEntry(cacheKey).catch(() => {});
    await dirHandle.removeEntry(metaKey).catch(() => {});
    return true;
  } catch (e) {
    return false;
  }
}
