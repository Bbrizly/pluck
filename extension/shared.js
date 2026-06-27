(function attachPinCopyShared(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.PinCopyShared = api;
})(globalThis, function createPinCopyShared() {
  "use strict";

  const FETCH_MESSAGE_TYPE = "FETCH_SELECTED_IMAGE";
  const CAPTURE_MESSAGE_TYPE = "CAPTURE_VISIBLE_PIN";
  const ALLOWED_IMAGE_HOSTS = Object.freeze(["i.pinimg.com"]);
  const IMAGE_HOST_PERMISSION_ORIGINS = Object.freeze(["https://i.pinimg.com/*"]);
  const MAX_URL_LENGTH = 4096;

  function normalizeImageUrl(rawValue) {
    if (typeof rawValue !== "string" || rawValue.length === 0 || rawValue.length > MAX_URL_LENGTH) {
      return null;
    }

    try {
      const url = new URL(rawValue);
      if (url.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.includes(url.hostname)) {
        return null;
      }

      if (url.username || url.password) {
        return null;
      }

      url.hash = "";
      return url.href;
    } catch {
      return null;
    }
  }

  function parseSrcset(srcset) {
    if (typeof srcset !== "string" || srcset.trim() === "") {
      return [];
    }

    return srcset
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const parts = entry.split(/\s+/);
        const url = normalizeImageUrl(parts[0]);
        if (!url) {
          return null;
        }

        const descriptor = parts[1] || "";
        const widthMatch = descriptor.match(/^(\d+)w$/);
        const densityMatch = descriptor.match(/^(\d+(?:\.\d+)?)x$/);

        return {
          url,
          width: widthMatch ? Number(widthMatch[1]) : 0,
          density: densityMatch ? Number(densityMatch[1]) : 0
        };
      })
      .filter(Boolean);
  }

  function chooseBestImageUrl({ currentSrc, src, srcset, pictureSrcsets = [], renderedWidth = 0 }) {
    const candidates = new Map();

    function addCandidate(rawUrl, score) {
      const url = normalizeImageUrl(rawUrl);
      if (!url) {
        return;
      }
      const previous = candidates.get(url) || 0;
      candidates.set(url, Math.max(previous, Number.isFinite(score) ? score : 0));
    }

    for (const candidate of parseSrcset(srcset)) {
      addCandidate(candidate.url, candidate.width || candidate.density * renderedWidth);
    }

    for (const pictureSrcset of pictureSrcsets) {
      for (const candidate of parseSrcset(pictureSrcset)) {
        addCandidate(candidate.url, candidate.width || candidate.density * renderedWidth);
      }
    }

    addCandidate(currentSrc, renderedWidth || 1);
    addCandidate(src, 0);

    const ranked = [...candidates.entries()].sort((left, right) => right[1] - left[1]);
    return ranked.length > 0 ? ranked[0][0] : null;
  }

  function isCaptureMessage(message) {
    return Boolean(
      message
      && typeof message === "object"
      && !Array.isArray(message)
      && Object.keys(message).length === 1
      && message.type === CAPTURE_MESSAGE_TYPE
    );
  }

  function isFetchMessage(message) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      return false;
    }

    const keys = Object.keys(message).sort();
    if (keys.length !== 2 || keys[0] !== "type" || keys[1] !== "url") {
      return false;
    }

    return message.type === FETCH_MESSAGE_TYPE && normalizeImageUrl(message.url) !== null;
  }

  return Object.freeze({
    FETCH_MESSAGE_TYPE,
    CAPTURE_MESSAGE_TYPE,
    ALLOWED_IMAGE_HOSTS,
    IMAGE_HOST_PERMISSION_ORIGINS,
    MAX_URL_LENGTH,
    normalizeImageUrl,
    parseSrcset,
    chooseBestImageUrl,
    isFetchMessage,
    isCaptureMessage
  });
});
