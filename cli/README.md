# ml5 cache CLI internals

This directory contains the Node source for the `ml5 cache ...` command group.
For user-facing instructions, start with [`../docs/offline-mode.md`](../docs/offline-mode.md).

## Entry flow

```text
bin/ml5.js   shebang executable; forwards process.argv to ../cli/index.js
cli/index.js top-level dispatcher for cache prefetch | list | clear | verify | models
```

`bin/ml5.js` is the published executable declared in `package.json#bin`. The
dispatcher currently accepts only the `cache` group, leaving room for future
non-cache CLI commands without changing the subcommand modules.

The CLI is plain CommonJS with no dependencies outside Node's standard
library, so `node bin/ml5.js ...` works in a fresh clone before `yarn install`.

## Subcommand modules

- `prefetch.js` plans what to stage (from flags or the picker), downloads or
  copies the files, and writes `manifest.json`.
- `picker.js` asks which models, runtime and variants to stage when `prefetch`
  is run without model names. The prompt function is injected so it can be
  unit tested.
- `list.js` enumerates cached model folders from `<out>`.
- `clear.js` removes cached model folders. It only deletes folders that
  contain an ml5 manifest.
- `verify.js` re-hashes cached files and reports manifest mismatches.
- `models.js` prints the registered models, variants and runtimes.

## Shared modules

- `registry.js` wraps `../src/utils/modelRegistry.json` with lookups for
  models, variants and the files each variant needs.
- `utils/args.js` is the argument parser every subcommand uses.
- `utils/fetch.js` wraps `fetch` with retries, an explicit User-Agent,
  readable network errors, and atomic download-to-file.
- `utils/download-tfjs.js` downloads a TFJS `model.json` and its shards.
- `utils/stage-mediapipe.js` copies MediaPipe assets from `node_modules`, or
  downloads them from jsDelivr when the package is not installed.
- `utils/manifest.js` reads, writes, and verifies cache manifests.
- `utils/paths.js` resolves `--out` and builds model folders.
- `utils/sha.js` streams files through SHA-256 hashing.
- `utils/progress.js` centralizes quiet-aware progress logging.
- `utils/size.js` formats byte counts for human-readable output.

## The registry

`src/utils/modelRegistry.json` is the single source of truth for offline
model files. The browser bundle imports it through
`src/utils/modelRegistry.js`; the CLI `require()`s the same file. It is listed
in `package.json#files` so it ships with the published CLI.

Per model it holds:

- `variants`: for each variant, the TFJS models it needs (the config option
  they map to, the local folder, and the source URL) and the MediaPipe
  `.tflite` files it needs. A variant without a `mediapipe` key has no
  MediaPipe runtime (MoveNet).
- `function`: the ml5 function name, used in the usage hint `prefetch` prints.
- `defaultVariants`: what `prefetch <model>` stages without `--variant`.
- `aliases`: alternative `--variant` spellings.
- `mediapipe`: the npm package, its pinned version, the files every variant
  shares, and a small marker file used to recognise a folder without a
  manifest.

`tests/unit/cli/registry.test.js` checks the registry's internal consistency
and that pinned MediaPipe versions and file lists match the installed
packages.

## Key design decisions

- **The folder layout is the contract; the manifest describes it.**
  `src/utils/modelResolver.js` reads `manifest.json` to learn which runtimes
  and variants a folder has, which lets it give precise errors and avoids
  probing for files. Folders filled by hand, without a manifest, still work
  because the layout is fixed by the registry.
- **Default variants keep the simplest folder names** (`tfjs/detector`,
  `tfjs/landmark`, `tfjs/model`); other variants add a suffix
  (`tfjs/landmark-lite`). Variants that share a model share its folder.
- **`prefetch` is additive.** A second run merges into the existing manifest
  instead of replacing it.
- **The default runtime is `tfjs`**, matching what ml5 uses unless a sketch
  sets `runtime`. MediaPipe assets are several times larger.
- **Downloads are atomic.** Files are written to `<name>.part` and renamed, and
  a TFJS `model.json` is written after its shards, so an interrupted run is
  never mistaken for a complete one.
- **TFJS shard filenames are not hardcoded.** They are discovered from each
  downloaded `model.json` file's `weightsManifest`.
- **MediaPipe filenames are hardcoded** because the legacy solution packages
  are no longer updated.

## Manifest format

```json
{
  "$schema": "ml5-models-manifest-v2",
  "model": "handpose",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "ml5Version": "1.4.0",
  "runtimes": {
    "tfjs": {
      "variants": ["full"],
      "sources": { "tfjs/detector": "https://tfhub.dev/..." },
      "files": [{ "path": "tfjs/detector/model.json", "size": 1, "sha256": "..." }]
    },
    "mediapipe": {
      "package": "@mediapipe/hands",
      "version": "0.4.1675469240",
      "source": "node_modules",
      "variants": ["full"],
      "files": []
    }
  }
}
```

`variants` lists every variant the staged files can serve, which can be more
than was asked for (FaceMesh's MediaPipe variants share one set of files). The
`$schema` value must match `MODEL_MANIFEST_SCHEMA` in
`src/utils/modelRegistry.js`; a unit test enforces this.

## Known follow-ups

- handPose, faceMesh, bodyPose and objectDetection are registered. Other
  models need a registry entry and a `resolveModelUrls()` call where they
  load (`src/ObjectDetection/cocossd.js` shows the smallest case).
- The Transformers.js-backed models load through `@huggingface/transformers`
  and need a different mechanism (`env.localModelPath`).
- TFJS sources are `tfhub.dev` URLs, which redirect through Kaggle to signed
  storage URLs. A scheduled job that runs `prefetch --all` would catch a
  broken URL early.

## See also

- [`../src/utils/modelResolver.js`](../src/utils/modelResolver.js): runtime
  consumer of `<out>/<model>/manifest.json`.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md): see "Updating offline model
  files" for the contributor checklist.
