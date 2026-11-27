# Troubleshooting manual model setup

Manual setup is mostly about putting the exact files in the exact folders your sketch expects. If something is not working, start with the Network tab in your browser's developer tools.

## My file saved as `model.json.txt`

Some systems hide file extensions or add `.txt` automatically. The file must be named exactly `model.json`.

On Windows, turn on **View → File name extensions** in File Explorer, then rename `model.json.txt` to `model.json`.

## I see a 404 in the Network tab

A 404 means the browser asked for a file, but your local server could not find it.

Check:

- Is the file actually in your `ml5-models/` folder?
- Is the filename exactly the same, including underscores and capitalization?
- Is `ml5-models/` next to the `index.html` file that opened in the browser?
- Does your `modelPath` match the folder name?

## The console says "no local model files found at modelPath ..."

ml5 could not find model files in the folder `modelPath` points to. The error lists the files it looked for. Open one of those addresses in the browser to see what your local server returns.

Check that `modelPath` points at the model root, such as `./ml5-models/handpose`, not at the `tfjs/` or `mediapipe/` folder inside it.

If the path is right, the files may be for a different option than the sketch uses. `modelType: "lite"`, `refineLandmarks: true` and similar options each need their own files; the folder names in the error show which ones ml5 wanted. For MediaPipe, the `.tflite` file has to match `modelType`.

## The console says "... does not contain ... files for the '...' variant"

The folder is there, but not the files your sketch's options need. For example, `runtime: "mediapipe"` needs the `mediapipe/` folder.

Either download the files for that option (see [`../model-urls.md`](../model-urls.md) for every variant's URL and folder), or change the option to match the files you have.

## The page loads, but nothing is detected

First open DevTools → Console. If ml5 could not load the model, there is an error there; see the two sections above.

If there is no error, make sure your webcam permission is allowed and your face, hand, or body is visible in the video.

When a folder has both `tfjs/` and `mediapipe/` files, ml5 uses TFJS unless the sketch sets `runtime: "mediapipe"`:

```js
ml5.handPose({ runtime: "mediapipe", modelPath: "./ml5-models/handpose" });
```

## I see MIME type or `application/octet-stream` errors

Do not open the page with `file://`. Use a local server, such as VS Code Live Server or:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Files still load from `cdn.jsdelivr.net`, `tfhub.dev`, or `storage.googleapis.com`

ml5 does not quietly switch to the internet when `modelPath` is a folder path: if the files are missing, it stops with an error. So files that still come from the internet usually mean one of these:

- The model that loads them has no `modelPath` option. Each ml5 model in the sketch needs its own.
- `modelPath` is `"auto"`. `"auto"` only uses folders made by `ml5 cache prefetch`. For a folder you filled by hand, write the path, such as `"./ml5-models/handpose"`.
- The request is for `p5.js` or `ml5.js` itself. Those come from `<script>` tags in `index.html`; see [What "offline" needs](../offline-mode.md#what-offline-needs).

## The `model.json` mentions files I did not download

Open `model.json` and look for `weightsManifest`. Every filename in the `paths` list must be downloaded into the same folder as that `model.json`. Keep the names exactly as listed; some models' weight files have no `.bin` ending.

Sometimes a model has one shard. Sometimes it has several. Trust the `model.json` you downloaded.

## The shard count is different from the docs

Model hosts can change how files are split. The important rule is: download every shard listed in your `model.json`.

## Can I use this in the p5.js Web Editor?

The p5.js Web Editor is wonderful for sharing sketches, but it needs the internet itself, and it is not a good place to bundle large local model folders. To run a Web Editor sketch offline, download it and follow [Moving a Web Editor sketch offline](../offline-from-web-editor.md).

## My sketch is in a subfolder. Where does `ml5-models/` go?

`modelPath` is relative to the HTML page that loads your sketch. If your browser opens `my-sketch/index.html`, then `./ml5-models/handpose` means:

```text
my-sketch/
  index.html
  sketch.js
  ml5-models/
    handpose/
```
