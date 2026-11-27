# Offline mode

Use offline mode when a sketch has to keep working without internet access: an exhibition, a classroom with unreliable Wi-Fi, a kiosk that restarts every morning.

Coming from the p5.js Web Editor? Start with [Moving a Web Editor sketch offline](./offline-from-web-editor.md).
Prefer not to use a terminal? See the [manual model setup guides](./manual-model-setup/README.md).

## What "offline" needs

By default a sketch downloads three things from the internet every time it starts. All three have to be local files:

| What | Where it normally comes from | Offline |
| --- | --- | --- |
| Model files | `tfhub.dev`, `cdn.jsdelivr.net` | `ml5 cache prefetch` puts them in `./ml5-models/` |
| ml5.js | a CDN `<script>` tag | a local `ml5.min.js` file, or ml5 bundled into your app |
| p5.js (if you use it) | a CDN `<script>` tag | a local `p5.js` file, or p5 bundled into your app |

A sketch that still has a CDN `<script>` tag shows a blank page when the network is gone, even if the model files are local.

The page also has to be served by a local web server (`http://localhost:...`). Browsers block model loading on pages opened with `file://`.

## Quick start

In your project folder, next to `index.html`:

```bash
npx ml5 cache prefetch handpose
```

Then point `modelPath` at the folder it created:

```js
let handPose = await ml5.handPose({ modelPath: "./ml5-models/handpose" });
```

`modelPath` is relative to `index.html`, like an image path.

> **Until this feature is in an ml5 release**, run the CLI from a clone of the ml5-next-gen repo instead of `npx ml5`:
>
> ```bash
> node bin/ml5.js cache prefetch handpose --out /path/to/your-project/ml5-models
> ```
>
> No `yarn install` is needed for that command. Your sketch also needs an ml5 build that understands `modelPath`: run `yarn install` and `yarn build`, then copy `dist/ml5.min.js` into your project.

## Choosing what to download

Run the command with no model names and it asks which models, runtime and variants you want:

```bash
npx ml5 cache prefetch
```

Or name them:

```bash
npx ml5 cache prefetch handpose facemesh bodypose
```

```bash
npx ml5 cache prefetch --all
```

See every model and variant the CLI knows:

```bash
npx ml5 cache models
```

### Variants

Some options in your sketch select a different model file. If your sketch uses one of these, download the matching variant with `--variant`:

| Model | Sketch option | Variant to download |
| --- | --- | --- |
| handPose | default (`modelType: "full"`) | `full` (default) |
| handPose | `modelType: "lite"` | `lite` |
| faceMesh | default | `default` (default) |
| faceMesh | `refineLandmarks: true` | `refined` |
| bodyPose | default (MoveNet multi-pose) | `movenet` (default) |
| bodyPose | `modelType: "SINGLEPOSE_LIGHTNING"` | `movenet-singlepose-lightning` |
| bodyPose | `modelType: "SINGLEPOSE_THUNDER"` | `movenet-singlepose-thunder` |
| bodyPose | `"BlazePose"` | `blazepose` (default) |
| bodyPose | `"BlazePose"`, `modelType: "lite"` | `blazepose-lite` |
| bodyPose | `"BlazePose"`, `modelType: "heavy"` | `blazepose-heavy` |

```bash
npx ml5 cache prefetch handpose --variant lite
```

```bash
npx ml5 cache prefetch bodypose --variant all
```

Running `prefetch` again adds to the folder; variants you downloaded earlier stay.

If the sketch asks for a variant that is not in the folder, ml5 stops with an error that names the missing variant and the command that downloads it.

### Runtimes

handPose, faceMesh and bodyPose (BlazePose) can run on two runtimes. `prefetch` downloads the TensorFlow.js files by default, because that is what ml5 uses unless a sketch sets `runtime`.

```bash
npx ml5 cache prefetch handpose --runtime mediapipe
```

```bash
npx ml5 cache prefetch handpose --runtime both
```

- `tfjs` (default): smaller downloads, roughly 2 to 13 MB per model. The ml5 maintainers recommend it for installations that run for hours.
- `mediapipe`: larger, roughly 16 to 21 MB per model for the default variant. Only needed when your sketch sets `runtime: "mediapipe"`.

In the sketch:

```js
ml5.handPose({ runtime: "mediapipe", modelPath: "./ml5-models/handpose" });
```

Without a `runtime` option, ml5 uses the TensorFlow.js files when they are in the folder and the MediaPipe files otherwise.

## What the CLI writes

```text
ml5-models/
  handpose/
    manifest.json        which runtimes and variants are here, plus a checksum per file
    tfjs/
      detector/          model.json + weight files
      landmark/
    mediapipe/           only with --runtime mediapipe or both
```

Point `modelPath` at the **model root**: the folder that contains `manifest.json`, such as `./ml5-models/handpose`.

Use `--out <dir>` to write somewhere other than `./ml5-models`.

## Other commands

```bash
npx ml5 cache list
```

```bash
npx ml5 cache verify
```

```bash
npx ml5 cache clear handpose
```

- `list` shows what has been downloaded and how large it is.
- `verify` re-checks every file against the checksums in `manifest.json`. Run it after copying the folder to another machine or a USB stick.
- `clear` deletes model folders. It only removes folders that contain an ml5 manifest.

All commands accept `--out <dir>`.

## Checklist before an exhibition

1. Run `npx ml5 cache verify` on the machine that will run the piece.
2. Turn Wi-Fi off, restart the browser, and load the sketch. This is the only test that proves nothing still depends on the network.
3. In DevTools → Network, confirm every request goes to `localhost`.
4. Use `modelPath: "./ml5-models/<model>"`, not `"auto"`, so a missing folder is an error instead of a silent attempt to use the network.
5. Prefer the default TensorFlow.js runtime for pieces that run all day.

## `modelPath` reference

| Value | Behaviour |
| --- | --- |
| `"./ml5-models/handpose"` | Load from that folder. An error if the files for the sketch's options are not there. |
| `"auto"` | Use `./ml5-models/<model>` when it exists, otherwise load from the internet as usual. Handy for a sketch that is shared both ways. |
| not set | Load from the internet as usual. |

URL options you set yourself (`detectorModelUrl`, `landmarkModelUrl`, `modelUrl`, `solutionPath`) take priority over `modelPath`.

`modelPath` also accepts folders you filled by hand, without a `manifest.json`, as long as they use the layout above. See the [manual model setup guides](./manual-model-setup/README.md).

## Examples

- `examples/handPose-keypoints-offline-local-model-cli/`
- `examples/faceMesh-keypoints-offline-local-model-cli/`
- `examples/bodyPose-keypoints-offline-local-model-cli/`

## Troubleshooting

**"no local model files found at modelPath ..."**
The path is wrong or the page is not served by a web server. The error lists the URLs ml5 tried; open one in the browser to see what the server returns.

**"... does not contain HandPose files for the 'lite' variant"**
The sketch's options need a variant or runtime that was not downloaded. Run the command shown in the error.

**The CLI says it could not reach a host**
Downloads need internet access to `tfhub.dev`, `www.kaggle.com` and `storage.googleapis.com` (TensorFlow.js files) and `cdn.jsdelivr.net` (MediaPipe files when ml5's dependencies are not installed). Behind a proxy, Node ignores `HTTPS_PROXY` by default; run the command with `NODE_USE_ENV_PROXY=1` (supported by recent Node 22 and Node 24 releases).

**The page is blank offline**
`index.html` still loads p5.js or ml5.js from a CDN. See [What "offline" needs](#what-offline-needs).

## Known limitations

- `modelPath` covers handPose, faceMesh and bodyPose. Other ml5 models still load from the internet.
- Do not open sketches with `file://`; use a local web server.
- Strict Content Security Policy rules can block MediaPipe's script loading.
- The p5.js Web Editor needs the internet itself. Download the sketch and follow [Moving a Web Editor sketch offline](./offline-from-web-editor.md).

## Licensing

MediaPipe assets are distributed by Google under Apache-2.0. TFJS model weights are distributed by Google through TFHub/Kaggle model hosting. When redistributing a sketch with bundled `ml5-models/`, retain upstream license and attribution information.
