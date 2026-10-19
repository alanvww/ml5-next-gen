/*
 * 👋 Hello! This is an ml5.js example made and shared with ❤️.
 * Learn more about the ml5.js project: https://ml5js.org/
 * ml5.js license and Code of Conduct: https://github.com/ml5js/ml5-next-gen/blob/main/LICENSE.md
 *
 * This example demonstrates on-device text generation with ml5.languageModel.
 */

let llm;
let promptInput;
let generateBtn;
let statusText;
let outputText;

async function setup() {
  noCanvas();

  statusText = createP("Initializing on-device language model...");

  // Load Gemma 4 E2B IT powered by Google LiteRT-LM
  llm = await ml5.languageModel("gemma-4-e2b", {
    systemPrompt: "You are a concise, helpful creative coding assistant.",
    temperature: 0.7,
    maxOutputTokens: 256,
    onProgress: (progress) => {
      if (progress.cached) {
        statusText.html("Model loaded from browser OPFS cache.");
      } else if (progress.percent !== null) {
        statusText.html(`Downloading model: ${progress.percent}%`);
      } else {
        const mb = (progress.loaded / (1024 * 1024)).toFixed(1);
        statusText.html(`Downloading model: ${mb} MB`);
      }
    },
  });

  statusText.html("Model ready! Enter a prompt and press Generate.");

  promptInput = createInput(
    "Write a short 3-line poem about generative art in p5.js."
  );
  promptInput.attribute("size", "70");

  generateBtn = createButton("Generate");
  generateBtn.mousePressed(runGeneration);

  outputText = createP("");
}

async function runGeneration() {
  const prompt = promptInput.value().trim();
  if (!prompt || !llm) return;

  statusText.html("Generating response...");
  const result = await llm.generate(prompt);
  statusText.html("Done.");
  outputText.html(result.text.replace(/\n/g, "<br/>"));
}

function keyPressed() {
  if (key === "Enter") {
    runGeneration();
  }
}
