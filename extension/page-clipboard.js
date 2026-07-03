(() => {
  "use strict";

  const INSTALL_FLAG = "__PLUCK_PAGE_CLIPBOARD_BRIDGE_V80__";
  const RESULT_EVENT = "pluck:clipboard-result";
  const READY_EVENT = "pluck:clipboard-bridge-ready";
  const PROBE_EVENT = "pluck:clipboard-bridge-probe";
  const CHANNEL = "pluck-extension-clipboard";
  const OVERLAY_SELECTOR = "[data-pluck-overlay=\"true\"], #pluck-extension-root";
  const REQUEST_ID_ATTRIBUTE = "data-pluck-request-id";
  const COPY_ACTION_ATTRIBUTE = "data-pluck-action";
  const RESULT_ID_ATTRIBUTE = "data-pluck-result-id";
  const RESULT_OK_ATTRIBUTE = "data-pluck-result-ok";
  const RESULT_ERROR_ATTRIBUTE = "data-pluck-result-error";
  const BRIDGE_ATTRIBUTE = "data-pluck-bridge";
  const REQUEST_TIMEOUT_MS = 15000;

  if (window[INSTALL_FLAG]) {
    announceReady();
    return;
  }
  window[INSTALL_FLAG] = true;

  const pending = new Map();

  // A probe makes readiness deterministic even when the bridge loaded before
  // the isolated extension content script installed its READY_EVENT listener.
  window.addEventListener(PROBE_EVENT, announceReady, true);

  // Capture the ORIGINAL trusted click in the webpage's main JavaScript world.
  // Safari may reject clipboard writes initiated from an isolated extension
  // world even when that isolated handler was reached by the same click.
  window.addEventListener("click", (event) => {
    if (event.isTrusted !== true) {
      return;
    }

    const overlayHost = findOverlayHost(event);
    if (!overlayHost) {
      return;
    }

    if (overlayHost.getAttribute(COPY_ACTION_ATTRIBUTE) !== "copy") {
      return;
    }

    const requestId = overlayHost.getAttribute(REQUEST_ID_ATTRIBUTE);
    if (!requestId || pending.has(requestId)) {
      return;
    }

    if (!navigator.clipboard?.write || typeof ClipboardItem !== "function") {
      publishResult(requestId, false, "CLIPBOARD_API_UNAVAILABLE");
      return;
    }

    let resolveBlob;
    let rejectBlob;
    const blobPromise = new Promise((resolve, reject) => {
      resolveBlob = resolve;
      rejectBlob = reject;
    });

    const timeoutId = setTimeout(() => {
      const entry = pending.get(requestId);
      if (entry) {
        entry.rejectBlob(new Error("CLIPBOARD_IMAGE_TIMEOUT"));
      }
    }, REQUEST_TIMEOUT_MS);

    pending.set(requestId, { resolveBlob, rejectBlob, timeoutId });

    try {
      // This call stays synchronous inside the original trusted click.
      const item = new ClipboardItem({ "image/png": blobPromise });
      Promise.resolve(navigator.clipboard.write([item]))
        .then(() => publishResult(requestId, true, ""))
        .catch((error) => publishResult(requestId, false, errorMessage(error)))
        .finally(() => cleanup(requestId));
    } catch (error) {
      publishResult(requestId, false, errorMessage(error));
      cleanup(requestId);
    }
  }, true);

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== CHANNEL) {
      return;
    }

    const requestId = event.data.requestId;
    const entry = pending.get(requestId);
    if (!entry) {
      return;
    }

    if (event.data.type === "resolve") {
      const buffer = event.data.buffer;
      if (!(buffer instanceof ArrayBuffer) || buffer.byteLength === 0) {
        entry.rejectBlob(new Error("INVALID_PNG_BYTES"));
        return;
      }
      entry.resolveBlob(new Blob([buffer], { type: "image/png" }));
      return;
    }

    if (event.data.type === "reject") {
      entry.rejectBlob(new Error(event.data.error || "IMAGE_PREPARATION_FAILED"));
    }
  });

  function findOverlayHost(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const fromPath = path.find((node) => node?.matches?.(OVERLAY_SELECTOR));
    if (fromPath) {
      return fromPath;
    }

    const host = document.querySelector(OVERLAY_SELECTOR);
    if (!host) {
      return null;
    }

    // Safari's main world may omit nodes inside a closed extension shadow root
    // from composedPath(). Coordinate checking still proves the physical click
    // landed inside the visible overlay host.
    const rect = host.getBoundingClientRect();
    const x = Number(event.clientX);
    const y = Number(event.clientY);
    const inside = Number.isFinite(x) && Number.isFinite(y)
      && x >= rect.left && x <= rect.right
      && y >= rect.top && y <= rect.bottom;
    return inside ? host : null;
  }

  function announceReady() {
    const root = document.documentElement;
    if (!root) {
      setTimeout(announceReady, 0);
      return;
    }
    root.setAttribute(BRIDGE_ATTRIBUTE, "ready-v80");
    window.dispatchEvent(new Event(READY_EVENT));
  }

  function publishResult(requestId, ok, error) {
    const root = document.documentElement;
    if (!root) {
      return;
    }
    root.setAttribute(RESULT_ID_ATTRIBUTE, requestId);
    root.setAttribute(RESULT_OK_ATTRIBUTE, ok ? "true" : "false");
    root.setAttribute(RESULT_ERROR_ATTRIBUTE, error || "");
    window.dispatchEvent(new Event(RESULT_EVENT));
  }

  function cleanup(requestId) {
    const entry = pending.get(requestId);
    if (entry) {
      clearTimeout(entry.timeoutId);
      pending.delete(requestId);
    }
  }

  function errorMessage(error) {
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }

  announceReady();
})();
