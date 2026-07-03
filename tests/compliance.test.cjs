"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension/manifest.json"), "utf8"));
const contentSource = fs.readFileSync(path.join(root, "extension/content.js"), "utf8");
const backgroundSource = fs.readFileSync(path.join(root, "extension/background.js"), "utf8");
const pageClipboardSource = fs.readFileSync(path.join(root, "extension/page-clipboard.js"), "utf8");
const popupSource = fs.readFileSync(path.join(root, "extension/popup.js"), "utf8");
const popupHtml = fs.readFileSync(path.join(root, "extension/popup.html"), "utf8");

test("manifest never requests all-sites, clipboard-read, cookies, tabs, or downloads", () => {
  const serialized = JSON.stringify(manifest);
  for (const forbidden of ["<all_urls>", "clipboardRead", "cookies", "tabs", "downloads", "webRequest"]) {
    assert.equal(serialized.includes(forbidden), false, `forbidden permission found: ${forbidden}`);
  }
});

test("page content script performs no direct network fetch or clipboard read", () => {
  assert.equal(/\bfetch\s*\(/.test(contentSource), false);
  assert.equal(/clipboard\.(read|readText)\s*\(/.test(contentSource), false);
});

test("background fetch explicitly omits credentials and validates the final URL", () => {
  assert.match(backgroundSource, /credentials:\s*"omit"/);
  assert.match(backgroundSource, /Shared\.normalizeImageUrl\(response\.url\)/);
});

test("content sends only bridge-init, selected-image fetch, and visible-capture messages", () => {
  const sendMessageCalls = contentSource.match(/runtime\.sendMessage\s*\(/g) || [];
  assert.equal(sendMessageCalls.length, 3);
  assert.match(contentSource, /type:\s*INIT_BRIDGE_MESSAGE_TYPE/);
  assert.match(contentSource, /type:\s*Shared\.FETCH_MESSAGE_TYPE/);
  assert.match(contentSource, /type:\s*Shared\.CAPTURE_MESSAGE_TYPE/);
});


test("Safari clipboard bridge is exposed only to Pinterest and requests narrow bridge permissions", () => {
  assert.equal(manifest.permissions.includes("clipboardWrite"), true);
  assert.equal(manifest.permissions.includes("scripting"), true);
  assert.deepEqual(manifest.web_accessible_resources, [{
    resources: ["page-clipboard.js"],
    matches: ["https://*.pinterest.com/*", "https://*.pinterest.ca/*"]
  }]);
});

test("clipboard bridge is declared in the webpage main world at document start", () => {
  const bridgeEntry = manifest.content_scripts.find((entry) => entry.js?.includes("page-clipboard.js"));
  assert.ok(bridgeEntry, "page clipboard bridge content-script entry is missing");
  assert.equal(bridgeEntry.world, "MAIN");
  assert.equal(bridgeEntry.run_at, "document_start");
});

test("background main-world injection is limited to Pinterest sender tabs", () => {
  assert.match(backgroundSource, /isPinterestPageUrl\(sender\?\.url \|\| sender\?\.tab\?\.url\)/);
  assert.match(backgroundSource, /scripting\.executeScript/);
  assert.match(backgroundSource, /world:\s*"MAIN"/);
  assert.match(backgroundSource, /files:\s*\["page-clipboard\.js"\]/);
});

test("main-page bridge opens the clipboard from the original trusted click", () => {
  assert.match(pageClipboardSource, /addEventListener\("click"/);
  assert.match(pageClipboardSource, /event\.isTrusted\s*!==\s*true/);
  assert.match(pageClipboardSource, /navigator\.clipboard\.write\(\[item\]\)/);
  assert.equal(pageClipboardSource.includes("clipboard-start"), false);
});

test("isolated content script does not call the clipboard API directly", () => {
  assert.equal(/navigator\.clipboard\.(write|writeText)\s*\(/.test(contentSource), false);
});


test("Pinterest CDN access is optional, explicitly requested, and never gated by contains()", () => {
  assert.deepEqual(manifest.optional_host_permissions, ["https://i.pinimg.com/*"]);
  assert.equal(manifest.host_permissions.includes("https://*.pinimg.com/*"), false);
  assert.match(popupSource, /permissions\?\.request/);
  assert.equal(/permissions\?\.contains/.test(contentSource), false);
  assert.equal(/permissions\?\.contains/.test(backgroundSource), false);
});

test("real fetch success, not permissions.contains, verifies image access", () => {
  assert.match(backgroundSource, /recordImageAccessResult\(true\)/);
  assert.match(backgroundSource, /IMAGE_ACCESS_BLOCKED/);
  assert.match(popupSource, /CDN fetch has worked before/);
});

test("hover copy button is not blocked behind an Allow access state", () => {
  assert.equal(contentSource.includes('setButtonState("Allow access"'), false);
  assert.match(contentSource, /setButtonState\("Copy", false\)/);
});

test("clipboard bridge only opens after the content script arms a real copy", () => {
  assert.match(pageClipboardSource, /COPY_ACTION_ATTRIBUTE/);
  assert.match(pageClipboardSource, /getAttribute\(COPY_ACTION_ATTRIBUTE\) !== "copy"/);
  assert.match(contentSource, /setAttribute\(COPY_ACTION_ATTRIBUTE, "copy"\)/);
  assert.match(contentSource, /removeAttribute\(COPY_ACTION_ATTRIBUTE\)/);
});

test("background returns diagnostic fetch details instead of a bare FETCH_FAILED", () => {
  assert.match(backgroundSource, /errorDetail\(error\)/);
  assert.match(backgroundSource, /detail/);
  assert.match(contentSource, /response\?\.detail/);
});


test("visible screenshot fallback is narrow and only captures Pinterest sender tabs", () => {
  assert.equal(manifest.permissions.includes("activeTab"), true);
  assert.equal(manifest.permissions.includes("tabs"), false);
  assert.match(backgroundSource, /Shared\.isCaptureMessage\(message\)/);
  assert.match(backgroundSource, /captureVisiblePinterestTab\(sender\)/);
  assert.match(backgroundSource, /isPinterestPageUrl\(sender\?\.url \|\| tab\.url\)/);
  assert.match(backgroundSource, /tabs\?\.captureVisibleTab/);
});

test("higher-quality failure automatically falls back to a cropped visible Pin", () => {
  assert.match(contentSource, /Higher-quality path failed; trying loaded image/);
  assert.match(contentSource, /captureVisiblePinToPng\(\)/);
  assert.match(contentSource, /getBoundingClientRect\(\)/);
  assert.match(contentSource, /context\.drawImage/);
  assert.match(contentSource, /Copied using sanitized screen fallback/);
});


test("fallback order is optional CDN, loaded image canvas, then fully suppressed screenshot", () => {
  const fetchIndex = contentSource.indexOf("fetchHighQualityImageToPng(url)");
  const loadedIndex = contentSource.indexOf("copyLoadedImageElementToPng()");
  const captureIndex = contentSource.indexOf("captureVisiblePinToPng()");
  assert.ok(fetchIndex >= 0 && loadedIndex > fetchIndex && captureIndex > loadedIndex);
  assert.match(contentSource, /prepareCleanPinterestCapture\(\)/);
  assert.match(contentSource, /UI_ROOT_SELECTOR/);
  assert.match(contentSource, /waitForCaptureUiToDisappear\(\)/);
});


test("diagnostics identify which copy source actually succeeded", () => {
  assert.match(contentSource, /higher-quality CDN image/);
  assert.match(contentSource, /already-loaded Pinterest image/);
  assert.match(contentSource, /sanitized visible screen crop/);
  assert.match(contentSource, /Image copied successfully via/);
});


test("higher-quality mode is an explicit toggle that defaults off", () => {
  assert.match(popupHtml, /id="highQualityEnabled"/);
  assert.match(popupSource, /highQualityEnabled:\s*false/);
  assert.match(contentSource, /highQualityEnabled:\s*false/);
  assert.match(contentSource, /if \(highQualityEnabled\)/);
  assert.match(contentSource, /Higher-quality mode is off; skipping the Pinterest CDN request/);
});

test("higher-quality byte transport uses Safari-safe base64 and preserves fallback", () => {
  assert.match(backgroundSource, /bytesBase64:\s*arrayBufferToBase64\(buffer\)/);
  assert.match(backgroundSource, /function arrayBufferToBase64/);
  assert.match(contentSource, /decodeBase64Buffer\(response\.bytesBase64\)/);
  assert.match(contentSource, /IMAGE_BYTES_MISSING/);
  assert.match(contentSource, /falling back automatically/);
});

test("v0.8.0 owns one versioned UI instance and removes only newly inserted stale roots", () => {
  assert.match(contentSource, /CONTENT_VERSION_ATTRIBUTE/);
  assert.match(contentSource, /pluck-v80-overlay-root/);
  assert.match(contentSource, /pluck-v80-diagnostics-root/);
  assert.match(contentSource, /UI_ROOT_SELECTOR/);
  assert.match(contentSource, /startUiDeduplicationGuard\(\)/);
  assert.match(contentSource, /observer\.observe\(document\.documentElement, \{ childList: true \}\)/);
  assert.doesNotMatch(contentSource, /subtree:\s*true/);
  assert.match(contentSource, /Removed \$\{removed\} stale Pluck UI root/);
});

test("diagnostics updates do not create a MutationObserver feedback loop", () => {
  assert.match(contentSource, /textContent !== String\(value\)/);
  assert.match(contentSource, /fields\.event\.textContent !== eventMessage/);
});

test("screen fallback clears Pinterest hover state and strips overlay branches before capture", () => {
  assert.match(contentSource, /prepareCleanPinterestCapture\(\)/);
  assert.match(contentSource, /data-pluck-capture-shield/);
  assert.match(contentSource, /data-pluck-capture-path/);
  assert.match(contentSource, /visibility", "hidden", "important"/);
  assert.match(contentSource, /pointer-events", "none", "important"/);
  assert.match(contentSource, /Pinterest hover UI suppressed/);
  assert.match(contentSource, /CAPTURE_SETTLE_MS = 420/);
  assert.match(contentSource, /sanitized visible screen crop/);
});

test("higher-quality toggle persists before Safari can close the popup permission sheet", () => {
  const saveIndex = popupSource.indexOf("const modeSavePromise = extensionApi.storage.local.set");
  const requestIndex = popupSource.indexOf("extensionApi.permissions.request");
  const awaitSaveIndex = popupSource.indexOf("await modeSavePromise");
  assert.ok(saveIndex >= 0 && requestIndex > saveIndex && awaitSaveIndex > requestIndex);
});


test("persistent Last visited overlays are explicitly removed and verified before capture", () => {
  assert.match(contentSource, /pin-card-last-visited-overlay/);
  assert.match(contentSource, /PINTEREST_PERSISTENT_IMAGE_OVERLAY_SELECTOR/);
  assert.match(contentSource, /data-pluck-persistent-overlay/);
  assert.match(contentSource, /verifyClean\(\)/);
  assert.match(contentSource, /CAPTURE_PERSISTENT_OVERLAY_REMAINED/);
  assert.match(contentSource, /Persistent image overlays suppressed, including Last visited/);
});

test("Pin capture boundary does not stop at the inner pinrep-image container", () => {
  const cardFunction = contentSource.slice(
    contentSource.indexOf("function findLikelyCard"),
    contentSource.indexOf("function isInsidePinterestChrome")
  );
  assert.doesNotMatch(cardFunction, /\[data-test-id="pinrep-image"\]/);
  assert.match(cardFunction, /pinWrapper/);
  assert.match(cardFunction, /data-test-id="pin"/);
});
