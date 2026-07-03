(() => {
  "use strict";

  const CONTENT_VERSION = "0.8.0";
  const CONTENT_VERSION_ATTRIBUTE = "data-pluck-content-version";
  const UI_OWNER_ATTRIBUTE = "data-pluck-ui-owner";
  const UI_ROOT_ATTRIBUTE = "data-pluck-ui-root";
  const OVERLAY_ROOT_ID = "pluck-v80-overlay-root";
  const DIAGNOSTICS_ROOT_ID = "pluck-v80-diagnostics-root";
  const LEGACY_UI_ROOT_IDS = Object.freeze(["pluck-extension-root", "pluck-diagnostics-root"]);
  const UI_ROOT_SELECTOR = `[${UI_ROOT_ATTRIBUTE}], #${OVERLAY_ROOT_ID}, #${DIAGNOSTICS_ROOT_ID}, #${LEGACY_UI_ROOT_IDS[0]}, #${LEGACY_UI_ROOT_IDS[1]}`;
  const ownerToken = globalThis.crypto?.randomUUID?.() || `pluck-owner-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  // v0.8.0 uses versioned root IDs so an older local build cannot delete the new
  // UI with its own stale MutationObserver. The new controller continuously
  // removes legacy roots and reclaims the shared page-version marker.
  const documentRoot = document.documentElement;
  if (documentRoot?.getAttribute(CONTENT_VERSION_ATTRIBUTE) === CONTENT_VERSION
      && document.getElementById(OVERLAY_ROOT_ID)) {
    return;
  }
  documentRoot?.setAttribute(CONTENT_VERSION_ATTRIBUTE, CONTENT_VERSION);
  removeExistingPluckUi();

  const extensionApi = globalThis.browser ?? globalThis.chrome;
  const Shared = globalThis.PluckShared;

  const MIN_IMAGE_SIZE = 120;
  const MAX_PIXEL_COUNT = 60_000_000;
  const SUCCESS_DURATION_MS = 1500;
  const LEAVE_GRACE_MS = 100;
  const CAPTURE_SETTLE_MS = 420;
  const SCROLL_IDLE_MS = 110;
  const PINTEREST_PERSISTENT_IMAGE_OVERLAY_SELECTOR = [
    '[data-test-id="pin-card-last-visited-overlay"]',
    '[data-test-id="contentLayer"]',
    '[data-test-id*="last-visited" i]',
    '[aria-label="Last visited"]'
  ].join(", ");
  const PAGE_CLIPBOARD_RESULT_EVENT = "pluck:clipboard-result";
  const PAGE_CLIPBOARD_READY_EVENT = "pluck:clipboard-bridge-ready";
  const PAGE_CLIPBOARD_PROBE_EVENT = "pluck:clipboard-bridge-probe";
  const PAGE_CLIPBOARD_CHANNEL = "pluck-extension-clipboard";
  const INIT_BRIDGE_MESSAGE_TYPE = "PLUCK_INIT_PAGE_BRIDGE";
  const PAGE_REQUEST_ID_ATTRIBUTE = "data-pluck-request-id";
  const PAGE_RESULT_ID_ATTRIBUTE = "data-pluck-result-id";
  const PAGE_RESULT_OK_ATTRIBUTE = "data-pluck-result-ok";
  const PAGE_RESULT_ERROR_ATTRIBUTE = "data-pluck-result-error";
  const COPY_ACTION_ATTRIBUTE = "data-pluck-action";

  let enabled = true;
  let debugEnabled = false;
  let highQualityEnabled = false;
  let activeTarget = null;
  let copyInProgress = false;
  let successTimer = null;
  let leaveTimer = null;
  let scrollIdleTimer = null;
  let resizeFrame = null;
  let lastPointer = { x: -1, y: -1 };
  let lastOverlayTransform = "";
  let pageClipboardBridgeReady = false;
  let lastCopySource = "not started";
  const pageClipboardResults = new Map();
  const pageClipboardWaiters = new Map();

  const overlay = createOverlay();
  const diagnostics = createDiagnosticsPanel();
  startUiDeduplicationGuard();

  installPageClipboardBridge();
  window.addEventListener(PAGE_CLIPBOARD_RESULT_EVENT, onPageClipboardResult, true);
  void initialize();

  function removeExistingPluckUi() {
    for (const node of document.querySelectorAll(UI_ROOT_SELECTOR)) {
      node.remove();
    }
  }

  function startUiDeduplicationGuard() {
    const removeIfForeignRoot = (node) => {
      if (!(node?.nodeType === Node.ELEMENT_NODE)) {
        return 0;
      }

      if (!node.matches?.(UI_ROOT_SELECTOR)) {
        return 0;
      }
      if (node === overlay.host || node === diagnostics.host) {
        return 0;
      }
      node.remove();
      return 1;
    };

    // Pluck roots are direct children of <html>. Observe only direct child
    // insertions instead of Pinterest's entire, constantly changing subtree.
    // v0.7.1 watched every DOM mutation and ran document-wide selectors, which
    // made infinite-feed scrolling noticeably slower.
    const observer = new MutationObserver((records) => {
      let removed = 0;
      for (const record of records) {
        for (const node of record.addedNodes) {
          removed += removeIfForeignRoot(node);
        }
      }

      if (removed > 0) {
        updateDiagnostics(
          { instances: `1 active; removed ${removed} stale root${removed === 1 ? "" : "s"}` },
          `Removed ${removed} stale Pluck UI root${removed === 1 ? "" : "s"}`
        );
      }
    });

    observer.observe(document.documentElement, { childList: true });
    updateDiagnostics({ instances: "1 active controller" });
  }

  function installPageClipboardBridge() {
    const markReady = () => {
      if (pageClipboardBridgeReady) {
        return;
      }
      pageClipboardBridgeReady = true;
      if (!copyInProgress && overlay.host.style.display !== "none") {
        setIdleButtonState();
      }
      updateDiagnostics({ copy: "Clipboard bridge ready" }, "Main-page clipboard bridge loaded");
    };

    const probe = () => {
      window.dispatchEvent(new Event(PAGE_CLIPBOARD_PROBE_EVENT));
      const marker = document.documentElement?.getAttribute("data-pluck-bridge") || "";
      if (marker.startsWith("ready")) {
        markReady();
      }
    };

    window.addEventListener(PAGE_CLIPBOARD_READY_EVENT, markReady, true);

    // v0.4 declares page-clipboard.js as a MAIN-world content script at
    // document_start. Probe it because its first ready event may have fired
    // before this isolated content script loaded.
    probe();
    setTimeout(probe, 50);
    setTimeout(probe, 250);

    // Ask Safari's extension scripting API to inject the same file into the
    // page's MAIN world. This bypasses Pinterest page CSP and also covers
    // Safari versions that ignore the static manifest world declaration.
    void extensionApi.runtime.sendMessage({ type: INIT_BRIDGE_MESSAGE_TYPE })
      .then((result) => {
        if (result?.ok) {
          updateDiagnostics({ copy: "Clipboard bridge injected; handshaking" }, "Safari main-world bridge injection completed");
          probe();
          setTimeout(probe, 50);
          return;
        }
        updateDiagnostics(
          { copy: `Bridge injection fallback: ${result?.errorCode || "unknown"}` },
          "Safari scripting injection unavailable; trying manifest and DOM fallbacks"
        );
      })
      .catch((error) => {
        updateDiagnostics(
          { copy: "Bridge injection request failed" },
          `Safari bridge injection error: ${error instanceof Error ? error.message : String(error)}`
        );
      });

    // Compatibility fallback for Safari builds that ignore the manifest's
    // MAIN-world declaration. Pinterest's CSP may block this path, so it is a
    // fallback only rather than the primary bootstrap.
    setTimeout(() => {
      if (pageClipboardBridgeReady) {
        return;
      }

      const script = document.createElement("script");
      script.src = extensionApi.runtime.getURL("page-clipboard.js");
      script.dataset.pluckBridge = "fallback";
      script.addEventListener("load", () => {
        script.remove();
        probe();
      }, { once: true });
      script.addEventListener("error", () => {
        script.remove();
        updateDiagnostics(
          { copy: "Clipboard bridge failed to load" },
          "Main-page bridge unavailable; reload after enabling the new build"
        );
      }, { once: true });
      (document.head || document.documentElement).appendChild(script);
    }, 400);

    setTimeout(() => {
      if (!pageClipboardBridgeReady) {
        updateDiagnostics(
          { copy: "Bridge not ready; reload Pinterest" },
          "Main-page clipboard bridge did not initialize"
        );
      }
    }, 1500);
  }

  async function initialize() {
    try {
      const stored = await extensionApi.storage.local.get({
        enabled: true,
        debugEnabled: false,
        highQualityEnabled: false
      });
      enabled = stored.enabled !== false;
      debugEnabled = stored.debugEnabled === true;
      highQualityEnabled = stored.highQualityEnabled === true;
    } catch {
      enabled = true;
      debugEnabled = false;
      highQualityEnabled = false;
    }

    renderDiagnosticsVisibility();
    updateDiagnostics({
      script: `Loaded v${CONTENT_VERSION}`,
      instances: "1 active controller",
      extension: enabled ? "Enabled" : "Disabled",
      hover: "Move over a Pinterest image",
      detection: "Waiting",
      button: "Hidden",
      copy: describeCopyReadiness()
    }, `Content script initialized; higher-quality mode ${highQualityEnabled ? "on" : "off"}`);

    extensionApi.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }

      if (Object.prototype.hasOwnProperty.call(changes, "enabled")) {
        enabled = changes.enabled.newValue !== false;
        updateDiagnostics({ extension: enabled ? "Enabled" : "Disabled" }, `Extension ${enabled ? "enabled" : "disabled"}`);
        if (!enabled) {
          hideOverlay();
        }
      }

      if (Object.prototype.hasOwnProperty.call(changes, "debugEnabled")) {
        debugEnabled = changes.debugEnabled.newValue === true;
        renderDiagnosticsVisibility();
        updateDiagnostics({}, debugEnabled ? "Diagnostic panel enabled" : "Diagnostic panel disabled");
      }

      if (Object.prototype.hasOwnProperty.call(changes, "highQualityEnabled")) {
        highQualityEnabled = changes.highQualityEnabled.newValue === true;
        updateDiagnostics(
          { copy: describeCopyReadiness() },
          `Higher-quality mode ${highQualityEnabled ? "enabled" : "disabled"}`
        );
      }
    });

    document.addEventListener("pointermove", trackPointer, { capture: true, passive: true });
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("pointerleave", scheduleHide, true);
    window.addEventListener("scroll", onViewportScroll, { passive: true });
    window.addEventListener("resize", onViewportResize, { passive: true });
  }

  function createOverlay() {
    const host = document.createElement("div");
    host.id = OVERLAY_ROOT_ID;
    host.setAttribute(UI_OWNER_ATTRIBUTE, ownerToken);
    host.setAttribute("data-pluck-ui-version", CONTENT_VERSION);
    host.setAttribute("data-pluck-overlay", "true");
    host.style.position = "fixed";
    host.style.left = "0";
    host.style.top = "0";
    host.style.zIndex = "2147483646";
    host.style.display = "none";
    host.style.pointerEvents = "auto";

    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        button {
          all: initial;
          box-sizing: border-box;
          min-width: 86px;
          height: 34px;
          padding: 0 12px;
          border-radius: 9px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(20, 20, 20, 0.86);
          color: #fff;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
          contain: layout style paint;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          cursor: pointer;
          user-select: none;
          transition: opacity 140ms ease, transform 140ms ease, background 140ms ease;
        }
        button:hover { background: rgba(8, 8, 8, 0.94); }
        button:active { transform: scale(0.97); }
        button:focus-visible { outline: 3px solid rgba(255, 255, 255, 0.92); outline-offset: 2px; }
        button[disabled] { cursor: default; opacity: 0.92; }
        svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; }
        @media (prefers-reduced-motion: reduce) { button { transition: none; } }
      </style>
      <button type="button" aria-label="Copy image">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="8" y="8" width="11" height="11" rx="2"></rect>
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>
        </svg>
        <span>Copy</span>
      </button>
      <span aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)"></span>
    `;

    const button = shadow.querySelector("button");
    const label = shadow.querySelector("button span");
    const liveRegion = shadow.querySelector('[aria-live="polite"]');

    button.addEventListener("click", onCopyClick);
    button.addEventListener("pointerenter", cancelHide);
    button.addEventListener("pointerleave", scheduleHide);

    document.documentElement.appendChild(host);
    return { host, button, label, liveRegion };
  }

  function createDiagnosticsPanel() {
    const host = document.createElement("div");
    host.id = DIAGNOSTICS_ROOT_ID;
    host.setAttribute(UI_OWNER_ATTRIBUTE, ownerToken);
    host.setAttribute("data-pluck-ui-version", CONTENT_VERSION);
    host.style.position = "fixed";
    host.style.top = "12px";
    host.style.right = "12px";
    host.style.zIndex = "2147483647";
    host.style.display = "none";
    host.style.pointerEvents = "none";

    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .panel {
          width: 290px;
          box-sizing: border-box;
          padding: 12px;
          border: 1px solid rgba(255,255,255,.2);
          border-radius: 11px;
          background: rgba(16,16,18,.92);
          color: #fff;
          box-shadow: 0 8px 30px rgba(0,0,0,.35);
          contain: layout style paint;
          font: 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .title { display:flex; align-items:center; gap:8px; font-weight:700; margin-bottom:9px; }
        .dot { width:9px; height:9px; border-radius:999px; background:#4ade80; box-shadow:0 0 0 3px rgba(74,222,128,.16); }
        .grid { display:grid; grid-template-columns:76px 1fr; gap:5px 8px; }
        .key { color:rgba(255,255,255,.58); }
        .value { color:#fff; overflow-wrap:anywhere; }
        .event { margin-top:9px; padding-top:8px; border-top:1px solid rgba(255,255,255,.12); color:#fde68a; }
      </style>
      <div class="panel">
        <div class="title"><span class="dot"></span><span>Pluck diagnostics v0.8.0</span></div>
        <div class="grid">
          <span class="key">Script</span><span class="value" data-field="script">Starting…</span>
          <span class="key">Instances</span><span class="value" data-field="instances">Checking…</span>
          <span class="key">Extension</span><span class="value" data-field="extension">Unknown</span>
          <span class="key">Hover</span><span class="value" data-field="hover">Waiting</span>
          <span class="key">Detection</span><span class="value" data-field="detection">Waiting</span>
          <span class="key">Button</span><span class="value" data-field="button">Hidden</span>
          <span class="key">Copy</span><span class="value" data-field="copy">Not started</span>
        </div>
        <div class="event" data-field="event">Loading content script…</div>
      </div>
    `;

    const fields = {};
    for (const element of shadow.querySelectorAll("[data-field]")) {
      fields[element.dataset.field] = element;
    }

    document.documentElement.appendChild(host);
    return { host, fields, state: {} };
  }

  function renderDiagnosticsVisibility() {
    diagnostics.host.style.display = debugEnabled ? "block" : "none";
    if (!debugEnabled) {
      return;
    }

    for (const [key, value] of Object.entries(diagnostics.state)) {
      if (diagnostics.fields[key] && diagnostics.fields[key].textContent !== String(value)) {
        diagnostics.fields[key].textContent = String(value);
      }
    }
  }

  function updateDiagnostics(patch, eventMessage) {
    Object.assign(diagnostics.state, patch);
    if (eventMessage) {
      diagnostics.state.event = eventMessage;
    }

    // Diagnostics are development UI. When disabled, do no shadow-DOM writes
    // and no console logging. v0.7.1 still updated hidden diagnostics on every
    // hover, which added avoidable work to Pinterest's hot interaction path.
    if (!debugEnabled) {
      return;
    }

    for (const [key, value] of Object.entries(patch)) {
      if (diagnostics.fields[key] && diagnostics.fields[key].textContent !== String(value)) {
        diagnostics.fields[key].textContent = String(value);
      }
    }

    if (eventMessage) {
      if (diagnostics.fields.event.textContent !== eventMessage) {
        diagnostics.fields.event.textContent = eventMessage;
      }
      console.info(`[Pluck] ${eventMessage}`);
    }
  }

  function trackPointer(event) {
    lastPointer = { x: event.clientX, y: event.clientY };
  }

  function onPointerOver(event) {
    trackPointer(event);
    cancelHide();

    if (!enabled || copyInProgress || event.composedPath?.().includes(overlay.host)) {
      return;
    }

    const image = imageFromPointerEvent(event);
    updateTargetFromImage(image, event.target);
  }

  function onPointerOut() {
    if (!copyInProgress) {
      scheduleHide();
    }
  }

  function imageFromPointerEvent(event) {
    const directImage = event.composedPath?.().find(isImageElement);
    if (directImage) {
      return directImage;
    }

    // Pinterest often places controls above the image. Only when crossing into
    // a new element do we inspect the hit-test stack to find the image beneath.
    return document.elementsFromPoint(event.clientX, event.clientY).find(isImageElement) || null;
  }

  function updateTargetAtPoint(x, y) {
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) {
      hideOverlay();
      return;
    }
    const image = document.elementsFromPoint(x, y).find(isImageElement) || null;
    updateTargetFromImage(image, document.elementFromPoint(x, y));
  }

  function updateTargetFromImage(image, topElement) {
    if (!enabled) {
      updateDiagnostics({ detection: "Extension disabled", button: "Hidden" });
      hideOverlay();
      return;
    }

    if (copyInProgress || overlay.host.matches(":hover")) {
      return;
    }

    if (!image) {
      if (debugEnabled) {
        updateDiagnostics({
          hover: describeElement(topElement),
          detection: "No <img> under pointer",
          button: "Hidden"
        });
      }
      scheduleHide();
      return;
    }

    const sourceSignature = getImageSourceSignature(image);
    if (activeTarget?.image === image
        && activeTarget.sourceSignature === sourceSignature
        && activeTarget.image.isConnected) {
      showOverlay();
      return;
    }

    const result = inspectTarget(image, sourceSignature);
    if (debugEnabled) {
      updateDiagnostics({ hover: describeImage(image), detection: result.reason });
    }

    if (!result.target) {
      updateDiagnostics({ button: "Hidden" });
      scheduleHide();
      return;
    }

    activeTarget = result.target;
    if (!copyInProgress) {
      setIdleButtonState();
    }
    showOverlay();
    updateDiagnostics({ button: "Shown at bottom-left" }, "Eligible Pinterest image detected");
  }

  function getImageSourceSignature(image) {
    return `${image.currentSrc || ""}|${image.src || ""}|${image.srcset || ""}`;
  }

  function isImageElement(element) {
    return Boolean(element && element.nodeType === Node.ELEMENT_NODE && element.tagName === "IMG");
  }

  function inspectTarget(image, sourceSignature = getImageSourceSignature(image)) {
    if (!image.isConnected) {
      return rejected("Image is disconnected");
    }

    const rect = image.getBoundingClientRect();
    if (rect.width < MIN_IMAGE_SIZE || rect.height < MIN_IMAGE_SIZE) {
      return rejected(`Rejected: too small (${Math.round(rect.width)}×${Math.round(rect.height)})`);
    }

    if (isInsidePinterestChrome(image)) {
      return rejected("Rejected: Pinterest navigation/UI image");
    }

    const context = findPinContext(image);
    const card = context.card;
    if (card?.querySelector("video")) {
      return rejected("Rejected: video Pin");
    }

    const picture = image.closest("picture");
    const pictureSrcsets = picture
      ? [...picture.querySelectorAll("source[srcset]")].map((source) => source.srcset)
      : [];

    const url = Shared.chooseBestImageUrl({
      currentSrc: image.currentSrc,
      src: image.src,
      srcset: image.srcset,
      pictureSrcsets,
      renderedWidth: rect.width
    });

    if (!url) {
      return rejected("Rejected: no approved pinimg.com URL");
    }

    const reason = context.hasPinLink
      ? "Eligible: Pin image and /pin/ link found"
      : "Eligible: large visible pinimg image (fallback match)";

    return { target: { image, url, card, sourceSignature }, reason };
  }

  function rejected(reason) {
    return { target: null, reason };
  }

  function findPinContext(image) {
    const directLink = image.closest('a[href*="/pin/"]');
    const likelyCard = findLikelyCard(image);
    const hasPinLink = Boolean(directLink || likelyCard?.querySelector('a[href*="/pin/"]'));
    return {
      hasPinLink,
      card: likelyCard || directLink || image.parentElement
    };
  }

  function findLikelyCard(image) {
    // The capture boundary must contain every visual layer that can cover the
    // image. `pinrep-image` is too deep: Pinterest renders persistent siblings
    // such as `pin-card-last-visited-overlay` above it. Prefer the outer Pin
    // wrapper/card so the sanitizer can see and hide those branches.
    return image.closest([
      '[data-test-id="pinWrapper"]',
      '[data-test-id="pin"]',
      "article",
      '[role="listitem"]'
    ].join(", "));
  }

  function isInsidePinterestChrome(image) {
    return Boolean(image.closest("header, nav, [role='navigation'], [data-test-id='header']"));
  }

  function describeElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return "Nothing";
    }
    const id = element.id ? `#${element.id}` : "";
    const testId = element.getAttribute?.("data-test-id");
    return `${element.tagName.toLowerCase()}${id}${testId ? `[data-test-id=${testId}]` : ""}`;
  }

  function describeImage(image) {
    const rect = image.getBoundingClientRect();
    const src = image.currentSrc || image.src || "no URL";
    let host = "invalid URL";
    try {
      host = new URL(src).hostname;
    } catch {
      // Keep the fallback label.
    }
    return `img ${Math.round(rect.width)}×${Math.round(rect.height)} from ${host}`;
  }


  function showOverlay() {
    cancelHide();
    if (overlay.host.style.display === "none") {
      overlay.host.style.display = "block";
    }
    repositionOverlay();
  }

  function repositionOverlay() {
    if (!activeTarget?.image?.isConnected || overlay.host.style.display === "none") {
      return;
    }

    const rect = activeTarget.image.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) {
      hideOverlay();
      return;
    }

    const left = Math.max(8, rect.left + 12);
    const top = Math.max(8, rect.bottom - 46);
    const transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    if (transform !== lastOverlayTransform) {
      lastOverlayTransform = transform;
      overlay.host.style.transform = transform;
    }
  }

  function onViewportScroll() {
    if (copyInProgress) {
      return;
    }

    // A fixed translucent overlay is more expensive to repaint while Safari is
    // scrolling. Hide it immediately, then resolve the image under the resting
    // pointer once scrolling has stopped.
    if (overlay.host.style.display !== "none") {
      hideOverlay();
    }
    clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(() => {
      scrollIdleTimer = null;
      updateTargetAtPoint(lastPointer.x, lastPointer.y);
    }, SCROLL_IDLE_MS);
  }

  function onViewportResize() {
    if (resizeFrame !== null) {
      return;
    }
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      if (copyInProgress) {
        repositionOverlay();
      } else {
        updateTargetAtPoint(lastPointer.x, lastPointer.y);
      }
    });
  }

  function scheduleHide() {
    cancelHide();
    leaveTimer = setTimeout(() => {
      if (!overlay.host.matches(":hover") && !copyInProgress) {
        hideOverlay();
      }
    }, LEAVE_GRACE_MS);
  }

  function cancelHide() {
    if (leaveTimer !== null) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
  }

  function hideOverlay() {
    cancelHide();
    clearTimeout(successTimer);
    successTimer = null;
    activeTarget = null;
    copyInProgress = false;
    overlay.host.style.display = "none";
    disarmClipboardRequest();
    setButtonState("Copy", false);
  }

  async function onCopyClick(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!enabled || copyInProgress || !activeTarget?.image?.isConnected) {
      return;
    }

    copyInProgress = true;
    lastCopySource = "resolving";
    setButtonState("Copying…", true);
    updateDiagnostics({ copy: "Started: resolving selected image" }, "Copy click received");

    const selected = inspectTarget(activeTarget.image);
    const selectedUrl = selected.target?.url;
    if (!selectedUrl) {
      copyInProgress = false;
      setButtonState("Try again", false);
      updateDiagnostics({ copy: selected.reason }, "Copy stopped before fetch");
      return;
    }

    try {
      if (!pageClipboardBridgeReady) {
        window.dispatchEvent(new Event(PAGE_CLIPBOARD_PROBE_EVENT));
        throw new Error("PAGE_CLIPBOARD_BRIDGE_NOT_READY_RELOAD_V4");
      }

      // The page bridge has already observed this exact trusted click in the
      // capture phase and opened the clipboard request before this handler runs.
      const requestId = overlay.host.getAttribute(PAGE_REQUEST_ID_ATTRIBUTE);
      if (!requestId) {
        throw new Error("CLIPBOARD_REQUEST_ID_MISSING");
      }
      const pageWriteResult = waitForPageClipboardResult(requestId);
      updateDiagnostics({ copy: "Trusted page click captured; fetching image" }, "Main-page clipboard request opened");

      try {
        const pngBlob = await fetchAndNormalizeToPng(selectedUrl);
        await resolvePageClipboardWrite(requestId, pngBlob);
      } catch (pipelineError) {
        rejectPageClipboardWrite(requestId, pipelineError);
        throw pipelineError;
      }

      await pageWriteResult;

      copyInProgress = false;
      setButtonState("Copied", true);
      updateDiagnostics(
        { copy: `Success: PNG is on clipboard (${lastCopySource})` },
        `Image copied successfully via ${lastCopySource}`
      );
      successTimer = setTimeout(() => {
        if (activeTarget) {
          setIdleButtonState();
          updateTargetAtPoint(lastPointer.x, lastPointer.y);
        }
      }, SUCCESS_DURATION_MS);
    } catch (error) {
      copyInProgress = false;
      armClipboardRequest();
      setButtonState("Try again", false);
      const message = error instanceof Error ? error.message : String(error);
      updateDiagnostics({ copy: `Failed: ${message}` }, `Copy failed: ${message}`);
      if (debugEnabled) {
        console.error("[Pluck] Copy failed", error);
      }
    }
  }

  function armClipboardRequest() {
    if (!pageClipboardBridgeReady) {
      disarmClipboardRequest();
      return null;
    }
    const requestId = globalThis.crypto?.randomUUID?.() || `pluck-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    overlay.host.setAttribute(PAGE_REQUEST_ID_ATTRIBUTE, requestId);
    overlay.host.setAttribute(COPY_ACTION_ATTRIBUTE, "copy");
    return requestId;
  }

  function disarmClipboardRequest() {
    overlay.host.removeAttribute(PAGE_REQUEST_ID_ATTRIBUTE);
    overlay.host.removeAttribute(COPY_ACTION_ATTRIBUTE);
  }

  function setIdleButtonState() {
    if (!pageClipboardBridgeReady) {
      disarmClipboardRequest();
      setButtonState("Starting…", true);
      return;
    }
    armClipboardRequest();
    setButtonState("Copy", false);
  }

  function describeCopyReadiness() {
    if (!pageClipboardBridgeReady) {
      return "Waiting for clipboard bridge";
    }
    return highQualityEnabled
      ? "Clipboard bridge ready; higher-quality mode on with automatic fallback"
      : "Clipboard bridge ready; reliable local mode";
  }

  function onPageClipboardResult() {
    const root = document.documentElement;
    const requestId = root.getAttribute(PAGE_RESULT_ID_ATTRIBUTE);
    if (!requestId) {
      return;
    }

    const result = {
      ok: root.getAttribute(PAGE_RESULT_OK_ATTRIBUTE) === "true",
      error: root.getAttribute(PAGE_RESULT_ERROR_ATTRIBUTE) || "PAGE_CLIPBOARD_WRITE_FAILED"
    };

    const waiter = pageClipboardWaiters.get(requestId);
    if (waiter) {
      pageClipboardWaiters.delete(requestId);
      clearTimeout(waiter.timeoutId);
      result.ok ? waiter.resolve() : waiter.reject(new Error(result.error));
      return;
    }

    pageClipboardResults.set(requestId, result);
  }

  function waitForPageClipboardResult(requestId) {
    const existing = pageClipboardResults.get(requestId);
    if (existing) {
      pageClipboardResults.delete(requestId);
      return existing.ok ? Promise.resolve() : Promise.reject(new Error(existing.error));
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pageClipboardWaiters.delete(requestId);
        reject(new Error("PAGE_CLIPBOARD_RESULT_TIMEOUT"));
      }, 16000);
      pageClipboardWaiters.set(requestId, { resolve, reject, timeoutId });
    });
  }

  async function resolvePageClipboardWrite(requestId, pngBlob) {
    const buffer = await pngBlob.arrayBuffer();
    const message = {
      source: PAGE_CLIPBOARD_CHANNEL,
      type: "resolve",
      requestId,
      buffer
    };

    try {
      window.postMessage(message, "*", [buffer]);
    } catch {
      window.postMessage(message, "*");
    }
  }

  function rejectPageClipboardWrite(requestId, error) {
    window.postMessage({
      source: PAGE_CLIPBOARD_CHANNEL,
      type: "reject",
      requestId,
      error: error instanceof Error ? error.message : String(error)
    }, "*");
  }

  async function fetchAndNormalizeToPng(url) {
    let highQualityFailure = "higher-quality mode disabled";

    if (highQualityEnabled) {
      try {
        return await fetchHighQualityImageToPng(url);
      } catch (error) {
        highQualityFailure = error instanceof Error ? error.message : String(error);
        updateDiagnostics(
          { copy: "Higher-quality path failed; trying loaded image" },
          `Higher-quality path failed (${highQualityFailure}); falling back automatically`
        );
      }
    } else {
      updateDiagnostics(
        { copy: "Using reliable local image path" },
        "Higher-quality mode is off; skipping the Pinterest CDN request"
      );
    }

    try {
      return await copyLoadedImageElementToPng();
    } catch (loadedImageError) {
      const loadedImageMessage = loadedImageError instanceof Error ? loadedImageError.message : String(loadedImageError);
      updateDiagnostics(
        { copy: "Loaded image is protected; capturing visible Pin" },
        `Rendered-image path failed (${loadedImageMessage}); using screen-quality fallback`
      );

      try {
        return await captureVisiblePinToPng();
      } catch (captureError) {
        const captureMessage = captureError instanceof Error ? captureError.message : String(captureError);
        throw new Error(`Higher-quality path: ${highQualityFailure}; loaded-image fallback: ${loadedImageMessage}; visible fallback: ${captureMessage}`);
      }
    }
  }

  async function fetchHighQualityImageToPng(url) {
    updateDiagnostics({ copy: "Trying higher-quality Pinterest image" });
    const response = await extensionApi.runtime.sendMessage({
      type: Shared.FETCH_MESSAGE_TYPE,
      url
    });

    if (!response?.ok) {
      throw new Error(`${response?.errorCode || "IMAGE_FETCH_FAILED"}${response?.detail ? `: ${response.detail}` : ""}`);
    }

    updateDiagnostics({ copy: `Higher-quality image fetched (${response.mimeType})` });
    const buffer = decodeBase64Buffer(response.bytesBase64);
    if (!buffer || buffer.byteLength === 0) {
      throw new Error("IMAGE_BYTES_MISSING");
    }

    const sourceBlob = new Blob([buffer], { type: response.mimeType });
    if (response.mimeType === "image/png") {
      lastCopySource = "higher-quality CDN image";
      updateDiagnostics({ copy: "Higher-quality PNG ready for clipboard" });
      return sourceBlob;
    }

    updateDiagnostics({ copy: "Converting higher-quality image to PNG" });
    const png = await convertBlobToPng(sourceBlob);
    lastCopySource = "higher-quality CDN image";
    return png;
  }

  async function copyLoadedImageElementToPng() {
    const image = activeTarget?.image;
    if (!image?.isConnected) {
      throw new Error("LOADED_IMAGE_TARGET_MISSING");
    }

    try {
      await image.decode?.();
    } catch {
      // A visibly rendered image may already be usable even when decode() rejects.
    }

    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height || width * height > MAX_PIXEL_COUNT) {
      throw new Error("LOADED_IMAGE_DIMENSIONS_UNSUPPORTED");
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      throw new Error("LOADED_IMAGE_CANVAS_UNAVAILABLE");
    }

    context.drawImage(image, 0, 0, width, height);
    const blob = await canvasToPngBlob(canvas, "LOADED_IMAGE_CANVAS_BLOCKED");
    lastCopySource = "already-loaded Pinterest image";
    updateDiagnostics(
      { copy: `Rendered image copied (${width}×${height})` },
      "Copied from Pinterest's already-loaded image"
    );
    return blob;
  }

  async function captureVisiblePinToPng() {
    if (!activeTarget?.image?.isConnected) {
      throw new Error("CAPTURE_TARGET_MISSING");
    }

    const cleanup = prepareCleanPinterestCapture();
    let response;
    let rect;
    let viewport;

    try {
      updateDiagnostics(
        { copy: `Sanitizing fallback capture (${cleanup.hiddenCount} overlay branch${cleanup.hiddenCount === 1 ? "" : "es"} hidden)` },
        "Pinterest hover UI suppressed; waiting for its fade transition to finish"
      );
      await waitForCaptureUiToDisappear();
      cleanup.verifyClean();
      if (cleanup.persistentOverlayCount > 0) {
        updateDiagnostics(
          { copy: `Removed ${cleanup.persistentOverlayCount} persistent Pinterest overlay${cleanup.persistentOverlayCount === 1 ? "" : "s"}` },
          "Persistent image overlays suppressed, including Last visited"
        );
      }

      rect = activeTarget.image.getBoundingClientRect();
      viewport = { width: innerWidth, height: innerHeight };
      const visibleLeft = Math.max(0, rect.left);
      const visibleTop = Math.max(0, rect.top);
      const visibleRight = Math.min(viewport.width, rect.right);
      const visibleBottom = Math.min(viewport.height, rect.bottom);

      if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) {
        throw new Error("CAPTURE_TARGET_NOT_VISIBLE");
      }

      response = await extensionApi.runtime.sendMessage({
        type: Shared.CAPTURE_MESSAGE_TYPE
      });

      if (!response?.ok || typeof response.dataUrl !== "string") {
        const detail = response?.detail ? `: ${response.detail}` : "";
        throw new Error(`${response?.errorCode || "CAPTURE_FAILED"}${detail}`);
      }

      const screenshot = await loadDataUrlImage(response.dataUrl);
      const scaleX = screenshot.naturalWidth / viewport.width;
      const scaleY = screenshot.naturalHeight / viewport.height;
      const sourceX = Math.max(0, Math.round(visibleLeft * scaleX));
      const sourceY = Math.max(0, Math.round(visibleTop * scaleY));
      const sourceWidth = Math.min(
        screenshot.naturalWidth - sourceX,
        Math.max(1, Math.round((visibleRight - visibleLeft) * scaleX))
      );
      const sourceHeight = Math.min(
        screenshot.naturalHeight - sourceY,
        Math.max(1, Math.round((visibleBottom - visibleTop) * scaleY))
      );

      if (sourceWidth * sourceHeight > MAX_PIXEL_COUNT) {
        throw new Error("CAPTURE_DIMENSIONS_UNSUPPORTED");
      }

      const canvas = document.createElement("canvas");
      canvas.width = sourceWidth;
      canvas.height = sourceHeight;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) {
        throw new Error("CAPTURE_CANVAS_UNAVAILABLE");
      }

      context.drawImage(
        screenshot,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        sourceWidth,
        sourceHeight
      );

      const blob = await canvasToPngBlob(canvas, "CAPTURE_PNG_ENCODING_FAILED");
      lastCopySource = "sanitized visible screen crop";
      updateDiagnostics(
        { copy: `Clean visible Pin captured (${sourceWidth}×${sourceHeight})` },
        `Copied using sanitized screen fallback; ${cleanup.hiddenCount} hover overlay branch${cleanup.hiddenCount === 1 ? "" : "es"} suppressed`
      );
      return blob;
    } finally {
      cleanup.restore();
    }
  }

  function prepareCleanPinterestCapture() {
    const image = activeTarget?.image;
    if (!image?.isConnected) {
      throw new Error("CAPTURE_TARGET_MISSING");
    }

    const card = activeTarget.card?.isConnected
      ? activeTarget.card
      : findPinContext(image).card || image.parentElement;
    const restoredStyles = new Map();
    const captureAttributes = [];
    let hiddenCount = 0;

    const rememberStyle = (node) => {
      if (!restoredStyles.has(node)) {
        restoredStyles.set(node, node.getAttribute("style"));
      }
    };

    const restoreStyle = (node, value) => {
      if (value === null) {
        node.removeAttribute("style");
      } else {
        node.setAttribute("style", value);
      }
    };

    const hideNode = (node) => {
      if (!(node?.nodeType === Node.ELEMENT_NODE) || restoredStyles.has(node)) {
        return;
      }
      rememberStyle(node);
      node.style.setProperty("visibility", "hidden", "important");
      node.style.setProperty("opacity", "0", "important");
      node.style.setProperty("pointer-events", "none", "important");
      hiddenCount += 1;
    };

    const path = [];
    let cursor = image;
    while (cursor && cursor.nodeType === Node.ELEMENT_NODE) {
      path.push(cursor);
      if (cursor === card || cursor === document.body || cursor === document.documentElement) {
        break;
      }
      cursor = cursor.parentElement;
    }
    const pathSet = new Set(path);

    // Hide sibling branches at every level between the image and its Pin card.
    // Pinterest places Save buttons, dark scrims, labels, and action menus in
    // those branches. visibility:hidden preserves geometry for an exact crop.
    for (const pathNode of path) {
      if (!(pathNode?.nodeType === Node.ELEMENT_NODE)) {
        continue;
      }
      pathNode.setAttribute("data-pluck-capture-path", "true");
      captureAttributes.push([pathNode, "data-pluck-capture-path"]);
      rememberStyle(pathNode);
      pathNode.style.setProperty("opacity", "1", "important");
      pathNode.style.setProperty("filter", "none", "important");
      pathNode.style.setProperty("box-shadow", "none", "important");

      for (const child of pathNode.children) {
        if (!pathSet.has(child)) {
          hideNode(child);
        }
      }
    }

    image.setAttribute("data-pluck-capture-image", "true");
    captureAttributes.push([image, "data-pluck-capture-image"]);
    rememberStyle(image);
    image.style.setProperty("opacity", "1", "important");
    image.style.setProperty("filter", "none", "important");
    image.style.setProperty("mix-blend-mode", "normal", "important");

    // Pinterest's "Last visited" treatment is not a hover state. It is a
    // persistent, pointer-events:none sibling inside PinCard__imageWrapper, so
    // elementsFromPoint() cannot reliably discover it. Hide semantic overlays
    // directly from the complete Pin capture boundary.
    const persistentOverlayRoot = card
      || image.closest('[data-test-id="pinWrapper"], [data-test-id="pin"], .PinCard__imageWrapper')
      || image.parentElement;
    const persistentOverlays = persistentOverlayRoot
      ? [...persistentOverlayRoot.querySelectorAll(PINTEREST_PERSISTENT_IMAGE_OVERLAY_SELECTOR)]
      : [];
    let persistentOverlayCount = 0;
    for (const persistentOverlay of persistentOverlays) {
      if (persistentOverlay !== image
          && !persistentOverlay.contains(image)
          && rectanglesOverlap(image.getBoundingClientRect(), persistentOverlay.getBoundingClientRect())) {
        hideNode(persistentOverlay);
        persistentOverlay.setAttribute("data-pluck-persistent-overlay", "true");
        captureAttributes.push([persistentOverlay, "data-pluck-persistent-overlay"]);
        persistentOverlayCount += 1;
      }
    }

    // Catch portal-mounted or absolutely positioned controls that overlap the
    // image but are not in its normal ancestor tree.
    const imageRect = image.getBoundingClientRect();
    for (const point of captureSamplePoints(imageRect)) {
      for (const element of document.elementsFromPoint(point.x, point.y)) {
        if (!(element?.nodeType === Node.ELEMENT_NODE)
            || element === image
            || element.contains(image)
            || image.contains(element)
            || element === document.documentElement
            || element === document.body
            || element.matches(UI_ROOT_SELECTOR)
            || element.hasAttribute("data-pluck-capture-shield")) {
          continue;
        }

        const elementRect = element.getBoundingClientRect();
        if (!rectanglesOverlap(imageRect, elementRect)) {
          continue;
        }

        const style = getComputedStyle(element);
        const isOverlayPosition = style.position === "absolute" || style.position === "fixed" || style.position === "sticky";
        const isControl = Boolean(element.closest("button, [role='button'], [aria-label*='Save' i], [data-test-id*='save' i]"));
        const isInsideCard = Boolean(card && card.contains(element));
        if (isOverlayPosition || isControl || isInsideCard) {
          hideNode(element);
        }
      }
    }

    const captureStyle = document.createElement("style");
    captureStyle.id = "pluck-v80-capture-sanitizer";
    captureStyle.textContent = `
      [data-pluck-capture-path]::before,
      [data-pluck-capture-path]::after {
        content: none !important;
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        background: transparent !important;
        box-shadow: none !important;
        filter: none !important;
      }
      [data-pluck-capture-path],
      [data-pluck-capture-image] {
        opacity: 1 !important;
        filter: none !important;
      }
      ${PINTEREST_PERSISTENT_IMAGE_OVERLAY_SELECTOR},
      [data-pluck-persistent-overlay="true"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        background: transparent !important;
        pointer-events: none !important;
      }
      ${UI_ROOT_SELECTOR} {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }
    `;
    (document.head || document.documentElement).appendChild(captureStyle);

    // A transparent full-viewport hit target moves the real CSS :hover state
    // off the Pinterest card. It is invisible in the screenshot but forces
    // Pinterest's hover-only controls and scrim to begin fading out.
    const shield = document.createElement("div");
    shield.setAttribute("data-pluck-capture-shield", "true");
    shield.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "background:transparent",
      "pointer-events:auto",
      "cursor:default"
    ].join(";");
    document.documentElement.appendChild(shield);

    return {
      hiddenCount,
      persistentOverlayCount,
      verifyClean() {
        const visiblePersistentOverlays = persistentOverlays.filter((node) => {
          if (!node.isConnected) {
            return false;
          }
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return rectanglesOverlap(image.getBoundingClientRect(), rect)
            && style.display !== "none"
            && style.visibility !== "hidden"
            && Number(style.opacity || 1) > 0;
        });
        if (visiblePersistentOverlays.length > 0) {
          throw new Error(`CAPTURE_PERSISTENT_OVERLAY_REMAINED:${visiblePersistentOverlays.length}`);
        }
      },
      restore() {
        shield.remove();
        captureStyle.remove();
        for (const [node, attribute] of captureAttributes) {
          if (node.isConnected) {
            node.removeAttribute(attribute);
          }
        }
        for (const [node, styleValue] of restoredStyles) {
          if (node.isConnected) {
            restoreStyle(node, styleValue);
          }
        }
      }
    };
  }

  function captureSamplePoints(rect) {
    const insetX = Math.min(16, Math.max(2, rect.width * 0.08));
    const insetY = Math.min(16, Math.max(2, rect.height * 0.08));
    const xs = [rect.left + insetX, rect.left + rect.width / 2, rect.right - insetX];
    const ys = [rect.top + insetY, rect.top + rect.height / 2, rect.bottom - insetY];
    return ys.flatMap((y) => xs.map((x) => ({
      x: Math.max(0, Math.min(innerWidth - 1, x)),
      y: Math.max(0, Math.min(innerHeight - 1, y))
    })));
  }

  function rectanglesOverlap(left, right) {
    return left.left < right.right
      && left.right > right.left
      && left.top < right.bottom
      && left.bottom > right.top;
  }

  function waitForCaptureUiToDisappear() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(resolve, CAPTURE_SETTLE_MS);
        });
      });
    });
  }

  async function loadDataUrlImage(dataUrl) {
    const image = new Image();
    image.src = dataUrl;
    try {
      await image.decode();
    } catch {
      throw new Error("CAPTURE_IMAGE_DECODING_FAILED");
    }
    return image;
  }

  function canvasToPngBlob(canvas, errorCode = "PNG_ENCODING_FAILED") {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        blob ? resolve(blob) : reject(new Error(errorCode));
      }, "image/png");
    });
  }

  function decodeBase64Buffer(value) {
    if (typeof value !== "string" || value.length === 0) {
      return null;
    }

    try {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes.buffer;
    } catch {
      return null;
    }
  }

  async function convertBlobToPng(sourceBlob) {
    let width;
    let height;
    let drawSource;
    let cleanup = () => {};

    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(sourceBlob);
        width = bitmap.width;
        height = bitmap.height;
        drawSource = bitmap;
        cleanup = () => bitmap.close();
      } catch {
        ({ width, height, drawSource, cleanup } = await loadImageElement(sourceBlob));
      }
    } else {
      ({ width, height, drawSource, cleanup } = await loadImageElement(sourceBlob));
    }

    try {
      if (!width || !height || width * height > MAX_PIXEL_COUNT) {
        throw new Error("IMAGE_DIMENSIONS_UNSUPPORTED");
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) {
        throw new Error("CANVAS_UNAVAILABLE");
      }

      context.drawImage(drawSource, 0, 0, width, height);
      const blob = await canvasToPngBlob(canvas);
      updateDiagnostics({ copy: `PNG encoded (${width}×${height})` });
      return blob;
    } finally {
      cleanup();
    }
  }

  async function loadImageElement(blob) {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.src = objectUrl;
    try {
      await image.decode();
    } catch {
      URL.revokeObjectURL(objectUrl);
      throw new Error("IMAGE_DECODING_FAILED");
    }
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      drawSource: image,
      cleanup: () => URL.revokeObjectURL(objectUrl)
    };
  }

  function setButtonState(label, disabled) {
    if (overlay.label.textContent !== label) {
      overlay.label.textContent = label;
    }
    if (overlay.liveRegion.textContent !== label) {
      overlay.liveRegion.textContent = label;
    }
    if (overlay.button.disabled !== disabled) {
      overlay.button.disabled = disabled;
    }
    const ariaLabel = label === "Copy" ? "Copy image" : label;
    if (overlay.button.getAttribute("aria-label") !== ariaLabel) {
      overlay.button.setAttribute("aria-label", ariaLabel);
    }
  }
})();
