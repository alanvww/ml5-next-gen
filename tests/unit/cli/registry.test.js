const registryData = require("../../../src/utils/modelRegistry.json");
const {
  listModels,
  getModel,
  resolveVariants,
  getTfjsParts,
  getMediaPipeFiles,
  getCoveredVariants,
} = require("../../../cli/registry");
const { findInstalledPackage } = require("../../../cli/utils/stage-mediapipe");
const { MANIFEST_SCHEMA } = require("../../../cli/utils/manifest");
const { MODEL_MANIFEST_SCHEMA } = require("../../../src/utils/modelRegistry");

describe("model registry", () => {
  test("the CLI and the browser agree on the manifest schema", () => {
    expect(MANIFEST_SCHEMA).toBe(MODEL_MANIFEST_SCHEMA);
  });

  test("every model has valid default variants and aliases", () => {
    for (const name of listModels()) {
      const model = getModel(name);
      expect(model.defaultVariants.length).toBeGreaterThan(0);
      model.defaultVariants.forEach((variant) =>
        expect(model.variants[variant]).toBeDefined()
      );
      Object.values(model.aliases || {}).forEach((variant) =>
        expect(model.variants[variant]).toBeDefined()
      );
    }
  });

  test("local TFJS paths are unique per URL", () => {
    for (const name of listModels()) {
      const model = getModel(name);
      // getTfjsParts throws when one path maps to two URLs.
      const parts = getTfjsParts(model, Object.keys(model.variants));
      expect(new Set(parts.map((part) => part.path)).size).toBe(parts.length);
      parts.forEach((part) => expect(part.path).toMatch(/^tfjs\/[a-z0-9-]+$/));
    }
  });

  test("pinned MediaPipe versions and file lists match the installed packages", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    for (const name of listModels()) {
      const model = getModel(name);
      if (!model.mediapipe) continue;
      const installed = findInstalledPackage(model.mediapipe.package);
      expect(installed).not.toBeNull();
      expect(installed.version).toBe(model.mediapipe.version);
      for (const file of getMediaPipeFiles(
        model,
        Object.keys(model.variants)
      )) {
        expect(fs.existsSync(path.join(installed.dir, file))).toBe(true);
      }
    }
  });

  test("resolveVariants handles defaults, aliases, 'all' and typos", () => {
    const bodypose = getModel("bodypose");
    expect(resolveVariants(bodypose)).toEqual(["movenet", "blazepose"]);
    expect(resolveVariants(bodypose, ["heavy", "blazepose-heavy"])).toEqual([
      "blazepose-heavy",
    ]);
    expect(resolveVariants(bodypose, ["all"])).toEqual(
      Object.keys(registryData.models.bodypose.variants)
    );
    expect(() => resolveVariants(bodypose, ["hevy"])).toThrow(
      "Unknown variant 'hevy'"
    );
    expect(() => getModel("handpos")).toThrow("Unknown model 'handpos'");
  });

  test("variants that share files are reported as covered", () => {
    const facemesh = getModel("facemesh");
    expect(getCoveredVariants(facemesh, ["default"], "mediapipe")).toEqual([
      "default",
      "refined",
    ]);
    expect(getCoveredVariants(facemesh, ["default"], "tfjs")).toEqual([
      "default",
    ]);
    const bodypose = getModel("bodypose");
    expect(getCoveredVariants(bodypose, ["blazepose"], "tfjs")).toEqual([
      "blazepose",
    ]);
    expect(getCoveredVariants(bodypose, ["blazepose"], "mediapipe")).toEqual([
      "blazepose",
    ]);
  });
});

describe("registry entries for the other TensorFlow.js models", () => {
  const ALPHA = { 1: "100", 0.75: "075", 0.5: "050", 0.25: "025" };

  test("every TFJS source is an https URL", () => {
    for (const name of listModels()) {
      const model = getModel(name);
      getTfjsParts(model, Object.keys(model.variants)).forEach((part) =>
        expect(part.url).toMatch(/^https:\/\//)
      );
    }
  });

  test("BodyPix variant names match the files they point at", () => {
    const variants = getModel("bodysegmentation").variants;
    const source = (name) => variants[name].tfjs.modelUrl.url;
    const base = "https://storage.googleapis.com/tfjs-models/savedmodel/bodypix";
    const folder = (quant) => (quant === 4 ? "float" : `quant${quant}`);
    let count = 0;
    for (const quant of [1, 2, 4]) {
      for (const stride of [16, 32]) {
        const name = `bodypix-resnet50-stride${stride}-quant${quant}`;
        // The ml5 default is spelled "bodypix"; the long name is an alias.
        const key = resolveVariants(getModel("bodysegmentation"), [name])[0];
        expect(source(key)).toBe(
          `${base}/resnet50/${folder(quant)}/model-stride${stride}.json`
        );
        count += 1;
      }
      for (const multiplier of [1, 0.75, 0.5]) {
        for (const stride of [8, 16]) {
          const name = `bodypix-mobilenet${ALPHA[multiplier]}-stride${stride}-quant${quant}`;
          expect(source(name)).toBe(
            `${base}/mobilenet/${folder(quant)}/${
              ALPHA[multiplier]
            }/model-stride${stride}.json`
          );
          count += 1;
        }
      }
    }
    const bodyPixNames = Object.keys(variants).filter((name) =>
      name.startsWith("bodypix")
    );
    expect(bodyPixNames.length).toBe(count);
  });

  test("MobileNet variant names match the version and alpha in their URL", () => {
    const combos = [
      [2, 1],
      [2, 0.75],
      [2, 0.5],
      [1, 1],
      [1, 0.75],
      [1, 0.5],
      [1, 0.25],
    ];
    const classifier = getModel("imageclassifier");
    const extractor = getModel("featureextractor");
    for (const [version, alpha] of combos) {
      const name = `mobilenet-v${version}-${ALPHA[alpha]}`;
      const classifierKey = resolveVariants(classifier, [name])[0];
      expect(classifier.variants[classifierKey].tfjs.modelUrl.url).toContain(
        `mobilenet_v${version}_${ALPHA[alpha]}_224`
      );
      const extractorKey = resolveVariants(extractor, [name])[0];
      expect(
        extractor.variants[extractorKey].tfjs.featureVectorURL.url
      ).toContain(`mobilenet-v${version}/TfJs/${ALPHA[alpha]}-224`);
    }
  });

  test("the SpeechCommands URL matches the installed package version", () => {
    const { version } = require("@tensorflow-models/speech-commands/package.json");
    const [major, minor] = version.split(".");
    const parts = getTfjsParts(getModel("soundclassifier"), [
      "speechcommands18w",
    ]);
    expect(parts[0].url).toContain(`/speech-commands/v${major}.${minor}/`);
  });

  test("files that sit next to model.json are passed on to the downloader", () => {
    const sound = getTfjsParts(getModel("soundclassifier"), [
      "speechcommands18w",
    ]);
    expect(sound[0].extraFiles).toEqual(["metadata.json"]);
    const sentiment = getTfjsParts(getModel("sentiment"), ["moviereviews"]);
    expect(sentiment[0].extraFiles).toEqual(["metadata.json"]);
    const handpose = getTfjsParts(getModel("handpose"), ["full"]);
    handpose.forEach((part) => expect(part.extraFiles).toEqual([]));
  });

  test("only SelfieSegmentation has MediaPipe files for bodySegmentation", () => {
    const model = getModel("bodysegmentation");
    expect(getCoveredVariants(model, ["selfie"], "mediapipe")).toEqual([
      "selfie",
    ]);
    expect(getMediaPipeFiles(model, ["selfie-landscape"])).toContain(
      "selfie_segmentation_landscape.tflite"
    );
    expect(getCoveredVariants(model, ["bodypix"], "mediapipe")).toEqual([]);
  });
});
