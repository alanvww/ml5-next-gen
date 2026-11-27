# Running this HandPose example offline

A sketch only works without internet when **three things** are local: the model
files, the p5.js library, and the ml5.js library. This example loads all three
from disk. Run every command below from the **root of the ml5-next-gen repo**,
while you still have internet.

## 1. Download the model files

```bash
node bin/ml5.js cache prefetch handpose --out examples/handPose-keypoints-offline-local-model-cli/ml5-models
```

This creates `ml5-models/handpose/` next to this example's `index.html`. The sketch
loads it with:

```js
ml5.handPose({ modelPath: "./ml5-models/handpose" });
```

`modelPath` is relative to `index.html` and points at the model root (the folder
that contains `manifest.json`).

## 2. Download p5.js

```bash
curl -L -o examples/handPose-keypoints-offline-local-model-cli/p5.js https://cdn.jsdelivr.net/npm/p5@2.3.2/lib/p5.js
```

`index.html` loads this local `p5.js` instead of a CDN link.

## 3. Build ml5.js and start the local server

```bash
yarn install
```

```bash
yarn start
```

`yarn start` builds `dist/ml5.js` and serves the repo at `http://localhost:8080`.
Open:

```text
http://localhost:8080/examples/handPose-keypoints-offline-local-model-cli/
```

Do not open `index.html` directly with `file://`; browsers block model loading
from `file://` pages.

## 4. Check that it is really offline

Turn off Wi-Fi and reload the page. The sketch should still load and track.

You can also open DevTools → Network and reload: every request should go to
`localhost`. Nothing should come from `cdn.jsdelivr.net`, `tfhub.dev`,
`kaggle.com`, or `storage.googleapis.com`.

## Options

- Smaller, faster model: run step 1 with `--variant lite` and use
  `ml5.handPose({ modelType: "lite", modelPath: "./ml5-models/handpose" })`.
- MediaPipe runtime: run step 1 with `--runtime mediapipe` and use
  `ml5.handPose({ runtime: "mediapipe", modelPath: "./ml5-models/handpose" })`.

For everything else (other variants, the MediaPipe runtime, using this in your
own project) see [`docs/offline-mode.md`](../../docs/offline-mode.md).

Prefer not to use the terminal? See
[`docs/manual-model-setup/manual-setup-handpose.md`](../../docs/manual-model-setup/manual-setup-handpose.md).
