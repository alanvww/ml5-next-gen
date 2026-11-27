const { parseArgs, splitList } = require("../../../cli/utils/args");
const { parseSelection, runPicker } = require("../../../cli/picker");

describe("CLI argument parsing", () => {
  const spec = { values: ["out", "runtime"], booleans: ["all", "force"] };

  test("flags and positionals can be mixed in any order", () => {
    const { options, positionals } = parseArgs(
      ["--out", "models", "handpose", "--force", "bodypose", "--runtime=both"],
      spec
    );
    expect(options).toEqual({ out: "models", force: true, runtime: "both" });
    expect(positionals).toEqual(["handpose", "bodypose"]);
  });

  test("unknown flags and missing values are errors", () => {
    expect(() => parseArgs(["--runtme", "tfjs"], spec)).toThrow(
      "Unknown option --runtme"
    );
    expect(() => parseArgs(["--out"], spec)).toThrow(
      "Option --out needs a value"
    );
    expect(() => parseArgs(["--out", "--force"], spec)).toThrow(
      "Option --out needs a value"
    );
  });

  test("splitList trims, lowercases and drops empty items", () => {
    expect(splitList(" Lite, FULL ,,")).toEqual(["lite", "full"]);
    expect(splitList(undefined)).toEqual([]);
  });
});

describe("interactive picker", () => {
  beforeEach(() => jest.spyOn(console, "log").mockImplementation(() => {}));

  test("parseSelection accepts numbers, names and 'all'", () => {
    const names = ["handpose", "facemesh", "bodypose"];
    expect(parseSelection("1, bodypose", names)).toEqual([
      "handpose",
      "bodypose",
    ]);
    expect(parseSelection("all", names)).toEqual(names);
    expect(parseSelection("", names)).toEqual([]);
    expect(() => parseSelection("4", names)).toThrow(
      "'4' is not one of the choices."
    );
  });

  function scripted(answers) {
    const queue = [...answers];
    return async () => {
      if (queue.length === 0)
        throw new Error("picker asked more questions than expected");
      return queue.shift();
    };
  }

  test("defaults: one model, tfjs, default variants", async () => {
    // models, runtime, handpose variants, confirm
    const result = await runPicker(scripted(["1", "", "", ""]));
    expect(result).toEqual({
      models: ["handpose"],
      runtime: "tfjs",
      variants: { handpose: ["full"] },
    });
  });

  test("re-asks after an invalid answer and honours explicit variants", async () => {
    // models (invalid, then valid), runtime, bodypose variants, confirm
    const result = await runPicker(
      scripted(["9", "bodypose", "mediapipe", "2,3", "y"])
    );
    expect(result.runtime).toBe("mediapipe");
    // MoveNet has no MediaPipe files, so only BlazePose variants are offered.
    expect(result.variants.bodypose).toEqual([
      "blazepose-lite",
      "blazepose-heavy",
    ]);
  });

  test("returns null when nothing is chosen or the summary is declined", async () => {
    expect(await runPicker(scripted([""]))).toBeNull();
    expect(await runPicker(scripted(["2", "", "", "n"]))).toBeNull();
  });
});
