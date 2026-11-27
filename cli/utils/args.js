/**
 * cli/utils/args.js
 *
 * Minimal argument parser shared by every `ml5 cache` subcommand.
 * Supports `--flag`, `--option value`, `--option=value`, and positionals in
 * any order. Unknown flags are errors so typos do not get treated as models.
 */

function parseArgs(args, { values = [], booleans = [] } = {}) {
  const options = {};
  const positionals = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const [name, inlineValue] = arg.slice(2).split(/=(.*)/s);
    if (booleans.includes(name)) {
      options[name] = true;
    } else if (values.includes(name)) {
      const value = inlineValue !== undefined ? inlineValue : args[++i];
      if (value === undefined || value.startsWith("--"))
        throw new Error(`Option --${name} needs a value.`);
      options[name] = value;
    } else {
      throw new Error(
        `Unknown option --${name}. Run 'ml5 cache --help' for usage.`
      );
    }
  }
  return { options, positionals };
}

/** Splits comma-separated list values such as `--variant lite,full`. */
function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

module.exports = { parseArgs, splitList };
