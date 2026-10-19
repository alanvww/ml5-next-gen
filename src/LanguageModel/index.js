// Copyright (c) 2026 ml5
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

/*
On-device Language Model (LLM) powered by Google LiteRT-LM (@litert-lm/core)
*/

import callCallback from "../utils/callcallback";
import handleArguments from "../utils/handleArguments";
import handleOptions, { handleModelName } from "../utils/handleOptions";
import {
  DEFAULT_WASM_PATH,
  LITERT_MODEL_PRESETS,
  LiteRtLanguageModelProvider,
} from "./litert";
import { clearModelCache, isBlob, isReadableStream } from "./modelCache";

const MODEL_OPTIONS = Object.keys(LITERT_MODEL_PRESETS);
const DEFAULT_MODEL_NAME = "gemma-4-e2b";

const LANGUAGE_MODEL_OPTIONS_SCHEMA = {
  runtime: {
    type: "enum",
    enums: ["litert"],
    default: "litert",
  },
  backend: {
    type: "enum",
    enums: ["webgpu", "gpu", "gpu_artisan", "cpu"],
    default: "webgpu",
  },
  systemPrompt: {
    type: "string",
    default: "",
  },
  temperature: {
    type: "number",
    min: 0,
    max: 2,
    default: 0.8,
  },
  topP: {
    type: "number",
    min: 0,
    max: 1,
    default: 0.95,
  },
  topK: {
    type: "number",
    integer: true,
    min: 1,
    default: 40,
  },
  maxTokens: {
    type: "number",
    integer: true,
    min: 1,
    default: 2048,
  },
  maxOutputTokens: {
    type: "number",
    integer: true,
    min: 1,
    default: 512,
  },
  seed: {
    type: "number",
    integer: true,
    default: undefined,
  },
  thinking: {
    type: "boolean",
    default: false,
  },
  cache: {
    type: "boolean",
    default: true,
  },
  wasmPath: {
    type: "string",
    default: DEFAULT_WASM_PATH,
  },
};

/**
 * Check if a string is a direct URL or file path to a custom model artifact.
 * @param {string} value
 * @returns {boolean}
 */
function isCustomModelPathOrUrl(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("blob:")
  ) {
    return true;
  }
  return trimmed.toLowerCase().endsWith(".litertlm");
}

/**
 * Parse inference arguments (`input`, optional `options`, optional `callback`).
 * Supports string prompts as well as message objects or arrays of messages.
 * @param {Array<*>} inputs
 * @param {string} methodName
 * @returns {{ input: string | object | Array, options: object, callback?: function }}
 */
function parseInferenceArgs(inputs, methodName) {
  let input;
  let options = {};
  let callback;

  inputs.forEach((arg) => {
    if (arg === undefined || arg === null) return;
    if (typeof arg === "function") {
      callback = arg;
    } else if (typeof arg === "string" || Array.isArray(arg)) {
      if (input === undefined) {
        input = arg;
      }
    } else if (typeof arg === "object") {
      // Distinguish a Message object ({ role, content }) from options if input is not yet set
      if (
        input === undefined &&
        (typeof arg.role === "string" || arg.content !== undefined)
      ) {
        input = arg;
      } else {
        options = arg;
      }
    }
  });

  if (
    input === undefined ||
    (typeof input === "string" && input.length === 0)
  ) {
    throw new Error(
      `No prompt or message provided to languageModel.${methodName}().`
    );
  }

  return { input, options, callback };
}

/**
 * @class LanguageModel
 * @classdesc On-device language model powered by Google LiteRT-LM (`@litert-lm/core`).
 *
 * @example
 * let llm;
 * let responseText = "Loading model...";
 *
 * async function setup() {
 *   createCanvas(600, 400);
 *   llm = await ml5.languageModel("gemma-4-e2b", {
 *     systemPrompt: "You are a concise creative coding assistant.",
 *   });
 *   const result = await llm.generate("Write a haiku about p5.js.");
 *   responseText = result.text;
 * }
 *
 * function draw() {
 *   background(245);
 *   text(responseText, 20, 40, width - 40, height - 60);
 * }
 */
export class LanguageModel {
  /**
   * Create a LanguageModel instance.
   * @param {string | Blob | ReadableStream<Uint8Array>} [modelNameOrSource="gemma-4-e2b"] - Model preset name (`"gemma-4-e2b"`, `"gemma-4-e4b"`), URL/path to `.litertlm`, `Blob`, or `ReadableStream`.
   * @param {object} [options={}] - Model and generation configuration options.
   * @param {function} [callback] - Optional callback invoked when the model finishes loading.
   */
  constructor(modelNameOrSource, options = {}, callback) {
    this.model = null;
    this.provider = null;
    this.isGenerating = false;

    const rawOptions = options || {};
    this.config = handleOptions(
      rawOptions,
      LANGUAGE_MODEL_OPTIONS_SCHEMA,
      "languageModel"
    );

    if (typeof rawOptions.onProgress === "function") {
      this.config.onProgress = rawOptions.onProgress;
    }

    const explicitSource =
      modelNameOrSource !== undefined ? modelNameOrSource : rawOptions.model;

    if (isBlob(explicitSource) || isReadableStream(explicitSource)) {
      this.modelName = "custom";
      this.modelUrl = explicitSource;
    } else if (isCustomModelPathOrUrl(explicitSource)) {
      this.modelName = "custom";
      this.modelUrl = explicitSource;
    } else {
      this.modelName = handleModelName(
        explicitSource,
        MODEL_OPTIONS,
        DEFAULT_MODEL_NAME,
        "languageModel"
      );
      this.modelUrl =
        LITERT_MODEL_PRESETS[this.modelName.toLowerCase()] ||
        LITERT_MODEL_PRESETS[DEFAULT_MODEL_NAME];
    }

    this.ready = callCallback(this.loadModel(), callback);
  }

  /**
   * Load the underlying runtime provider and initialize the model engine.
   * @returns {Promise<this>}
   */
  async loadModel() {
    switch (this.config.runtime) {
      case "litert":
      default:
        this.provider = new LiteRtLanguageModelProvider(
          this.modelUrl,
          this.config
        );
        break;
    }

    await this.provider.load();
    this.model = this.provider.engine;
    return this;
  }

  /**
   * Run stateless single-turn text generation.
   * @param {string | object | Array} prompt - Input prompt string or message(s).
   * @param {object | function} [optionsOrCallback] - Per-call generation options or callback function.
   * @param {function} [cb] - Callback receiving `{ text, thought?, done }`.
   * @returns {Promise<{ text: string, thought?: string, done: boolean }>}
   */
  async generate(...inputs) {
    await this.ready;
    const { input, options, callback } = parseInferenceArgs(inputs, "generate");
    this.isGenerating = true;
    const promise = this.provider.generate(input, options).finally(() => {
      this.isGenerating = false;
    });
    return callCallback(promise, callback);
  }

  /**
   * Run stateless streaming text generation.
   * Supports both callback per token (`llm.generateStream(prompt, gotChunk)`)
   * and async iteration (`for await (const chunk of llm.generateStream(prompt))`).
   *
   * @param {string | object | Array} prompt - Input prompt string or message(s).
   * @param {object | function} [optionsOrCallback] - Per-call generation options or chunk callback.
   * @param {function} [cb] - Chunk callback receiving `{ token, text, thought?, done }`.
   * @returns {AsyncIterable<{ token: string, text: string, thought?: string, done: boolean }> & Promise<{ text: string, thought?: string, done: boolean }>}
   */
  generateStream(...inputs) {
    const { input, options, callback } = parseInferenceArgs(
      inputs,
      "generateStream"
    );
    return this.createDeferredStream(input, options, callback, true);
  }

  /**
   * Send a message in a stateful multi-turn conversation (reuses KV-cache across turns).
   * @param {string | object | Array} message - User message string or message object.
   * @param {object | function} [optionsOrCallback] - Optional options or callback.
   * @param {function} [cb] - Callback receiving `{ text, thought?, done }`.
   * @returns {Promise<{ text: string, thought?: string, done: boolean }>}
   */
  async chat(...inputs) {
    await this.ready;
    const { input, options, callback } = parseInferenceArgs(inputs, "chat");
    this.isGenerating = true;
    const promise = this.provider.chat(input, options).finally(() => {
      this.isGenerating = false;
    });
    return callCallback(promise, callback);
  }

  /**
   * Send a message in a stateful multi-turn conversation and stream tokens as they are decoded.
   * Supports both callback per token (`llm.chatStream(message, gotChunk)`)
   * and async iteration (`for await (const chunk of llm.chatStream(message))`).
   *
   * @param {string | object | Array} message - User message string or message object.
   * @param {object | function} [optionsOrCallback] - Optional options or chunk callback.
   * @param {function} [cb] - Chunk callback receiving `{ token, text, thought?, done }`.
   * @returns {AsyncIterable<{ token: string, text: string, thought?: string, done: boolean }> & Promise<{ text: string, thought?: string, done: boolean }>}
   */
  chatStream(...inputs) {
    const { input, options, callback } = parseInferenceArgs(
      inputs,
      "chatStream"
    );
    return this.createDeferredStream(input, options, callback, false);
  }

  /**
   * Internal helper that awaits `this.ready` before delegating to the provider's stream.
   * @private
   */
  createDeferredStream(input, options, callback, isStateless) {
    const self = this;

    async function* deferredGenerator() {
      await self.ready;
      self.isGenerating = true;
      try {
        const stream = isStateless
          ? self.provider.generateStream(input, options, callback)
          : self.provider.chatStream(input, options, callback);
        // eslint-disable-next-line no-restricted-syntax
        for await (const chunk of stream) {
          yield chunk;
        }
      } finally {
        self.isGenerating = false;
      }
    }

    let iteratorInstance = null;
    const getIterator = () => {
      if (!iteratorInstance) {
        iteratorInstance = deferredGenerator();
      }
      return iteratorInstance;
    };

    const drainToPromise = async () => {
      let lastChunk = { text: "", done: true };
      // eslint-disable-next-line no-restricted-syntax
      for await (const chunk of getIterator()) {
        lastChunk = chunk;
      }
      const result = { text: lastChunk.text, done: true };
      if (lastChunk.thought !== undefined) {
        result.thought = lastChunk.thought;
      }
      return result;
    };

    let drainPromise = null;
    const ensureDrainPromise = () => {
      if (!drainPromise) {
        drainPromise = drainToPromise();
      }
      return drainPromise;
    };

    if (typeof callback === "function") {
      ensureDrainPromise();
    }

    return {
      [Symbol.asyncIterator]() {
        return getIterator();
      },
      then(onFulfilled, onRejected) {
        return ensureDrainPromise().then(onFulfilled, onRejected);
      },
      catch(onRejected) {
        return ensureDrainPromise().catch(onRejected);
      },
      finally(onFinally) {
        return ensureDrainPromise().finally(onFinally);
      },
    };
  }

  /**
   * Reset the active multi-turn chat conversation and optionally set a new system prompt.
   * @param {string | function} [systemPromptOrCallback] - Optional new system prompt or callback.
   * @param {function} [cb] - Optional callback.
   * @returns {Promise<this>}
   */
  async resetChat(systemPromptOrCallback, cb) {
    await this.ready;
    const { string: systemPrompt, callback } = handleArguments(
      systemPromptOrCallback,
      cb
    );
    const promise = this.provider.resetChat(systemPrompt).then(() => this);
    return callCallback(promise, callback);
  }

  /**
   * Get the message history of the active stateful chat conversation.
   * @param {function} [callback] - Optional callback receiving `Array<{ role, text, thought? }>`.
   * @returns {Promise<Array<{ role: string, text: string, thought?: string }>>}
   */
  async getHistory(callback) {
    await this.ready;
    return callCallback(this.provider.getHistory(), callback);
  }

  /**
   * Cancel any currently running generation or streaming call.
   */
  cancel() {
    if (this.provider) {
      this.provider.cancel();
    }
    this.isGenerating = false;
  }

  /**
   * Alias for `cancel()` to match ml5 `*Stop` ergonomics.
   */
  stop() {
    this.cancel();
  }

  /**
   * Clear cached `.litertlm` model files from the browser's Origin Private File System (OPFS).
   * @param {boolean} [all=false] - If true, removes all cached models; otherwise removes this model's cache.
   * @returns {Promise<boolean>}
   */
  async clearCache(all = false) {
    if (this.provider) {
      return this.provider.clearCache(all);
    }
    return clearModelCache(
      !all && typeof this.modelUrl === "string" ? this.modelUrl : undefined
    );
  }

  /**
   * Dispose the active conversation and release WebGPU / WASM engine resources.
   * @returns {Promise<void>}
   */
  async dispose() {
    await this.ready;
    if (this.provider) {
      await this.provider.dispose();
    }
    this.model = null;
  }
}

/**
 * Factory function for creating an `ml5.languageModel` / `ml5.llm` instance.
 * @param {...*} inputs - Optional `modelNameOrSource`, `options`, and `callback`.
 * @returns {LanguageModel | Promise<LanguageModel>}
 */
const languageModel = (...inputs) => {
  let explicitModelSource;
  const remainingInputs = [];

  inputs.forEach((arg, index) => {
    if (
      index === 0 &&
      (isBlob(arg) || isReadableStream(arg))
    ) {
      explicitModelSource = arg;
    } else {
      remainingInputs.push(arg);
    }
  });

  const { string, options = {}, callback } = handleArguments(
    ...remainingInputs
  );
  const modelSource =
    explicitModelSource !== undefined ? explicitModelSource : string;

  return new LanguageModel(modelSource, options, callback);
};

export default languageModel;
