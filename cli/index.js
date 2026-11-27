/**
 * cli/index.js
 *
 * Top-level dispatcher for the `ml5` executable. Today the CLI exposes the
 * `cache` command group only, but this file keeps the group check explicit so
 * future non-cache commands can be added without rewriting each subcommand.
 */

const { prefetch } = require("./prefetch");
const { list } = require("./list");
const { clear } = require("./clear");
const { verify } = require("./verify");
const { models } = require("./models");

function help() {
  console.log(`ml5 cache: download ml5 model files so sketches can run without internet

Commands:
  ml5 cache prefetch                     Choose models interactively
  ml5 cache prefetch <model>... [--runtime tfjs|mediapipe|both]
                                [--variant <name>[,<name>]|all] [--out <dir>] [--force]
  ml5 cache prefetch --all               Every model, default variants
  ml5 cache models                       List models and their variants
  ml5 cache list [--out <dir>]           Show what has been downloaded
  ml5 cache verify [model...] [--out <dir>]
  ml5 cache clear [model...] [--out <dir>]

Files go to ./ml5-models/<model>/ unless --out is given. In your sketch:
  ml5.handPose({ modelPath: "./ml5-models/handpose" });
`);
}

module.exports = async function cli(args) {
  // Global help/version flags short-circuit before subcommand routing.
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) return help();
  if (args.includes("--version")) return console.log(require("../package.json").version);
  const [group, command, ...rest] = args;
  if (group !== "cache") return help();
  if (command === "prefetch") return prefetch(rest);
  if (command === "list") return list(rest);
  if (command === "clear") return clear(rest);
  if (command === "verify") return verify(rest);
  if (command === "models") return models(rest);
  return help();
};
