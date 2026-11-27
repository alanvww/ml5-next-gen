const {
  toModelJsonUrl,
  dirnameUrl,
  toShardUrl,
} = require("../../../cli/utils/download-tfjs");

describe("TFJS download URLs", () => {
  test("TF Hub and Kaggle folders need the file-format query", () => {
    const tfhub = "https://tfhub.dev/mediapipe/tfjs-model/handpose_3d/detector/full/1";
    expect(toModelJsonUrl(tfhub)).toBe(`${tfhub}/model.json?tfjs-format=file`);
    const kaggle =
      "https://www.kaggle.com/models/google/mobilenet-v2/TfJs/100-224-feature-vector/3";
    expect(toModelJsonUrl(kaggle)).toBe(
      `${kaggle}/model.json?tfjs-format=file`
    );
    expect(toShardUrl(kaggle, "group1-shard1of3.bin")).toBe(
      `${kaggle}/group1-shard1of3.bin?tfjs-format=file`
    );
  });

  test("other folders get a plain model.json", () => {
    const folder =
      "https://storage.googleapis.com/tfjs-models/tfjs/sentiment_cnn_v1";
    expect(toModelJsonUrl(`${folder}/`)).toBe(`${folder}/model.json`);
    expect(toShardUrl(folder, "group1-shard1of1")).toBe(
      `${folder}/group1-shard1of1`
    );
  });

  test("a source that names its own JSON file is used as it is", () => {
    const bodyPix =
      "https://storage.googleapis.com/tfjs-models/savedmodel/bodypix/resnet50/quant2/model-stride16.json";
    expect(toModelJsonUrl(bodyPix)).toBe(bodyPix);
    // Weight files are looked up next to that JSON file.
    expect(dirnameUrl(bodyPix)).toBe(
      "https://storage.googleapis.com/tfjs-models/savedmodel/bodypix/resnet50/quant2"
    );
  });

  test("the query string is dropped when working out the weights folder", () => {
    const tfhub = "https://tfhub.dev/google/tfjs-model/movenet/multipose/lightning/1";
    expect(dirnameUrl(toModelJsonUrl(tfhub))).toBe(tfhub);
  });
});
