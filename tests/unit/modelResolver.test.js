import {
  getMediaPipeFiles,
  getTfjsLocalPaths,
  joinUrl,
  resolveVariantName,
} from "../../src/utils/modelRegistry";
import { resolveModelUrls } from "../../src/utils/modelResolver";

/**
 * Installs a fake `fetch` that serves the given files.
 * `files` maps a URL to a string body; JSON bodies are passed as objects.
 * Any other URL answers 404, or 200 + an HTML page when `spaFallback` is set
 * (the way single-page-app dev servers answer unknown paths).
 */
function mockServer(files, { spaFallback = false } = {}) {
  const requests = [];
  global.fetch = jest.fn(async (url, init = {}) => {
    requests.push(`${init.method || "GET"} ${url}`);
    const found = Object.prototype.hasOwnProperty.call(files, url);
    if (!found && !spaFallback) {
      return {
        ok: false,
        status: 404,
        headers: new Map(),
        text: async () => "Not found",
      };
    }
    const body = found ? files[url] : "<!DOCTYPE html><html></html>";
    const isHtml = !found;
    return {
      ok: true,
      status: 200,
      headers: new Map([
        ["content-type", isHtml ? "text/html" : "application/octet-stream"],
      ]),
      text: async () =>
        typeof body === "string" ? body : JSON.stringify(body),
    };
  });
  return requests;
}

function manifest(runtimes) {
  return { $schema: "ml5-models-manifest-v2", model: "handpose", runtimes };
}

const ROOT = "./ml5-models/handpose";
const TFJS_MODEL = { modelTopology: {}, weightsManifest: [] };

describe("local model registry helpers", () => {
  test("joinUrl normalizes duplicate slashes at the join boundary", () => {
    expect(joinUrl("./ml5-models/handpose/", "/tfjs/model/model.json")).toBe(
      "./ml5-models/handpose/tfjs/model/model.json"
    );
  });

  test("MediaPipe file lists include shared and variant assets", () => {
    const files = getMediaPipeFiles("handpose", "lite");
    expect(files).toContain("hands.binarypb");
    expect(files).toContain("hand_landmark_lite.tflite");
    expect(files).not.toContain("hand_landmark_full.tflite");
  });

  test("MoveNet has no MediaPipe runtime", () => {
    expect(getMediaPipeFiles("bodypose", "movenet")).toBeUndefined();
  });

  test("variants map to distinct local folders", () => {
    expect(getTfjsLocalPaths("handpose", "full").landmarkModelUrl).toBe(
      "tfjs/landmark/model.json"
    );
    expect(getTfjsLocalPaths("handpose", "lite").landmarkModelUrl).toBe(
      "tfjs/landmark-lite/model.json"
    );
    expect(
      getTfjsLocalPaths("bodypose", "movenet-singlepose-thunder").modelUrl
    ).toBe("tfjs/model-singlepose-thunder/model.json");
  });

  test("variant aliases resolve to registry keys", () => {
    expect(resolveVariantName("bodypose", "heavy")).toBe("blazepose-heavy");
    expect(resolveVariantName("bodypose", "nope")).toBeUndefined();
  });
});

describe("resolveModelUrls", () => {
  test("leaves the config alone without a modelPath", async () => {
    const requests = mockServer({});
    const modelConfig = { runtime: "tfjs" };
    await resolveModelUrls({
      modelName: "handpose",
      variant: "full",
      modelConfig,
      userOptions: {},
    });
    await resolveModelUrls({
      modelName: "handpose",
      variant: "full",
      modelConfig,
      userOptions: { modelPath: false },
    });
    expect(modelConfig).toEqual({ runtime: "tfjs" });
    expect(requests).toEqual([]);
  });

  test("uses the manifest and makes no other request", async () => {
    const requests = mockServer({
      [`${ROOT}/manifest.json`]: manifest({ tfjs: { variants: ["full"] } }),
    });
    const modelConfig = { runtime: "tfjs" };
    await resolveModelUrls({
      modelName: "handpose",
      variant: "full",
      modelConfig,
      userOptions: { modelPath: ROOT },
    });
    expect(modelConfig.detectorModelUrl).toBe(
      `${ROOT}/tfjs/detector/model.json`
    );
    expect(modelConfig.landmarkModelUrl).toBe(
      `${ROOT}/tfjs/landmark/model.json`
    );
    expect(requests).toEqual([`GET ${ROOT}/manifest.json`]);
  });

  test("picks the variant folder that matches the sketch options", async () => {
    mockServer({
      [`${ROOT}/manifest.json`]: manifest({
        tfjs: { variants: ["full", "lite"] },
      }),
    });
    const modelConfig = { runtime: "tfjs" };
    await resolveModelUrls({
      modelName: "handpose",
      variant: "lite",
      modelConfig,
      userOptions: { modelPath: ROOT },
    });
    expect(modelConfig.landmarkModelUrl).toBe(
      `${ROOT}/tfjs/landmark-lite/model.json`
    );
  });

  test("falls back to MediaPipe when that is all the folder has", async () => {
    mockServer({
      [`${ROOT}/manifest.json`]: manifest({
        mediapipe: { variants: ["full"] },
      }),
    });
    const modelConfig = { runtime: "tfjs" };
    await resolveModelUrls({
      modelName: "handpose",
      variant: "full",
      modelConfig,
      userOptions: { modelPath: ROOT },
    });
    expect(modelConfig.runtime).toBe("mediapipe");
    expect(modelConfig.solutionPath).toBe(`${ROOT}/mediapipe`);
  });

  test("an explicit runtime that is not in the folder is an actionable error", async () => {
    mockServer({
      [`${ROOT}/manifest.json`]: manifest({ tfjs: { variants: ["full"] } }),
    });
    const call = () =>
      resolveModelUrls({
        modelName: "handpose",
        variant: "full",
        modelConfig: { runtime: "mediapipe" },
        userOptions: { modelPath: ROOT, runtime: "mediapipe" },
      });
    await expect(call()).rejects.toThrow(
      "does not contain HandPose MediaPipe files for the 'full' variant"
    );
    await expect(call()).rejects.toThrow(
      "npx ml5 cache prefetch handpose --runtime mediapipe"
    );
  });

  test("a variant that was not downloaded is an actionable error", async () => {
    mockServer({
      [`${ROOT}/manifest.json`]: manifest({ tfjs: { variants: ["full"] } }),
    });
    const call = () =>
      resolveModelUrls({
        modelName: "handpose",
        variant: "lite",
        modelConfig: { runtime: "tfjs" },
        userOptions: { modelPath: ROOT },
      });
    await expect(call()).rejects.toThrow("It contains: TensorFlow.js (full).");
    await expect(call()).rejects.toThrow(
      "npx ml5 cache prefetch handpose --variant lite"
    );
  });

  test("works with hand-placed files and no manifest", async () => {
    const requests = mockServer({
      [`${ROOT}/tfjs/detector/model.json`]: TFJS_MODEL,
      [`${ROOT}/tfjs/landmark/model.json`]: TFJS_MODEL,
    });
    const modelConfig = { runtime: "tfjs" };
    await resolveModelUrls({
      modelName: "handpose",
      variant: "full",
      modelConfig,
      userOptions: { modelPath: ROOT },
    });
    expect(modelConfig.detectorModelUrl).toBe(
      `${ROOT}/tfjs/detector/model.json`
    );
    // MediaPipe files are not probed once the TensorFlow.js files are found.
    expect(requests).toEqual([
      `GET ${ROOT}/manifest.json`,
      `GET ${ROOT}/tfjs/detector/model.json`,
      `GET ${ROOT}/tfjs/landmark/model.json`,
    ]);
  });

  test("hand-placed MediaPipe files are used when there are no TFJS files", async () => {
    mockServer({
      [`${ROOT}/mediapipe/hands.binarypb`]: "binary",
      [`${ROOT}/mediapipe/hand_landmark_full.tflite`]: "binary",
    });
    const modelConfig = { runtime: "tfjs" };
    await resolveModelUrls({
      modelName: "handpose",
      variant: "full",
      modelConfig,
      userOptions: { modelPath: ROOT },
    });
    expect(modelConfig.runtime).toBe("mediapipe");
    expect(modelConfig.solutionPath).toBe(`${ROOT}/mediapipe`);
  });

  test("without a manifest, a missing runtime error says what is there", async () => {
    mockServer({
      [`${ROOT}/tfjs/detector/model.json`]: TFJS_MODEL,
      [`${ROOT}/tfjs/landmark/model.json`]: TFJS_MODEL,
    });
    await expect(
      resolveModelUrls({
        modelName: "handpose",
        variant: "full",
        modelConfig: { runtime: "mediapipe" },
        userOptions: { modelPath: ROOT, runtime: "mediapipe" },
      })
    ).rejects.toThrow("It only contains TensorFlow.js files for that variant.");
  });

  test("a server that answers every path with index.html does not look like a model folder", async () => {
    mockServer({}, { spaFallback: true });
    await expect(
      resolveModelUrls({
        modelName: "handpose",
        variant: "full",
        modelConfig: { runtime: "tfjs" },
        userOptions: { modelPath: ROOT },
      })
    ).rejects.toThrow(
      "no local model files found at modelPath './ml5-models/handpose'"
    );
  });

  test("missing folders name the right model in the hint", async () => {
    mockServer({});
    await expect(
      resolveModelUrls({
        modelName: "facemesh",
        variant: "default",
        modelConfig: { runtime: "tfjs" },
        userOptions: { modelPath: "./models/facemesh/tfjs" },
      })
    ).rejects.toThrow("for example './ml5-models/facemesh'");
  });

  test("keeps URL options the sketch set explicitly", async () => {
    mockServer({
      [`${ROOT}/manifest.json`]: manifest({ tfjs: { variants: ["full"] } }),
    });
    const modelConfig = {
      runtime: "tfjs",
      detectorModelUrl: "./custom/model.json",
    };
    await resolveModelUrls({
      modelName: "handpose",
      variant: "full",
      modelConfig,
      userOptions: { modelPath: ROOT, detectorModelUrl: "./custom/model.json" },
    });
    expect(modelConfig.detectorModelUrl).toBe("./custom/model.json");
    expect(modelConfig.landmarkModelUrl).toBe(
      `${ROOT}/tfjs/landmark/model.json`
    );
  });

  test("a single-model leaf folder works for MoveNet", async () => {
    const leaf = "./ml5-models/bodypose/tfjs/model";
    mockServer({ [`${leaf}/model.json`]: TFJS_MODEL });
    const modelConfig = {};
    await resolveModelUrls({
      modelName: "bodypose",
      variant: "movenet",
      modelConfig,
      userOptions: { modelPath: leaf },
    });
    expect(modelConfig.modelUrl).toBe(`${leaf}/model.json`);
  });

  test("models without a runtime option resolve to their TFJS files", async () => {
    const root = "./ml5-models/objectdetection";
    mockServer({
      [`${root}/manifest.json`]: manifest({
        tfjs: { variants: ["lite_mobilenet_v2"] },
      }),
    });
    const modelConfig = { base: "lite_mobilenet_v2", modelUrl: undefined };
    await resolveModelUrls({
      modelName: "objectdetection",
      variant: "lite_mobilenet_v2",
      modelConfig,
      userOptions: { modelPath: root },
    });
    expect(modelConfig).toEqual({
      base: "lite_mobilenet_v2",
      modelUrl: `${root}/tfjs/model/model.json`,
    });
  });

  test("'auto' uses ./ml5-models when a manifest is there and the network otherwise", async () => {
    mockServer({});
    const remote = { runtime: "tfjs" };
    await resolveModelUrls({
      modelName: "handpose",
      variant: "full",
      modelConfig: remote,
      userOptions: { modelPath: "auto" },
    });
    expect(remote.detectorModelUrl).toBeUndefined();

    mockServer({
      [`${ROOT}/manifest.json`]: manifest({ tfjs: { variants: ["full"] } }),
    });
    const local = { runtime: "tfjs" };
    await resolveModelUrls({
      modelName: "handpose",
      variant: "full",
      modelConfig: local,
      userOptions: { modelPath: "auto" },
    });
    expect(local.detectorModelUrl).toBe(`${ROOT}/tfjs/detector/model.json`);
  });
});

describe("resolveModelUrls for the other TensorFlow.js models", () => {
  test("BodyPix options map to their own folder, the default to the short name", async () => {
    const root = "./ml5-models/bodysegmentation";
    mockServer({
      [`${root}/manifest.json`]: manifest({
        tfjs: {
          variants: ["bodypix", "bodypix-mobilenet075-stride8-quant1"],
        },
      }),
    });
    const defaultConfig = {};
    await resolveModelUrls({
      modelName: "bodysegmentation",
      variant: "bodypix-resnet50-stride16-quant2",
      modelConfig: defaultConfig,
      userOptions: { modelPath: root },
    });
    expect(defaultConfig.modelUrl).toBe(
      `${root}/tfjs/model-bodypix/model.json`
    );

    const mobileNetConfig = {};
    await resolveModelUrls({
      modelName: "bodysegmentation",
      variant: "bodypix-mobilenet075-stride8-quant1",
      modelConfig: mobileNetConfig,
      userOptions: { modelPath: root },
    });
    expect(mobileNetConfig.modelUrl).toBe(
      `${root}/tfjs/model-bodypix-mobilenet075-stride8-quant1/model.json`
    );
  });

  test("SelfieSegmentation can use its MediaPipe files", async () => {
    const root = "./ml5-models/bodysegmentation";
    mockServer({
      [`${root}/manifest.json`]: manifest({
        mediapipe: { variants: ["selfie"] },
      }),
    });
    const modelConfig = { runtime: "tfjs", modelType: "general" };
    await resolveModelUrls({
      modelName: "bodysegmentation",
      variant: "selfie",
      modelConfig,
      userOptions: { modelPath: root },
    });
    expect(modelConfig.runtime).toBe("mediapipe");
    expect(modelConfig.solutionPath).toBe(`${root}/mediapipe`);
  });

  test("ARPortraitDepth gets both of its models", async () => {
    const root = "./ml5-models/depthestimation";
    mockServer({
      [`${root}/manifest.json`]: manifest({
        tfjs: { variants: ["arportraitdepth"] },
      }),
    });
    const modelConfig = {};
    await resolveModelUrls({
      modelName: "depthestimation",
      variant: "arportraitdepth",
      modelConfig,
      userOptions: { modelPath: root },
    });
    expect(modelConfig).toEqual({
      depthModelUrl: `${root}/tfjs/depth/model.json`,
      segmentationModelUrl: `${root}/tfjs/segmentation/model.json`,
    });
  });

  test("MobileNet names from the sketch options resolve through aliases", async () => {
    const root = "./ml5-models/imageclassifier";
    mockServer({
      [`${root}/manifest.json`]: manifest({
        tfjs: { variants: ["mobilenet", "darknet-tiny"] },
      }),
    });
    const modelConfig = { version: 2, alpha: 1 };
    await resolveModelUrls({
      modelName: "imageclassifier",
      variant: "mobilenet-v2-100",
      modelConfig,
      userOptions: { modelPath: root },
    });
    expect(modelConfig.modelUrl).toBe(`${root}/tfjs/model/model.json`);

    await expect(
      resolveModelUrls({
        modelName: "imageclassifier",
        variant: "mobilenet-v1-025",
        modelConfig: {},
        userOptions: { modelPath: root },
      })
    ).rejects.toThrow(
      "npx ml5 cache prefetch imageclassifier --variant mobilenet-v1-025"
    );
  });

  test("the feature extractor and the single-model functions resolve", async () => {
    const cases = [
      ["featureextractor", "mobilenet-v2-100", "featureVectorURL", "mobilenet"],
      ["soundclassifier", "speechcommands18w", "modelUrl", "speechcommands18w"],
      ["sentiment", "moviereviews", "modelUrl", "moviereviews"],
    ];
    for (const [modelName, variant, key, staged] of cases) {
      const root = `./ml5-models/${modelName}`;
      mockServer({
        [`${root}/manifest.json`]: manifest({ tfjs: { variants: [staged] } }),
      });
      const modelConfig = {};
      await resolveModelUrls({
        modelName,
        variant,
        modelConfig,
        userOptions: { modelPath: root },
      });
      expect(modelConfig[key]).toBe(`${root}/tfjs/model/model.json`);
    }
  });
});
