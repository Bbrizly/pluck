"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const Shared = require("../extension/shared.js");
const backgroundSource = fs.readFileSync(path.join(__dirname, "../extension/background.js"), "utf8");

function loadBackground({ fetchImpl, tabsCaptureImpl, scriptingImpl } = {}) {
  const storageSets = [];
  const sandbox = {
    PluckShared: Shared,
    browser: {
      runtime: {
        onMessage: {
          addListener(fn) {
            sandbox.__listener = fn;
          }
        }
      },
      storage: {
        local: {
          async set(values) {
            storageSets.push(values);
          }
        }
      },
      tabs: {
        captureVisibleTab: tabsCaptureImpl || (async () => "data:image/png;base64,AA==")
      },
      scripting: {
        executeScript: scriptingImpl || (async () => undefined)
      }
    },
    fetch: fetchImpl,
    AbortController,
    Uint8Array,
    ArrayBuffer,
    btoa,
    URL,
    Promise,
    Error,
    Object,
    setTimeout,
    clearTimeout,
    console
  };

  vm.createContext(sandbox);
  vm.runInContext(backgroundSource, sandbox);

  return { listener: sandbox.__listener, storageSets };
}

// Simulate how the browser runtime actually dispatches a message. Chrome only
// delivers a reply when the listener returns true and answers via sendResponse
// (crbug 1185241 — a returned Promise is ignored). This helper enforces that
// contract, so every test below exercises the Chrome path, not the Firefox-only
// promise-return path that let the bug ship.
function dispatch(listener, message, sender) {
  return new Promise((resolve, reject) => {
    const returnValue = listener(message, sender, resolve);
    if (returnValue === true) {
      return; // async reply: resolve fires when the handler calls sendResponse
    }
    if (returnValue === undefined) {
      resolve(undefined); // message not handled by this listener
      return;
    }
    reject(new Error(`onMessage listener returned ${String(returnValue)}; Chrome only honors "return true" plus sendResponse`));
  });
}

const PINTEREST_SENDER = { url: "https://www.pinterest.com/pin/1/" };
const jsonResponse = (overrides) => ({
  ok: true,
  status: 200,
  url: "https://i.pinimg.com/736x/a.jpg",
  headers: { get: (name) => (name === "content-type" ? "image/png" : null) },
  arrayBuffer: async () => new ArrayBuffer(10),
  ...overrides
});

test("fetchSelectedImage rejects a non-Pinterest sender even with a valid image URL", async () => {
  const { listener } = loadBackground();
  const result = await dispatch(listener,
    { type: Shared.FETCH_MESSAGE_TYPE, url: "https://i.pinimg.com/736x/a.jpg" },
    { url: "https://evil.example/" }
  );
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "FETCH_SENDER_REJECTED");
});

test("fetchSelectedImage rejects disallowed MIME types", async () => {
  const { listener } = loadBackground({
    fetchImpl: async () => jsonResponse({ headers: { get: (name) => (name === "content-type" ? "text/html" : null) } })
  });
  const result = await dispatch(listener,
    { type: Shared.FETCH_MESSAGE_TYPE, url: "https://i.pinimg.com/736x/a.jpg" },
    PINTEREST_SENDER
  );
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "MIME_REJECTED");
});

test("fetchSelectedImage rejects when the final response URL redirected off pinimg.com", async () => {
  const { listener } = loadBackground({
    fetchImpl: async () => jsonResponse({ url: "https://evil.example/a.jpg" })
  });
  const result = await dispatch(listener,
    { type: Shared.FETCH_MESSAGE_TYPE, url: "https://i.pinimg.com/736x/a.jpg" },
    PINTEREST_SENDER
  );
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "REDIRECT_REJECTED");
});

test("fetchSelectedImage rejects responses over the byte cap", async () => {
  const oversized = new ArrayBuffer(26 * 1024 * 1024);
  const { listener } = loadBackground({
    fetchImpl: async () => jsonResponse({ arrayBuffer: async () => oversized })
  });
  const result = await dispatch(listener,
    { type: Shared.FETCH_MESSAGE_TYPE, url: "https://i.pinimg.com/736x/a.jpg" },
    PINTEREST_SENDER
  );
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "RESPONSE_TOO_LARGE");
});

test("fetchSelectedImage succeeds and base64-encodes the exact bytes fetched, including a chunk boundary", async () => {
  const bytes = new Uint8Array(0x8000 + 10);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 256;

  const { listener, storageSets } = loadBackground({
    fetchImpl: async () => jsonResponse({ arrayBuffer: async () => bytes.buffer })
  });

  const result = await dispatch(listener,
    { type: Shared.FETCH_MESSAGE_TYPE, url: "https://i.pinimg.com/736x/a.jpg" },
    PINTEREST_SENDER
  );

  assert.equal(result.ok, true);
  assert.equal(result.mimeType, "image/png");
  const decoded = Buffer.from(result.bytesBase64, "base64");
  assert.equal(decoded.length, bytes.length);
  assert.ok(decoded.equals(Buffer.from(bytes)));
  assert.equal(storageSets.some((entry) => entry.imageAccessVerified === true), true);
});

test("fetchSelectedImage maps an AbortError to FETCH_TIMEOUT", async () => {
  const { listener } = loadBackground({
    fetchImpl: async () => {
      const error = new Error("The operation was aborted.");
      error.name = "AbortError";
      throw error;
    }
  });
  const result = await dispatch(listener,
    { type: Shared.FETCH_MESSAGE_TYPE, url: "https://i.pinimg.com/736x/a.jpg" },
    PINTEREST_SENDER
  );
  assert.equal(result.errorCode, "FETCH_TIMEOUT");
});

test("fetchSelectedImage classifies permission-like failures as IMAGE_ACCESS_BLOCKED and records the failure", async () => {
  const { listener, storageSets } = loadBackground({
    fetchImpl: async () => {
      throw new Error("Not allowed to load local resource");
    }
  });
  const result = await dispatch(listener,
    { type: Shared.FETCH_MESSAGE_TYPE, url: "https://i.pinimg.com/736x/a.jpg" },
    PINTEREST_SENDER
  );
  assert.equal(result.errorCode, "IMAGE_ACCESS_BLOCKED");
  assert.equal(storageSets.some((entry) => entry.imageAccessVerified === false), true);
});

test("capture message is rejected for a non-Pinterest sender tab", async () => {
  const { listener } = loadBackground();
  const result = await dispatch(listener,
    { type: Shared.CAPTURE_MESSAGE_TYPE },
    { tab: { windowId: 1 }, url: "https://evil.example/" }
  );
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "CAPTURE_SENDER_REJECTED");
});

test("capture message captures the sender's window and returns the data URL", async () => {
  const { listener } = loadBackground({
    tabsCaptureImpl: async (windowId, opts) => {
      assert.equal(windowId, 7);
      assert.equal(opts.format, "png");
      return "data:image/png;base64,AAAA";
    }
  });
  const result = await dispatch(listener,
    { type: Shared.CAPTURE_MESSAGE_TYPE },
    { tab: { windowId: 7 }, url: "https://www.pinterest.com/" }
  );
  assert.equal(result.ok, true);
  assert.equal(result.dataUrl, "data:image/png;base64,AAAA");
});

test("bridge init message is rejected for a non-Pinterest sender tab", async () => {
  const { listener } = loadBackground();
  const result = await dispatch(listener,
    { type: "PLUCK_INIT_PAGE_BRIDGE" },
    { tab: { id: 3 }, url: "https://evil.example/" }
  );
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "BRIDGE_SENDER_REJECTED");
});

test("bridge init message injects page-clipboard.js into the sender's frame in the MAIN world", async () => {
  let injected;
  const { listener } = loadBackground({
    scriptingImpl: async (options) => {
      injected = options;
    }
  });
  const result = await dispatch(listener,
    { type: "PLUCK_INIT_PAGE_BRIDGE" },
    { tab: { id: 3 }, url: "https://www.pinterest.com/", frameId: 0 }
  );
  assert.equal(result.ok, true);
  assert.equal(injected.target.tabId, 3);
  assert.equal(injected.target.frameIds.length, 1);
  assert.equal(injected.target.frameIds[0], 0);
  assert.equal(injected.files.length, 1);
  assert.equal(injected.files[0], "page-clipboard.js");
  assert.equal(injected.world, "MAIN");
});

test("onMessage answers via sendResponse and returns true, the cross-browser async contract", async () => {
  const { listener } = loadBackground();

  let responded;
  const returnValue = listener(
    { type: Shared.CAPTURE_MESSAGE_TYPE },
    { tab: { windowId: 7 }, url: "https://www.pinterest.com/" },
    (value) => { responded = value; }
  );

  // The old code returned a Promise here, which Chrome ignores (crbug 1185241),
  // so the content script never got a reply on Chrome.
  assert.equal(returnValue, true);

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(responded.ok, true);
  assert.equal(responded.dataUrl, "data:image/png;base64,AA==");
});

test("onMessage returns undefined for a message it does not handle so other listeners can reply", () => {
  const { listener } = loadBackground();
  const returnValue = listener({ type: "SOMETHING_ELSE" }, PINTEREST_SENDER, () => {});
  assert.equal(returnValue, undefined);
});
