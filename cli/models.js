/**
 * cli/models.js
 *
 * Implements `ml5 cache models`, a discovery command that prints every model
 * the CLI can stage, its variants, and which runtimes each variant supports.
 */

const {
  RUNTIMES,
  listModels,
  getModel,
  variantSupports,
} = require("./registry");

async function models() {
  for (const name of listModels()) {
    const model = getModel(name);
    console.log(`${name}  (${model.label})`);
    for (const variant of Object.keys(model.variants)) {
      const runtimes = RUNTIMES.filter((runtime) =>
        variantSupports(model, variant, runtime)
      ).join(", ");
      const mark = model.defaultVariants.includes(variant) ? "*" : " ";
      console.log(
        `  ${mark} ${variant.padEnd(38)} ${runtimes.padEnd(16)} ${
          model.variants[variant].description
        }`
      );
    }
    console.log("");
  }
  console.log(
    "* downloaded by default. Choose others with --variant <name>[,<name>] or --variant all."
  );
}

module.exports = { models };
