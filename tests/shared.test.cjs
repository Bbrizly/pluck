"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Shared = require("../extension/shared.js");

test("accepts only HTTPS i.pinimg.com image URLs", () => {
  assert.equal(Shared.normalizeImageUrl("https://i.pinimg.com/736x/example.jpg"), "https://i.pinimg.com/736x/example.jpg");
  assert.equal(Shared.normalizeImageUrl("http://i.pinimg.com/736x/example.jpg"), null);
  assert.equal(Shared.normalizeImageUrl("https://evil.example/example.jpg"), null);
  assert.equal(Shared.normalizeImageUrl("data:image/png;base64,abc"), null);
  assert.equal(Shared.normalizeImageUrl("https://user:pass@i.pinimg.com/a.jpg"), null);
});

test("selects the widest candidate exposed by the selected image", () => {
  const result = Shared.chooseBestImageUrl({
    currentSrc: "https://i.pinimg.com/474x/current.jpg",
    src: "https://i.pinimg.com/236x/fallback.jpg",
    srcset: [
      "https://i.pinimg.com/236x/a.jpg 236w",
      "https://i.pinimg.com/474x/b.jpg 474w",
      "https://i.pinimg.com/736x/c.jpg 736w"
    ].join(", "),
    renderedWidth: 320
  });

  assert.equal(result, "https://i.pinimg.com/736x/c.jpg");
});

test("ignores off-domain entries even when they claim a larger width", () => {
  const result = Shared.chooseBestImageUrl({
    currentSrc: "https://i.pinimg.com/474x/current.jpg",
    srcset: "https://evil.example/huge.jpg 4000w, https://i.pinimg.com/736x/good.jpg 736w",
    renderedWidth: 320
  });

  assert.equal(result, "https://i.pinimg.com/736x/good.jpg");
});

test("fetch message is fail-closed and cannot become a general proxy", () => {
  assert.equal(Shared.isFetchMessage({
    type: Shared.FETCH_MESSAGE_TYPE,
    url: "https://i.pinimg.com/736x/example.jpg"
  }), true);

  assert.equal(Shared.isFetchMessage({
    type: Shared.FETCH_MESSAGE_TYPE,
    url: "https://i.pinimg.com/736x/example.jpg",
    method: "POST"
  }), false);

  assert.equal(Shared.isFetchMessage({
    type: Shared.FETCH_MESSAGE_TYPE,
    url: ["https://i.pinimg.com/a.jpg", "https://i.pinimg.com/b.jpg"]
  }), false);

  assert.equal(Shared.isFetchMessage({
    type: Shared.FETCH_MESSAGE_TYPE,
    url: "https://example.com/a.jpg"
  }), false);
});

test("srcset density descriptors use the rendered width", () => {
  const result = Shared.chooseBestImageUrl({
    srcset: "https://i.pinimg.com/a.jpg 1x, https://i.pinimg.com/b.jpg 2x",
    renderedWidth: 300
  });
  assert.equal(result, "https://i.pinimg.com/b.jpg");
});


test("capture message is fail-closed and has no arbitrary URL or options", () => {
  assert.equal(Shared.isCaptureMessage({ type: Shared.CAPTURE_MESSAGE_TYPE }), true);
  assert.equal(Shared.isCaptureMessage({ type: Shared.CAPTURE_MESSAGE_TYPE, url: "https://example.com" }), false);
  assert.equal(Shared.isCaptureMessage({ type: Shared.CAPTURE_MESSAGE_TYPE, format: "jpeg" }), false);
});
