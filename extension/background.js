"use strict";

if (typeof importScripts === "function" && !globalThis.PinCopyShared) {
  importScripts("shared.js");
}

const extensionApi = globalThis.browser ?? globalThis.chrome;
const Shared = globalThis.PinCopyShared;

const MAX_RESPONSE_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const INIT_BRIDGE_MESSAGE_TYPE = "PIN_COPY_INIT_PAGE_BRIDGE";
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif"
]);

extensionApi.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === INIT_BRIDGE_MESSAGE_TYPE) {
    return installPageClipboardBridge(sender);
  }

  if (Shared.isCaptureMessage(message)) {
    return captureVisiblePinterestTab(sender);
  }

  if (Shared.isFetchMessage(message)) {
    return fetchSelectedImage(message.url);
  }

  return undefined;
});

async function captureVisiblePinterestTab(sender) {
  const tab = sender?.tab;
  if (!tab || !Number.isInteger(tab.windowId) || !isPinterestPageUrl(sender?.url || tab.url)) {
    return failure("CAPTURE_SENDER_REJECTED");
  }

  if (!extensionApi.tabs?.captureVisibleTab) {
    return failure("CAPTURE_API_UNAVAILABLE");
  }

  try {
    const dataUrl = await extensionApi.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) {
      return failure("CAPTURE_RESULT_INVALID");
    }
    return { ok: true, dataUrl };
  } catch (error) {
    return failure("CAPTURE_FAILED", undefined, errorDetail(error));
  }
}

async function installPageClipboardBridge(sender) {
  const tabId = sender?.tab?.id;
  if (!Number.isInteger(tabId) || !isPinterestPageUrl(sender?.url || sender?.tab?.url)) {
    return { ok: false, errorCode: "BRIDGE_SENDER_REJECTED" };
  }

  if (!extensionApi.scripting?.executeScript) {
    return { ok: false, errorCode: "SCRIPTING_API_UNAVAILABLE" };
  }

  try {
    await extensionApi.scripting.executeScript({
      target: { tabId, frameIds: [sender.frameId ?? 0] },
      files: ["page-clipboard.js"],
      world: "MAIN"
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      errorCode: "BRIDGE_INJECTION_FAILED",
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

function isPinterestPageUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") {
      return false;
    }
    return url.hostname === "pinterest.com"
      || url.hostname.endsWith(".pinterest.com")
      || url.hostname === "pinterest.ca"
      || url.hostname.endsWith(".pinterest.ca");
  } catch {
    return false;
  }
}

async function fetchSelectedImage(rawUrl) {
  const url = Shared.normalizeImageUrl(rawUrl);
  if (!url) {
    return failure("URL_REJECTED");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      redirect: "follow",
      cache: "force-cache",
      referrerPolicy: "no-referrer",
      signal: controller.signal
    });

    if (!response.ok) {
      return failure("HTTP_ERROR", response.status);
    }

    if (!Shared.normalizeImageUrl(response.url)) {
      return failure("REDIRECT_REJECTED");
    }

    const mimeType = (response.headers.get("content-type") || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return failure("MIME_REJECTED");
    }

    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > MAX_RESPONSE_BYTES) {
      return failure("RESPONSE_TOO_LARGE");
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_RESPONSE_BYTES) {
      return failure("RESPONSE_TOO_LARGE");
    }

    await recordImageAccessResult(true);
    return {
      ok: true,
      mimeType,
      // Safari WebExtension messaging has returned ArrayBuffer payloads as
      // empty objects on some builds. A base64 string survives that boundary
      // consistently. The content script still accepts ArrayBuffer for other
      // browsers and older builds.
      bytesBase64: arrayBufferToBase64(buffer)
    };
  } catch (error) {
    const detail = errorDetail(error);
    const permissionLike = /not allowed|denied|permission|load failed|operation is insecure/i.test(detail);
    const errorCode = error?.name === "AbortError"
      ? "FETCH_TIMEOUT"
      : permissionLike
        ? "IMAGE_ACCESS_BLOCKED"
        : "FETCH_FAILED";
    if (permissionLike) {
      await recordImageAccessResult(false, detail);
    }
    return failure(errorCode, undefined, detail);
  } finally {
    clearTimeout(timeoutId);
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function recordImageAccessResult(verified, detail = "") {
  try {
    await extensionApi.storage.local.set({
      imageAccessVerified: verified === true,
      imageAccessVerifiedAt: Date.now(),
      imageAccessLastError: verified ? "" : detail
    });
  } catch {
    // Access verification is diagnostic state only. Never fail the copy because
    // Safari could not persist it.
  }
}

function errorDetail(error) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function failure(errorCode, status, detail) {
  return {
    ok: false,
    errorCode,
    ...(Number.isInteger(status) ? { status } : {}),
    ...(detail ? { detail } : {})
  };
}
