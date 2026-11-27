/**
 * cli/picker.js
 *
 * Interactive questions for `ml5 cache prefetch` when it is run without model
 * names. `ask` is injected so the flow can be unit tested without a terminal.
 */

const {
  listModels,
  getModel,
  resolveVariants,
  variantSupports,
  RUNTIMES,
} = require("./registry");
const { splitList } = require("./utils/args");

const RUNTIME_CHOICES = ["tfjs", "mediapipe", "both"];

/** Accepts "1,3", "handpose, bodypose" or "all" against a list of names. */
function parseSelection(answer, names) {
  const items = splitList(answer);
  if (items.length === 0) return [];
  if (items.includes("all")) return [...names];
  const selected = [];
  for (const item of items) {
    const byNumber = /^\d+$/.test(item) ? names[Number(item) - 1] : undefined;
    const name = byNumber || names.find((candidate) => candidate === item);
    if (!name) throw new Error(`'${item}' is not one of the choices.`);
    if (!selected.includes(name)) selected.push(name);
  }
  return selected;
}

async function askUntilValid(ask, question, parse) {
  for (;;) {
    try {
      return parse(await ask(question));
    } catch (error) {
      console.log(`  ${error.message}`);
    }
  }
}

/**
 * @param {(question: string) => Promise<string>} ask
 * @returns {Promise<{models: string[], runtime: string, variants: Object<string, string[]>}|null>}
 * null when the user chooses nothing or declines the summary.
 */
async function runPicker(ask) {
  const names = listModels();
  console.log("Which models do you want to use offline?\n");
  names.forEach((name, index) => {
    console.log(`  ${index + 1}) ${name.padEnd(17)} ${getModel(name).label}`);
  });
  const models = await askUntilValid(
    ask,
    '\nEnter numbers or names separated by commas, or "all": ',
    (answer) => parseSelection(answer, names)
  );
  if (models.length === 0) return null;

  console.log("\nWhich runtime should the files be for?\n");
  console.log(
    "  1) tfjs       TensorFlow.js. What ml5 uses unless your sketch sets `runtime`. (default)"
  );
  console.log(
    '  2) mediapipe  Only needed for sketches that set runtime: "mediapipe". Larger download.'
  );
  console.log("  3) both");
  const runtime = await askUntilValid(
    ask,
    "\nEnter a number or name [tfjs]: ",
    (answer) => {
      const selected = parseSelection(answer, RUNTIME_CHOICES);
      if (selected.length > 1)
        throw new Error("Choose one runtime, or 'both'.");
      return selected[0] || "tfjs";
    }
  );

  const variants = {};
  for (const name of models) {
    const model = getModel(name);
    const wanted = runtime === "both" ? RUNTIMES : [runtime];
    const available = Object.keys(model.variants).filter((variant) =>
      wanted.some((item) => variantSupports(model, variant, item))
    );
    const defaults = resolveVariants(model).filter((variant) =>
      available.includes(variant)
    );
    if (available.length === 0) {
      console.log(`\n${model.label} has no ${runtime} files; leaving it out.`);
      continue;
    }
    if (available.length === 1) {
      variants[name] = available;
      continue;
    }
    console.log(`\n${model.label} comes in several variants:\n`);
    available.forEach((variant, index) => {
      const mark = defaults.includes(variant) ? " (default)" : "";
      console.log(
        `  ${index + 1}) ${variant.padEnd(38)} ${
          model.variants[variant].description
        }${mark}`
      );
    });
    variants[name] = await askUntilValid(
      ask,
      `\nEnter numbers or names, "all", or press Enter for the default${
        defaults.length > 1 ? "s" : ""
      }: `,
      (answer) => {
        const selected = parseSelection(answer, available);
        return selected.length > 0 ? selected : defaults;
      }
    );
  }

  const chosen = models.filter((name) => variants[name]);
  if (chosen.length === 0) return null;

  console.log("\nAbout to download:");
  chosen.forEach((name) =>
    console.log(`  ${name}: ${variants[name].join(", ")} (${runtime})`)
  );
  const confirmed = await ask("\nContinue? [Y/n] ");
  if (/^n/i.test(confirmed.trim())) return null;
  return { models: chosen, runtime, variants };
}

module.exports = { runPicker, parseSelection };
