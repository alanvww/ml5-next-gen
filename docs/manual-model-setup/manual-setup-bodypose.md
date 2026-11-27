# Manual setup: BodyPose

This guide shows how to run a BodyPose sketch with model files stored beside your project.

BodyPose has two model families:

- **MoveNet**: the ml5 default. This guide recommends MoveNet TFJS for beginners.
- **BlazePose**: available through TFJS or MediaPipe. It has more options and more files.

## What you will end up with

```text
my-sketch/
  index.html
  sketch.js
  ml5-models/
    bodypose/
      tfjs/
        model/
          model.json
          group*.bin
        detector/
          model.json
          group*.bin
        landmark/
          model.json
          group*.bin
      mediapipe/
        pose_web.binarypb
        pose.js
        pose_landmark_full.tflite
        ...
```

You only need the folder for the path you choose. In your sketch, point `modelPath` at the model root (`./ml5-models/bodypose`), not at the `tfjs/` or `mediapipe/` subfolder.

```js
// MoveNet TFJS, the BodyPose default
ml5.bodyPose({ modelPath: "./ml5-models/bodypose" });

// BlazePose TFJS
ml5.bodyPose("BlazePose", { modelPath: "./ml5-models/bodypose" });

// BlazePose MediaPipe, if you downloaded the mediapipe/ files
ml5.bodyPose("BlazePose", { runtime: "mediapipe", modelPath: "./ml5-models/bodypose" });
```

`"BlazePose"` is the first argument, before the options. Without it, ml5 loads MoveNet.

## Path A: MoveNet TFJS, recommended for beginners

Create this folder:

```text
ml5-models/bodypose/tfjs/model/
```

Download:

- [MoveNet model.json](https://tfhub.dev/google/tfjs-model/movenet/multipose/lightning/1/model.json?tfjs-format=file) → save as `ml5-models/bodypose/tfjs/model/model.json`

Then open `model.json` in a text editor. Find `weightsManifest`, then download every `.bin` file listed in `paths`. Save each `.bin` file in `ml5-models/bodypose/tfjs/model/`.

Use this in your sketch:

```js
ml5.bodyPose({ modelPath: "./ml5-models/bodypose" });
```

This is the default multi-pose model. A sketch that sets `modelType: "SINGLEPOSE_LIGHTNING"` or `"SINGLEPOSE_THUNDER"` needs a different model in its own folder; [`../model-urls.md`](../model-urls.md) has the URLs and folder names.

## Path B: BlazePose TFJS

Create these folders:

```text
ml5-models/bodypose/tfjs/detector/
ml5-models/bodypose/tfjs/landmark/
```

Download:

- [BlazePose detector model.json](https://tfhub.dev/mediapipe/tfjs-model/blazepose_3d/detector/1/model.json?tfjs-format=file) → save as `ml5-models/bodypose/tfjs/detector/model.json`
- [BlazePose landmark model.json](https://tfhub.dev/mediapipe/tfjs-model/blazepose_3d/landmark/full/2/model.json?tfjs-format=file) → save as `ml5-models/bodypose/tfjs/landmark/model.json`

Then open each `model.json` file, find `weightsManifest`, and download every `.bin` shard listed in `paths`.

Use this in your sketch:

```js
ml5.bodyPose("BlazePose", { modelPath: "./ml5-models/bodypose" });
```

These are the files for the default `modelType: "full"`. For `"lite"` or `"heavy"` the landmark model is different and goes in `tfjs/landmark-lite/` or `tfjs/landmark-heavy/`; see [`../model-urls.md`](../model-urls.md).

## Path C: BlazePose MediaPipe

Create this folder:

```text
ml5-models/bodypose/mediapipe/
```

Download these shared files into that folder:

- [pose_web.binarypb](https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose_web.binarypb)
- [pose.js](https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js)
- [pose_solution_packed_assets.data](https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose_solution_packed_assets.data)
- [pose_solution_packed_assets_loader.js](https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose_solution_packed_assets_loader.js)
- [pose_solution_simd_wasm_bin.js](https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose_solution_simd_wasm_bin.js)
- [pose_solution_simd_wasm_bin.wasm](https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose_solution_simd_wasm_bin.wasm)
- [pose_solution_simd_wasm_bin.data](https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose_solution_simd_wasm_bin.data)
- [pose_solution_wasm_bin.js](https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose_solution_wasm_bin.js)
- [pose_solution_wasm_bin.wasm](https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose_solution_wasm_bin.wasm)

Then download the landmark model that matches your sketch's `modelType`:

- Default (`modelType: "full"`): [pose_landmark_full.tflite](https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose_landmark_full.tflite)
- Smaller and usually faster, only with `modelType: "lite"`: [pose_landmark_lite.tflite](https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose_landmark_lite.tflite)
- Largest and usually most accurate, only with `modelType: "heavy"`: [pose_landmark_heavy.tflite](https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose_landmark_heavy.tflite)

If the file does not match `modelType`, ml5 stops with a "no local model files found" error.

You can also browse the files at [jsdelivr's `@mediapipe/pose` page](https://www.jsdelivr.com/package/npm/@mediapipe/pose).

Use this in your sketch:

```js
ml5.bodyPose("BlazePose", { runtime: "mediapipe", modelPath: "./ml5-models/bodypose" });
```

## Run your sketch locally

Do not open `index.html` with `file://`. Use a local server.

The friendliest option for many beginners is the **Live Server** extension in VS Code. Open your sketch folder, click **Go Live**, then open the local URL it gives you.

Or, from your sketch folder, run:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Verify it loaded locally

Open DevTools → Network, reload, and check that model files load from `localhost`. They should not load from `cdn.jsdelivr.net`, `tfhub.dev`, or `storage.googleapis.com`.

If `p5.js` or `ml5.js` still load from a CDN, the sketch will not start without internet. See [What "offline" needs](../offline-mode.md#what-offline-needs).

## See also

- Example: [`../../examples/bodyPose-keypoints-offline-local-model-cli/`](../../examples/bodyPose-keypoints-offline-local-model-cli/)
- Full file reference: [`where-to-download-models.md`](./where-to-download-models.md)
- Troubleshooting: [`troubleshooting.md`](./troubleshooting.md)

## License note

MediaPipe assets are distributed by Google under Apache-2.0. TFJS model weights are distributed by Google through TFHub/Kaggle model hosting. Keep upstream attribution with projects that redistribute `ml5-models/`.
