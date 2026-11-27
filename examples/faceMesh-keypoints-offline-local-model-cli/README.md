# FaceMesh keypoints, offline (local model files via the CLI)

FaceMesh on live video with **no internet connection**: the model files, p5.js
and ml5.js are all loaded from local files.

Setup takes three commands, run once while online. See
[`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

The only difference from the regular `faceMesh-keypoints` example is the
`modelPath` option in `sketch.js`:

```js
ml5.faceMesh({ modelPath: "./ml5-models/facemesh" });
```

and the local `p5.js` script tag in `index.html`.

See also: [`docs/offline-mode.md`](../../docs/offline-mode.md).
