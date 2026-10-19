import {
  Backend,
  Engine,
  LiteRtLm,
  SamplerType,
  getOrLoadGlobalLiteRtLm,
} from "@litert-lm/core";
import languageModel, { LanguageModel } from "../../src/LanguageModel";
import {
  DEFAULT_WASM_PATH,
  LITERT_MODEL_PRESETS,
  extractMessageContent,
} from "../../src/LanguageModel/litert";
import {
  clearModelCache,
  resolveModelSource,
  urlToCacheKey,
} from "../../src/LanguageModel/modelCache";

jest.mock("@litert-lm/core", () => ({
  Backend: {
    CPU: "CPU",
    GPU: "GPU",
    GPU_ARTISAN: "GPU_ARTISAN",
  },
  SamplerType: {
    TOP_P: "TOP_P",
    TOP_K: "TOP_K",
    GREEDY: "GREEDY",
  },
  LiteRtLm: {
    DEFAULT_WASM_PATH: "",
  },
  getOrLoadGlobalLiteRtLm: jest.fn(),
  Engine: {
    create: jest.fn(),
  },
}));

function createMockReadableStream(chunks) {
  let index = 0;
  return {
    getReader() {
      return {
        async read() {
          if (index < chunks.length) {
            const value = chunks[index];
            index += 1;
            return { done: false, value };
          }
          return { done: true, value: undefined };
        },
        releaseLock: jest.fn(),
        cancel: jest.fn(),
      };
    },
  };
}

describe("ml5.languageModel / ml5.llm", () => {
  let mockConversation;
  let mockEngine;

  beforeEach(() => {
    mockConversation = {
      sendMessage: jest.fn().mockResolvedValue({
        role: "assistant",
        content: [{ type: "text", text: "Hello from Gemma 4!" }],
        channels: { thought: "Thinking step" },
      }),
      sendMessageStreaming: jest.fn().mockImplementation(() =>
        createMockReadableStream([
          {
            role: "assistant",
            content: [{ type: "text", text: "Hello " }],
            channels: { thought: "Step 1" },
          },
          {
            role: "assistant",
            content: [{ type: "text", text: "world!" }],
          },
        ])
      ),
      cancel: jest.fn(),
      getHistory: jest.fn().mockResolvedValue([
        { role: "user", content: "Hi" },
        {
          role: "assistant",
          content: [{ type: "text", text: "Hello from Gemma 4!" }],
        },
      ]),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    mockEngine = {
      createConversation: jest.fn().mockResolvedValue(mockConversation),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    getOrLoadGlobalLiteRtLm.mockResolvedValue({});
    Engine.create.mockResolvedValue(mockEngine);
  });

  describe("Model Presets and Options", () => {
    it("loads default gemma-4-e2b preset and sets LiteRT WASM path", async () => {
      const instance = languageModel({ cache: false });
      await instance.ready;

      expect(instance.modelName).toBe("gemma-4-e2b");
      expect(instance.modelUrl).toBe(LITERT_MODEL_PRESETS["gemma-4-e2b"]);
      expect(LiteRtLm.DEFAULT_WASM_PATH).toBe(DEFAULT_WASM_PATH);
      expect(getOrLoadGlobalLiteRtLm).toHaveBeenCalledWith(DEFAULT_WASM_PATH);
      expect(Engine.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: LITERT_MODEL_PRESETS["gemma-4-e2b"],
          backend: Backend.GPU,
          mainExecutorSettings: { maxNumTokens: 2048 },
        }),
        ""
      );
    });

    it("resolves gemma-4-e4b preset case-insensitively", async () => {
      const instance = languageModel("Gemma-4-E4B", { cache: false });
      await instance.ready;

      expect(instance.modelUrl).toBe(LITERT_MODEL_PRESETS["gemma-4-e4b"]);
    });

    it("accepts custom .litertlm URLs without warning", async () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const customUrl = "https://example.com/models/custom-web.litertlm";
      const instance = languageModel(customUrl, { cache: false });
      await instance.ready;

      expect(instance.modelName).toBe("custom");
      expect(instance.modelUrl).toBe(customUrl);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("accepts a ReadableStream as first argument alongside options", async () => {
      const customStream = createMockReadableStream([]);
      const instance = languageModel(customStream, {
        temperature: 0.4,
        cache: false,
      });
      await instance.ready;

      expect(instance.modelName).toBe("custom");
      expect(instance.config.temperature).toBe(0.4);
      expect(Engine.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: customStream }),
        ""
      );
    });

    it("validates options via handleOptions and falls back on invalid values", async () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const instance = new LanguageModel("gemma-4-e2b", {
        temperature: 5.0, // out of [0, 2]
        backend: "invalid-backend",
        cache: false,
      });
      await instance.ready;

      expect(instance.config.temperature).toBe(0.8);
      expect(instance.config.backend).toBe("webgpu");
      expect(warnSpy).toHaveBeenCalledTimes(2);
      warnSpy.mockRestore();
    });
  });

  describe("Stateless Generation (generate & generateStream)", () => {
    it("runs stateless generate() and disposes temporary conversation", async () => {
      const instance = languageModel({ cache: false });
      await instance.ready;

      const cb = jest.fn();
      const result = await instance.generate("Write a poem", cb);

      expect(result).toEqual({
        text: "Hello from Gemma 4!",
        thought: "Thinking step",
        done: true,
      });
      expect(cb).toHaveBeenCalledWith(result);
      // 1 conversation created on init + 1 temporary conversation for generate()
      expect(mockEngine.createConversation).toHaveBeenCalledTimes(2);
      expect(mockConversation.delete).toHaveBeenCalledTimes(1);
    });

    it("streams tokens in generateStream() via callback and async iterator", async () => {
      const instance = languageModel({ cache: false });
      await instance.ready;

      const chunks = [];
      const stream = instance.generateStream("Count to two", (chunk) => {
        chunks.push(chunk);
      });

      const finalResult = await stream;
      expect(finalResult).toEqual({
        text: "Hello world!",
        thought: "Step 1",
        done: true,
      });
      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({
        token: "Hello ",
        text: "Hello ",
        thought: "Step 1",
        done: false,
      });
      expect(chunks[1]).toEqual({
        token: "world!",
        text: "Hello world!",
        thought: "Step 1",
        done: false,
      });
      expect(chunks[2]).toEqual({
        token: "",
        text: "Hello world!",
        thought: "Step 1",
        done: true,
      });
    });
  });

  describe("Stateful Chat, History, Cancellation & Disposal", () => {
    it("reuses the active conversation across chat() turns", async () => {
      const instance = languageModel("gemma-4-e2b", {
        systemPrompt: "Be brief.",
        thinking: true,
        cache: false,
      });
      await instance.ready;

      const reply1 = await instance.chat("Turn 1");
      const reply2 = await instance.chat("Turn 2");

      expect(reply1.text).toBe("Hello from Gemma 4!");
      expect(reply2.text).toBe("Hello from Gemma 4!");
      // Only 1 conversation created at load time
      expect(mockEngine.createConversation).toHaveBeenCalledTimes(1);
      expect(mockConversation.sendMessage).toHaveBeenCalledTimes(2);
    });

    it("retrieves normalized chat history via getHistory()", async () => {
      const instance = languageModel({ cache: false });
      await instance.ready;

      const history = await instance.getHistory();
      expect(history).toEqual([
        { role: "user", text: "Hi" },
        { role: "assistant", text: "Hello from Gemma 4!" },
      ]);
    });

    it("resets conversation on resetChat() and updates systemPrompt", async () => {
      const instance = languageModel({ cache: false });
      await instance.ready;

      await instance.resetChat("New system prompt");
      expect(instance.config.systemPrompt).toBe("New system prompt");
      expect(mockConversation.delete).toHaveBeenCalledTimes(1);
      expect(mockEngine.createConversation).toHaveBeenCalledTimes(2);
    });

    it("cancels active generation on stop() / cancel() and cleans up on dispose()", async () => {
      const instance = languageModel({ cache: false });
      await instance.ready;

      instance.provider.activeConversations.add(mockConversation);
      instance.stop();
      expect(mockConversation.cancel).toHaveBeenCalledTimes(1);

      await instance.dispose();
      expect(mockEngine.delete).toHaveBeenCalledTimes(1);
      expect(instance.model).toBeNull();
    });
  });

  describe("Helper & Cache Utilities", () => {
    it("extracts string and array message content properly", () => {
      expect(extractMessageContent(null)).toEqual({ text: "" });
      expect(
        extractMessageContent({ role: "assistant", content: "Plain string" })
      ).toEqual({ text: "Plain string" });
    });

    it("converts URLs to deterministic OPFS cache keys", () => {
      const key = urlToCacheKey(
        "https://huggingface.co/litert-community/gemma-4-E2B-it-web.litertlm"
      );
      expect(key).toBe(
        "huggingface.co_litert-community_gemma-4-E2B-it-web.litertlm"
      );
    });

    it("reports progress for Blob sources and handles clearModelCache when OPFS is absent", async () => {
      const onProgress = jest.fn();
      const blob = new Blob(["test-weights"]);
      const resolved = await resolveModelSource(blob, { onProgress });

      expect(resolved).toBe(blob);
      expect(onProgress).toHaveBeenCalledWith({
        loaded: blob.size,
        total: blob.size,
        percent: 100,
        cached: true,
      });

      const cleared = await clearModelCache();
      expect(cleared).toBe(false);
    });
  });
});
