import {
  MODEL_CACHE_NAME,
  createCachedFetch,
  isCacheable,
} from "../../src/utils/modelCache";

const MODEL_URL =
  "https://tfhub.dev/mediapipe/tfjs-model/handpose_3d/detector/full/1/model.json?tfjs-format=file";

// A small in-memory stand-in for the browser's CacheStorage. It keeps what
// the code under test stores, so hits and misses are real, not scripted.
function createFakeCacheStorage() {
  const stores = new Map();
  return {
    stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async match(url) {
          return entries.get(url);
        },
        async put(url, response) {
          entries.set(url, response);
        },
      };
    },
  };
}

function createResponse(body, ok = true) {
  return {
    ok,
    body,
    clone() {
      return createResponse(body, ok);
    },
  };
}

describe("isCacheable", () => {
  test("accepts GET requests to another site", () => {
    expect(isCacheable(MODEL_URL)).toBe(true);
    expect(isCacheable(MODEL_URL, { method: "get" })).toBe(true);
  });

  test("rejects relative paths, such as a modelPath folder", () => {
    expect(isCacheable("./ml5-models/handpose/tfjs/detector/model.json")).toBe(
      false
    );
  });

  test("rejects files on the page's own site", () => {
    expect(isCacheable(`${location.origin}/models/model.json`)).toBe(false);
  });

  test("rejects requests that are not GET", () => {
    expect(isCacheable(MODEL_URL, { method: "POST" })).toBe(false);
  });
});

describe("createCachedFetch", () => {
  test("downloads once, then serves the stored response", async () => {
    const cacheStorage = createFakeCacheStorage();
    const network = jest.fn(async () => createResponse("weights"));
    const cachedFetch = createCachedFetch(network, cacheStorage);

    const first = await cachedFetch(MODEL_URL);
    const second = await cachedFetch(MODEL_URL);

    expect(network).toHaveBeenCalledTimes(1);
    expect(first.body).toBe("weights");
    expect(second.body).toBe("weights");
    expect(cacheStorage.stores.get(MODEL_CACHE_NAME).has(MODEL_URL)).toBe(true);
  });

  test("does not store a failed response", async () => {
    const cacheStorage = createFakeCacheStorage();
    const network = jest.fn(async () => createResponse("not found", false));
    const cachedFetch = createCachedFetch(network, cacheStorage);

    await cachedFetch(MODEL_URL);
    await cachedFetch(MODEL_URL);

    expect(network).toHaveBeenCalledTimes(2);
    expect(cacheStorage.stores.get(MODEL_CACHE_NAME).size).toBe(0);
  });

  test("passes local files straight to the network", async () => {
    const cacheStorage = createFakeCacheStorage();
    const network = jest.fn(async () => createResponse("local"));
    const cachedFetch = createCachedFetch(network, cacheStorage);
    const localPath = "./ml5-models/handpose/tfjs/detector/model.json";

    await cachedFetch(localPath);
    await cachedFetch(localPath);

    expect(network).toHaveBeenCalledTimes(2);
    expect(cacheStorage.stores.size).toBe(0);
  });

  test("still loads when the cache cannot be opened", async () => {
    const cacheStorage = {
      async open() {
        throw new Error("blocked");
      },
    };
    const network = jest.fn(async () => createResponse("weights"));
    const cachedFetch = createCachedFetch(network, cacheStorage);

    const response = await cachedFetch(MODEL_URL);

    expect(response.body).toBe("weights");
    expect(network).toHaveBeenCalledTimes(1);
  });

  test("still loads when storing fails, for example when storage is full", async () => {
    const cacheStorage = {
      async open() {
        return {
          async match() {
            return undefined;
          },
          async put() {
            throw new Error("QuotaExceededError");
          },
        };
      },
    };
    const network = jest.fn(async () => createResponse("weights"));
    const cachedFetch = createCachedFetch(network, cacheStorage);

    const response = await cachedFetch(MODEL_URL);

    expect(response.body).toBe("weights");
  });

  test("lets a network failure reach the caller", async () => {
    const cacheStorage = createFakeCacheStorage();
    const network = jest.fn(async () => {
      throw new Error("offline");
    });
    const cachedFetch = createCachedFetch(network, cacheStorage);

    await expect(cachedFetch(MODEL_URL)).rejects.toThrow("offline");
  });
});
