/*
 * 👋 Hello! This is an ml5.js example made and shared with ❤️.
 * Learn more about the ml5.js project: https://ml5js.org/
 * ml5.js license and Code of Conduct: https://github.com/ml5js/ml5-next-gen/blob/main/LICENSE.md
 *
 * This example demonstrates multi-turn streaming chat with ml5.llm (alias for ml5.languageModel).
 */

let llm;
let messageInput;
let sendBtn;
let stopBtn;
let resetBtn;
let statusText;
let streamText;

async function setup() {
  noCanvas();

  statusText = createP("Loading Gemma 4 E2B IT on-device...");

  llm = await ml5.llm("gemma-4-e2b", {
    systemPrompt:
      "You are a friendly creative coding partner for p5.js and ml5.js.",
    temperature: 0.8,
    maxOutputTokens: 512,
    onProgress: (progress) => {
      if (progress.cached) {
        statusText.html("Loaded model from OPFS cache.");
      } else if (progress.percent !== null) {
        statusText.html(`Downloading model: ${progress.percent}%`);
      } else {
        const mb = (progress.loaded / (1024 * 1024)).toFixed(1);
        statusText.html(`Downloading model: ${mb} MB`);
      }
    },
  });

  statusText.html("Ready to chat!");

  messageInput = createInput(
    "Give me an idea for an interactive p5.js sketch."
  );
  messageInput.attribute("size", "65");

  sendBtn = createButton("Send");
  sendBtn.mousePressed(sendChatMessage);

  stopBtn = createButton("Stop");
  stopBtn.mousePressed(() => {
    llm.stop();
    statusText.html("Generation stopped.");
  });

  resetBtn = createButton("Reset Chat");
  resetBtn.mousePressed(async () => {
    await llm.resetChat();
    streamText.html("");
    statusText.html("Conversation history cleared.");
  });

  streamText = createP("");
}

function sendChatMessage() {
  const message = messageInput.value().trim();
  if (!message || !llm) return;

  statusText.html("Streaming response...");
  streamText.html("");

  llm.chatStream(message, (chunk) => {
    streamText.html(chunk.text.replace(/\n/g, "<br/>"));
    if (chunk.done) {
      statusText.html("Ready to chat!");
    }
  });
}

function keyPressed() {
  if (key === "Enter") {
    sendChatMessage();
  }
}
