/**
 * Opt-in browser cache for TensorFlow.js model files.
 *
 * TensorFlow.js downloads every model.json and weight file through one
 * function, `tf.env().platform.fetch`. `useCache()` wraps that function so the
 * responses are kept in the browser's Cache API and reused on later loads.
 * Because the wrapper sits below every model, no model needs code of its own.
 *
 * What this does not cover:
 *   - MediaPipe runtime files (some are loaded as <script> tags).
 *   - p5.js and ml5.js themselves.
 *   - Pages that are not on https or localhost: the Cache API is missing
 *     there, so models keep loading from the network.
 *
 * The browser may clear this cache. For a sketch that has to work without
 * internet, use the `modelPath` option instead (docs/offline-mode.md).
 */

import * as tf from "@tensorflow/tfjs";

export const MODEL_CACHE_NAME = "ml5-models-v1";

// The platform's own fetch, kept so it can be called on a cache miss.
// It is null until useCache() has been called.
let originalFetch = null;

function getCacheStorage() {
  return typeof caches !== "undefined" ? caches : undefined;
}

/**
 * Only GET requests to another site are cached. Files served next to the
 * sketch, such as a `modelPath` folder, are left alone so edits to them show
 * up right away.
 */
export function isCacheable(url, init) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
  const method = (init && init.method) || "GET";
  if (method.toUpperCase() !== "GET") return false;
  if (typeof location !== "undefined" && url.startsWith(`${location.origin}/`))
    return false;
  return true;
}

/**
 * Wraps a fetch function with a cache lookup.
 *
 * Entries are stored under the URL that was asked for, not the URL a redirect
 * ends at. TF Hub redirects to signed URLs that change on every request, so
 * the requested URL is the only stable key.
 *
 * @param {Function} fetchFunction - The fetch to call on a cache miss.
 * @param {CacheStorage} cacheStorage - Usually the global `caches`.
 * @returns {Function} A function with the same signature as `fetch`.
 */
export function createCachedFetch(fetchFunction, cacheStorage) {
  return async function cachedFetch(input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    if (!isCacheable(url, init)) return fetchFunction(input, init);

    let cache;
    try {
      cache = await cacheStorage.open(MODEL_CACHE_NAME);
      const cached = await cache.match(url);
      if (cached) return cached;
    } catch (error) {
      // The cache cannot be read: load from the network as usual.
      return fetchFunction(input, init);
    }

    const response = await fetchFunction(input, init);
    if (response.ok) {
      try {
        await cache.put(url, response.clone());
      } catch (error) {
        // Storage is full or blocked. The model still loads; it is just not
        // saved for next time.
      }
    }
    return response;
  };
}

async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist();
    }
  } catch (error) {}
  return false;
}

/**
 * Turns on the browser cache for TensorFlow.js model files. Call it once,
 * before creating any ml5 model.
 *
 * It also asks the browser to keep the cache when storage runs low. The
 * browser decides; `persisted` in the result says what it answered.
 *
 * @returns {Promise<{enabled: boolean, persisted: boolean}>}
 */
export function useCache() {
  const cacheStorage = getCacheStorage();
  if (!cacheStorage) {
    console.warn(
      "ml5: the browser cache needs a page on https or localhost. Models will load from the network."
    );
    return Promise.resolve({ enabled: false, persisted: false });
  }
  if (!originalFetch) {
    const platform = tf.env().platform;
    originalFetch = platform.fetch.bind(platform);
    platform.fetch = createCachedFetch(originalFetch, cacheStorage);
  }
  return requestPersistence().then((persisted) => ({
    enabled: true,
    persisted,
  }));
}

/**
 * Reports on the cache: whether it is on, whether the browser promised to
 * keep it, how many files it holds, and how much storage this site uses.
 *
 * @returns {Promise<{enabled: boolean, persisted: boolean, files: number, usage: number, quota: number}>}
 */
export async function cacheStatus() {
  const status = {
    enabled: originalFetch !== null,
    persisted: false,
    files: 0,
    usage: 0,
    quota: 0,
  };
  try {
    const cacheStorage = getCacheStorage();
    if (cacheStorage && (await cacheStorage.has(MODEL_CACHE_NAME))) {
      const cache = await cacheStorage.open(MODEL_CACHE_NAME);
      status.files = (await cache.keys()).length;
    }
    if (navigator.storage) {
      if (navigator.storage.persisted) {
        status.persisted = await navigator.storage.persisted();
      }
      if (navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        status.usage = estimate.usage || 0;
        status.quota = estimate.quota || 0;
      }
    }
  } catch (error) {}
  return status;
}

/**
 * Deletes every model file ml5 has cached in this browser for this site.
 * @returns {Promise<boolean>} true when there was a cache to delete.
 */
export async function clearCache() {
  const cacheStorage = getCacheStorage();
  if (!cacheStorage) return false;
  return cacheStorage.delete(MODEL_CACHE_NAME);
}
