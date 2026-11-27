# Moving a Web Editor sketch offline

This guide takes a sketch that works in the [p5.js Web Editor](https://editor.p5js.org/) and turns it into a folder on your computer that runs with no internet connection.

You need [Node.js](https://nodejs.org/) installed, and an internet connection while you set things up.

## Why a sketch needs the internet

A Web Editor sketch downloads three things every time it starts:

1. **p5.js**, from a `<script src="https://...">` tag in `index.html`
2. **ml5.js**, from another `<script src="https://...">` tag
3. **Model files**, which ml5 fetches when you call `ml5.handPose()` and friends

Offline, each of these has to be a file in your project folder. The steps below replace them one at a time.

## 1. Download the sketch

In the Web Editor choose **File → Download**. Unzip it. You get a folder like this:

```text
my-sketch/
  index.html
  sketch.js
  style.css
```

Open a terminal in that folder. Every command below runs there.

## 2. Make the libraries local

Open `index.html` and find every `<script>` tag whose `src` starts with `https://`:

```html
<script src="https://cdn.jsdelivr.net/npm/p5@2.3.2/lib/p5.js"></script>
<script src="https://unpkg.com/ml5@1/dist/ml5.min.js"></script>
```

Download each one into the sketch folder. Use the exact URLs from **your** `index.html`:

```bash
curl -L -o p5.js https://cdn.jsdelivr.net/npm/p5@2.3.2/lib/p5.js
```

```bash
curl -L -o ml5.min.js https://unpkg.com/ml5@1/dist/ml5.min.js
```

(You can also open each URL in a browser and use **Save Page As**.)

Then change the tags to point at the files:

```html
<script src="p5.js"></script>
<script src="ml5.min.js"></script>
```

Do the same for anything else loaded from `https://`: `p5.sound`, web fonts, images, or sounds referenced by URL in `sketch.js`.

> **Until `modelPath` is in an ml5 release**, the ml5 file from the CDN does not understand step 4. Build one from a clone of the ml5-next-gen repo instead (`yarn install`, then `yarn build`) and copy `dist/ml5.min.js` into your sketch folder.

## 3. Download the model files

```bash
npx ml5 cache prefetch
```

The command asks which models your sketch uses and downloads them into `ml5-models/`. If you already know, name them:

```bash
npx ml5 cache prefetch handpose
```

If your sketch sets `modelType`, `refineLandmarks`, `runtime`, or uses `"BlazePose"`, check the [variants table](./offline-mode.md#variants) so you download the files that match.

## 4. Tell the sketch where the model files are

Add `modelPath` to the options of each ml5 model in `sketch.js`:

```js
// before
handPose = await ml5.handPose();

// after
handPose = await ml5.handPose({ modelPath: "./ml5-models/handpose" });
```

If you already pass options, add it to them:

```js
faceMesh = await ml5.faceMesh({
  maxFaces: 1,
  modelPath: "./ml5-models/facemesh",
});
```

For bodyPose with a model name, the options come second:

```js
bodyPose = await ml5.bodyPose("BlazePose", { modelPath: "./ml5-models/bodypose" });
```

## 5. Run it with a local server

Double-clicking `index.html` does not work; browsers block model loading on `file://` pages. Start a small web server in the sketch folder instead:

```bash
npx serve
```

or, if you have Python:

```bash
python3 -m http.server 8000
```

Open the `http://localhost:...` address it prints. The VS Code **Live Server** extension works too.

Use `localhost` in the address, not the computer's IP address: browsers only allow the webcam on `localhost` or `https://` pages.

## 6. Test it offline

Turn Wi-Fi off, quit and reopen the browser, and load the page again. If it works now, it will work at the venue.

If the page is blank or stuck:

- Open DevTools → **Console** and read the first error.
- Open DevTools → **Network**, reload, and look for requests that are not to `localhost`. Each one is something still coming from the internet; go back to step 2.

Your folder should now look like this, and it is everything you need to copy to another computer:

```text
my-sketch/
  index.html
  sketch.js
  style.css
  p5.js
  ml5.min.js
  ml5-models/
    handpose/
      manifest.json
      tfjs/
```

On the other computer you only need a local web server (step 5). `npx serve` itself needs the internet the first time it runs, so install it beforehand (`npm install -g serve`) or use Python.

## Using a bundler instead

If your project uses a bundler such as Vite, the libraries are already bundled, so step 2 does not apply. Only the model files need attention:

- Put them in the folder your bundler serves as-is. For Vite that is `public/`:

  ```bash
  npx ml5 cache prefetch handpose --out public/ml5-models
  ```

- Use a path from the site root in the sketch:

  ```js
  ml5.handPose({ modelPath: "/ml5-models/handpose" });
  ```

If `npm install ml5` stops with `patch-package: not found`, install it with `npm install ml5 --ignore-scripts`.

## More

- [Offline mode reference](./offline-mode.md): all CLI commands, variants, runtimes, troubleshooting
- [Manual model setup](./manual-model-setup/README.md): downloading model files by hand, without Node
