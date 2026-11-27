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
