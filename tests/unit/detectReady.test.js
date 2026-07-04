import * as faceLandmarksDetection from "@tensorflow-models/face-landmarks-detection";
import faceMesh from "../../src/FaceMesh";

jest.mock("@tensorflow-models/face-landmarks-detection", () => ({
  SupportedModels: { MediaPipeFaceMesh: "MediaPipeFaceMesh" },
  createDetector: jest.fn(),
  util: {
    getKeypointIndexByContour: () => ({ lips: [] }),
    getAdjacentPairs: () => [],
  },
}));

// tf.nextFrame() needs requestAnimationFrame, which jsdom does not provide.
if (typeof window.requestAnimationFrame !== "function") {
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
}

const nextTick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

describe("detection before the model has loaded (#302 follow-up)", () => {
  let resolveModel;
  let estimateFaces;

  beforeEach(() => {
    estimateFaces = jest.fn(async () => []);
    faceLandmarksDetection.createDetector.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveModel = () => resolve({ estimateFaces });
        })
    );
  });

  it("detectStart() waits for the model instead of crashing", async () => {
    const media = document.createElement("canvas");
    const instance = faceMesh();

    const firstResult = new Promise((resolve) =>
      instance.detectStart(media, resolve)
    );

    // The media is ready immediately (canvas), but the model is not.
    await nextTick();
    expect(estimateFaces).not.toHaveBeenCalled();

    resolveModel();
    await firstResult;
    expect(estimateFaces).toHaveBeenCalled();

    instance.detectStop();
    await nextTick();
  });

  it("detect() waits for the model instead of crashing", async () => {
    const media = document.createElement("canvas");
    const instance = faceMesh();

    const resultPromise = instance.detect(media);

    await nextTick();
    expect(estimateFaces).not.toHaveBeenCalled();

    resolveModel();
    await expect(resultPromise).resolves.toEqual([]);
  });
});
