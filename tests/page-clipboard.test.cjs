"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../extension/page-clipboard.js"), "utf8");

test("page bridge starts clipboard write directly from a trusted overlay click", async () => {
  const listeners = new Map();
  const attributes = new Map();
  let clipboardItem;
  let clipboardWriteCalls = 0;

  const root = {
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; }
  };

  const fakeWindow = {
    addEventListener(type, listener) {
      const list = listeners.get(type) || [];
      list.push(listener);
      listeners.set(type, list);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) || []) {
        listener(event);
      }
      return true;
    }
  };
  fakeWindow.window = fakeWindow;

  class FakeEvent {
    constructor(type) { this.type = type; }
  }

  class FakeClipboardItem {
    constructor(data) {
      this.data = data;
      clipboardItem = this;
    }
  }

  const context = vm.createContext({
    window: fakeWindow,
    document: { documentElement: root },
    navigator: {
      clipboard: {
        write(items) {
          clipboardWriteCalls += 1;
          assert.equal(items.length, 1);
          return items[0].data["image/png"].then(() => undefined);
        }
      }
    },
    ClipboardItem: FakeClipboardItem,
    Event: FakeEvent,
    Blob,
    ArrayBuffer,
    Error,
    Promise,
    Map,
    setTimeout,
    clearTimeout,
    String
  });

  vm.runInContext(source, context);

  const overlayHost = {
    id: "pluck-v80-overlay-root",
    matches(selector) { return selector.includes("data-pluck-overlay"); },
    getAttribute(name) {
      if (name === "data-pluck-request-id") return "request-1";
      if (name === "data-pluck-action") return "copy";
      return null;
    }
  };

  fakeWindow.dispatchEvent({
    type: "click",
    isTrusted: true,
    target: overlayHost,
    composedPath: () => [{}, overlayHost, fakeWindow]
  });

  assert.equal(clipboardWriteCalls, 1);
  assert.ok(clipboardItem);

  fakeWindow.dispatchEvent({
    type: "message",
    source: fakeWindow,
    data: {
      source: "pluck-extension-clipboard",
      type: "resolve",
      requestId: "request-1",
      buffer: new Uint8Array([1, 2, 3]).buffer
    }
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attributes.get("data-pluck-result-id"), "request-1");
  assert.equal(attributes.get("data-pluck-result-ok"), "true");
});

test("page bridge ignores synthetic clicks", () => {
  const listeners = new Map();
  let clipboardWriteCalls = 0;
  const fakeWindow = {
    addEventListener(type, listener) {
      const list = listeners.get(type) || [];
      list.push(listener);
      listeners.set(type, list);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) || []) listener(event);
    }
  };
  fakeWindow.window = fakeWindow;

  const context = vm.createContext({
    window: fakeWindow,
    document: { documentElement: { setAttribute() {}, getAttribute() { return null; } } },
    navigator: { clipboard: { write() { clipboardWriteCalls += 1; } } },
    ClipboardItem: class {},
    Event: class { constructor(type) { this.type = type; } },
    Blob,
    ArrayBuffer,
    Error,
    Promise,
    Map,
    setTimeout,
    clearTimeout,
    String
  });

  vm.runInContext(source, context);
  fakeWindow.dispatchEvent({
    type: "click",
    isTrusted: false,
    target: null,
    composedPath: () => [{ id: "pluck-v80-overlay-root", matches: () => true, getAttribute: () => "request-2" }]
  });
  assert.equal(clipboardWriteCalls, 0);
});

test("page bridge recognizes a trusted click by overlay coordinates when Safari hides shadow-path nodes", async () => {
  const listeners = new Map();
  const attributes = new Map([
    ["data-pluck-request-id", "request-coordinate"],
    ["data-pluck-action", "copy"]
  ]);
  let clipboardWriteCalls = 0;

  const overlayHost = {
    id: "pluck-v80-overlay-root",
    matches(selector) { return selector.includes("data-pluck-overlay"); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    getBoundingClientRect() { return { left: 100, top: 100, right: 200, bottom: 150 }; }
  };
  const root = { setAttribute(name, value) { attributes.set(name, String(value)); } };
  const fakeWindow = {
    addEventListener(type, listener) {
      const list = listeners.get(type) || [];
      list.push(listener);
      listeners.set(type, list);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(event.type) || []) listener(event);
      return true;
    }
  };
  fakeWindow.window = fakeWindow;

  const context = vm.createContext({
    window: fakeWindow,
    document: {
      documentElement: root,
      querySelector(selector) { return selector.includes("data-pluck-overlay") ? overlayHost : null; }
    },
    navigator: { clipboard: { write() { clipboardWriteCalls += 1; return Promise.resolve(); } } },
    ClipboardItem: class { constructor(data) { this.data = data; } },
    Event: class { constructor(type) { this.type = type; } },
    Blob,
    ArrayBuffer,
    Error,
    Promise,
    Map,
    setTimeout,
    clearTimeout,
    String,
    Number
  });

  vm.runInContext(source, context);
  fakeWindow.dispatchEvent({
    type: "click",
    isTrusted: true,
    clientX: 140,
    clientY: 125,
    composedPath: () => []
  });

  assert.equal(clipboardWriteCalls, 1);
});
