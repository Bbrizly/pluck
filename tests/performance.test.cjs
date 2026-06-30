const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const contentSource = fs.readFileSync(path.join(root, "extension", "content.js"), "utf8");

function functionBody(name) {
  const start = contentSource.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} is missing`);
  const next = contentSource.indexOf("\n  function ", start + 10);
  return contentSource.slice(start, next >= 0 ? next : contentSource.length);
}

test("deduplication does not observe Pinterest's full dynamic subtree", () => {
  const body = functionBody("startUiDeduplicationGuard");
  assert.match(body, /observer\.observe\(document\.documentElement, \{ childList: true \}\)/);
  assert.doesNotMatch(body, /subtree:\s*true/);
  assert.doesNotMatch(body, /attributes:\s*true/);
  assert.doesNotMatch(body, /document\.querySelectorAll/);
});

test("pointer movement only records coordinates; DOM hit testing happens on element transitions", () => {
  const track = functionBody("trackPointer");
  assert.doesNotMatch(track, /elementsFromPoint|getBoundingClientRect|getComputedStyle|requestAnimationFrame/);
  assert.match(contentSource, /addEventListener\("pointerover", onPointerOver/);
  assert.match(contentSource, /function imageFromPointerEvent/);
});

test("scrolling hides the overlay and performs one debounced idle hit test", () => {
  const body = functionBody("onViewportScroll");
  assert.match(body, /hideOverlay\(\)/);
  assert.match(body, /setTimeout/);
  assert.match(body, /SCROLL_IDLE_MS/);
  assert.doesNotMatch(body, /getBoundingClientRect|elementsFromPoint/);
});

test("hidden diagnostics cause no DOM writes or console logging", () => {
  const body = functionBody("updateDiagnostics");
  const guardIndex = body.indexOf("if (!debugEnabled)");
  const textWriteIndex = body.indexOf("textContent", guardIndex + 1);
  const consoleIndex = body.indexOf("console.info", guardIndex + 1);
  assert.ok(guardIndex >= 0);
  assert.ok(textWriteIndex > guardIndex);
  assert.ok(consoleIndex > guardIndex);
});

test("fixed UI avoids expensive backdrop filtering during scroll", () => {
  assert.equal(contentSource.includes("backdrop-filter"), false);
  assert.match(contentSource, /contain: layout style paint/);
});

test("target inspection avoids ancestor geometry loops and full video collections", () => {
  const inspect = functionBody("inspectTarget");
  const context = functionBody("findPinContext");
  assert.doesNotMatch(context, /for \(let depth|getBoundingClientRect/);
  assert.doesNotMatch(inspect, /querySelectorAll\("video"\)/);
  assert.match(inspect, /querySelector\("video"\)/);
});

test("v0.8 roots do not use the legacy generic marker that old builds delete", () => {
  const overlay = functionBody("createOverlay");
  const diagnostics = functionBody("createDiagnosticsPanel");
  assert.doesNotMatch(overlay, /setAttribute\(UI_ROOT_ATTRIBUTE/);
  assert.doesNotMatch(diagnostics, /setAttribute\(UI_ROOT_ATTRIBUTE/);
  assert.match(overlay, /data-pin-copy-ui-version/);
  assert.match(diagnostics, /data-pin-copy-ui-version/);
});
