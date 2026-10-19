// Copyright (c) 2026 ml5
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import {
  Backend,
  Engine,
  LiteRtLm,
  SamplerType,
  getOrLoadGlobalLiteRtLm,
} from "@litert-lm/core";
import { clearModelCache, resolveModelSource } from "./modelCache";

export const DEFAULT_WASM_PATH =
  "https://cdn.jsdelivr.net/npm/@litert-lm/core@0.19.0-nightly.20261018/wasm";

export const LITERT_MODEL_PRESETS = {
  "gemma-4-e2b":
    "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm",
  "gemma-4-e2b-it":
    "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm",
  "gemma-4-e4b":
    "https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.litertlm",
  "gemma-4-e4b-it":
    "https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm/resolve/main/gemma-4-E4B-it-web.litertlm",
};

/**
 * Extract plain text and optional reasoning thought channel from a LiteRT-LM Message object.
 * @param {object} message
 * @returns {{ text: string, thought?: string }}
 */
export function extractMessageContent(message) {
  if (!message) {
    return { text: "" };
  }

  let text = "";
  if (typeof message.content === "string") {
    text = message.content;
  } else if (Array.isArray(message.content)) {
    text = message.content
      .map((part) => (part && typeof part.text === "string" ? part.text : ""))
      .join("");
  }

  const thought =
    message.channels && typeof message.channels.thought === "string"
      ? message.channels.thought
      : undefined;

  return thought !== undefined ? { text, thought } : { text };
}

/**
 * Map ml5 backend string option to LiteRT-LM Backend enum.
 * In @litert-lm/core 0.19+, Backend.GPU is the default passed to EngineSettings.createDefault,
 * which inspects the .litertlm metadata and resolves GPU vs GPU_ARTISAN automatically.
 * @param {string} backendOption
 * @returns {*}
 */
function resolveBackend(backendOption) {
  const normalized = String(backendOption || "webgpu").toLowerCase();
  switch (normalized) {
    case "cpu":
      return Backend.CPU;
    case "gpu_artisan":
      return Backend.GPU_ARTISAN;
    case "gpu":
    case "webgpu":
    default:
      return Backend.GPU;
  }
}

/**
 * LiteRT-LM provider implementation for ml5.languageModel.
 */
export class LiteRtLanguageModelProvider {
  /**
   * @param {string | Blob | ReadableStream<Uint8Array>} modelSource - Resolved URL, Blob, or ReadableStream
   * @param {object} config - Validated configuration options
   */
  constructor(modelSource, config) {
    this.modelSource = modelSource;
    this.config = config;
    this.engine = null;
    this.conversation = null;
    this.activeConversations = new Set();
  }

  /**
   * Initialize WASM runtime, resolve/cache model source, and create LiteRT-LM Engine + default Conversation.
   * @returns {Promise<this>}
   */
  async load() {
    const wasmPath = this.config.wasmPath || DEFAULT_WASM_PATH;
    LiteRtLm.DEFAULT_WASM_PATH = wasmPath;
    await getOrLoadGlobalLiteRtLm(wasmPath);

    const resolvedModel = await resolveModelSource(this.modelSource, {
      cache: this.config.cache,
      onProgress: this.config.onProgress,
    });

    const backend = resolveBackend(this.config.backend);
    const engineSettings = {
      model: resolvedModel,
      backend,
      mainExecutorSettings: {
        maxNumTokens: this.config.maxTokens,
      },
    };

    this.engine = await Engine.create(
      engineSettings,
      this.config.systemPrompt || ""
    );

    this.conversation = await this.createConversationInstance(this.config);
    return this;
  }

  /**
   * Build ConversationConfig from ml5 options and create a LiteRT-LM Conversation.
   * @param {object} [overrides]
   * @returns {Promise<import("@litert-lm/core").Conversation>}
   */
  async createConversationInstance(overrides = {}) {
    if (!this.engine) {
      throw new Error("LanguageModel engine is not initialized.");
    }

    const merged = { ...this.config, ...overrides };
    const samplerParams = {
      type: SamplerType.TOP_P,
      temperature: merged.temperature,
      p: merged.topP,
      k: merged.topK,
    };

    if (merged.seed !== undefined) {
      samplerParams.seed = merged.seed;
    }

    const sessionConfig = {
      maxOutputTokens: merged.maxOutputTokens,
      samplerParams,
    };

    const preface = {};
    let hasPreface = false;

    if (merged.systemPrompt) {
      preface.messages = [{ role: "system", content: merged.systemPrompt }];
      hasPreface = true;
    }

    if (merged.thinking !== undefined) {
      preface.extra_context = { enable_thinking: Boolean(merged.thinking) };
      hasPreface = true;
    }

    const conversationConfig = {
      sessionConfig,
      prefillPrefaceOnInit: Boolean(merged.systemPrompt),
      filterChannelContentFromKvCache: true,
    };

    if (hasPreface) {
      conversationConfig.preface = preface;
    }

    return this.engine.createConversation(conversationConfig);
  }

  /**
   * Stateless single-turn text generation.
   * @param {string | object | Array} prompt
   * @param {object} [options]
   * @returns {Promise<{ text: string, thought?: string, done: boolean }>}
   */
  async generate(prompt, options = {}) {
    const tempConversation = await this.createConversationInstance(options);
    this.activeConversations.add(tempConversation);
    try {
      const rawMessage = await tempConversation.sendMessage(prompt);
      const extracted = extractMessageContent(rawMessage);
      return { ...extracted, done: true };
    } finally {
      this.activeConversations.delete(tempConversation);
      await tempConversation.delete().catch(() => {});
    }
  }

  /**
   * Stateless streaming text generation.
   * @param {string | object | Array} prompt
   * @param {object} [options]
   * @param {function} [callback]
   * @returns {AsyncIterable<{ token: string, text: string, thought?: string, done: boolean }>}
   */
  generateStream(prompt, options = {}, callback) {
    return this.runStream(prompt, options, callback, true);
  }

  /**
   * Stateful multi-turn chat generation reusing the active conversation KV-cache.
   * @param {string | object | Array} message
   * @param {object} [options]
   * @returns {Promise<{ text: string, thought?: string, done: boolean }>}
   */
  async chat(message, options = {}) {
    if (!this.conversation) {
      this.conversation = await this.createConversationInstance(options);
    }
    this.activeConversations.add(this.conversation);
    try {
      const rawMessage = await this.conversation.sendMessage(message);
      const extracted = extractMessageContent(rawMessage);
      return { ...extracted, done: true };
    } finally {
      this.activeConversations.delete(this.conversation);
    }
  }

  /**
   * Stateful multi-turn streaming chat reusing the active conversation KV-cache.
   * @param {string | object | Array} message
   * @param {object} [options]
   * @param {function} [callback]
   * @returns {AsyncIterable<{ token: string, text: string, thought?: string, done: boolean }>}
   */
  chatStream(message, options = {}, callback) {
    return this.runStream(message, options, callback, false);
  }

  /**
   * Shared streaming implementation returning a dual Promise + AsyncIterable object.
   * @param {string | object | Array} input
   * @param {object} options
   * @param {function} [callback]
   * @param {boolean} isStateless
   * @returns {AsyncIterable<{ token: string, text: string, thought?: string, done: boolean }> & Promise<{ text: string, thought?: string, done: boolean }>}
   */
  runStream(input, options = {}, callback, isStateless = false) {
    const self = this;

    async function* createGenerator() {
      const targetConv = isStateless
        ? await self.createConversationInstance(options)
        : self.conversation || (await self.createConversationInstance(options));

      if (!isStateless && !self.conversation) {
        self.conversation = targetConv;
      }

      self.activeConversations.add(targetConv);
      const readable = targetConv.sendMessageStreaming(input);
      const reader = readable.getReader();

      let fullText = "";
      let fullThought;

      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          // eslint-disable-next-line no-await-in-loop
          const { done, value } = await reader.read();
          if (done) break;

          const { text: tokenText, thought: tokenThought } =
            extractMessageContent(value);
          fullText += tokenText;
          if (tokenThought !== undefined) {
            fullThought = (fullThought || "") + tokenThought;
          }

          const chunkPayload = {
            token: tokenText,
            text: fullText,
            done: false,
          };
          if (fullThought !== undefined) {
            chunkPayload.thought = fullThought;
          }

          if (typeof callback === "function") {
            callback(chunkPayload);
          }
          yield chunkPayload;
        }

        const finalPayload = {
          token: "",
          text: fullText,
          done: true,
        };
        if (fullThought !== undefined) {
          finalPayload.thought = fullThought;
        }

        if (typeof callback === "function") {
          callback(finalPayload);
        }
        yield finalPayload;
      } finally {
        reader.releaseLock();
        self.activeConversations.delete(targetConv);
        if (isStateless) {
          await targetConv.delete().catch(() => {});
        }
      }
    }

    // Create an object that supports both `for await (const chunk of stream)`
    // and `await stream` (which drains the stream and resolves to the final result).
    let iteratorInstance = null;
    const getIterator = () => {
      if (!iteratorInstance) {
        iteratorInstance = createGenerator();
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

    // If a callback is passed, automatically start draining the stream so
    // p5.js users calling `llm.chatStream(msg, gotChunk)` without `for await`
    // immediately receive token callbacks.
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
   * Reset the active stateful conversation and optionally update systemPrompt.
   * @param {string} [systemPrompt]
   * @returns {Promise<void>}
   */
  async resetChat(systemPrompt) {
    if (systemPrompt !== undefined) {
      this.config.systemPrompt = systemPrompt;
    }
    if (this.conversation) {
      this.activeConversations.delete(this.conversation);
      await this.conversation.delete().catch(() => {});
      this.conversation = null;
    }
    this.conversation = await this.createConversationInstance(this.config);
  }

  /**
   * Retrieve normalized message history from the active stateful conversation.
   * @returns {Promise<Array<{ role: string, text: string, thought?: string }>>}
   */
  async getHistory() {
    if (!this.conversation) return [];
    const rawHistory = await this.conversation.getHistory();
    if (!Array.isArray(rawHistory)) return [];
    return rawHistory.map((msg) => {
      const extracted = extractMessageContent(msg);
      return {
        role: msg.role || "user",
        ...extracted,
      };
    });
  }

  /**
   * Cancel any in-flight generation across stateless or stateful conversations.
   */
  cancel() {
    this.activeConversations.forEach((conv) => {
      try {
        conv.cancel();
      } catch (e) {
        // Ignore cancel errors on already completed conversations
      }
    });
  }

  /**
   * Clear cached models in OPFS.
   * @param {boolean} [all=false] - If true, clears all cached models; otherwise clears this instance's model.
   * @returns {Promise<boolean>}
   */
  async clearCache(all = false) {
    const targetUrl =
      !all && typeof this.modelSource === "string"
        ? this.modelSource
        : undefined;
    return clearModelCache(targetUrl);
  }

  /**
   * Dispose the active conversation and underlying LiteRT-LM Engine.
   * @returns {Promise<void>}
   */
  async dispose() {
    this.cancel();
    if (this.conversation) {
      await this.conversation.delete().catch(() => {});
      this.conversation = null;
    }
    this.activeConversations.clear();
    if (this.engine) {
      await this.engine.delete().catch(() => {});
      this.engine = null;
    }
  }
}
