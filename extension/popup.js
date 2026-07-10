"use strict";

const extensionApi = globalThis.browser ?? globalThis.chrome;
const enabledInput = document.querySelector("#enabled");
const highQualityInput = document.querySelector("#highQualityEnabled");
const debugToggle = document.querySelector("#debugToggle");
const status = document.querySelector("#status");
const IMAGE_ORIGINS = ["https://i.pinimg.com/*"];

let debugOn = false;

void initialize();

async function initialize() {
  try {
    const stored = await extensionApi.storage.local.get({
      enabled: true,
      debugEnabled: false,
      highQualityEnabled: false,
      imageAccessRequestAccepted: false,
      imageAccessVerified: false
    });
    enabledInput.checked = stored.enabled !== false;
    highQualityInput.checked = stored.highQualityEnabled === true;
    debugOn = stored.debugEnabled === true;
    reflectDebug();
    renderStatus(stored);
  } catch {
    showError("Could not read the extension settings.");
  }

  enabledInput.addEventListener("change", () => saveBooleanSetting("enabled", enabledInput));
  highQualityInput.addEventListener("change", updateHighQualityMode);
  debugToggle.addEventListener("click", toggleDiagnostics);
}

async function saveBooleanSetting(key, input) {
  input.disabled = true;
  try {
    await extensionApi.storage.local.set({ [key]: input.checked });
    renderStatus(await readStatusState());
  } catch {
    showError("Could not save the extension setting.");
  } finally {
    input.disabled = false;
  }
}

async function toggleDiagnostics() {
  debugOn = !debugOn;
  reflectDebug();
  try {
    await extensionApi.storage.local.set({ debugEnabled: debugOn });
    renderStatus(await readStatusState());
  } catch {
    showError("Could not save the diagnostics setting.");
  }
}

async function updateHighQualityMode() {
  const desired = highQualityInput.checked;
  highQualityInput.disabled = true;

  let requestAccepted = false;
  let requestAttempted = false;
  let requestError = "";

  try {
    // Start persisting the toggle immediately. Safari may close the popup while
    // showing its permission sheet, so the feature preference cannot depend on
    // the permission prompt finishing first. Do not await before request(): it
    // must still be initiated from this direct user gesture.
    const modeSavePromise = extensionApi.storage.local.set({
      highQualityEnabled: desired
    });

    let permissionPromise = Promise.resolve(false);
    if (desired && extensionApi.permissions?.request) {
      requestAttempted = true;
      try {
        permissionPromise = Promise.resolve(
          extensionApi.permissions.request({ origins: IMAGE_ORIGINS })
        );
      } catch (error) {
        requestError = error instanceof Error ? error.message : String(error);
      }
    }

    await modeSavePromise;

    if (requestAttempted && !requestError) {
      try {
        requestAccepted = Boolean(await permissionPromise);
      } catch (error) {
        requestError = error instanceof Error ? error.message : String(error);
      }
    }

    if (desired) {
      await extensionApi.storage.local.set({
        imageAccessRequestAccepted: requestAccepted,
        imageAccessRequestAt: Date.now(),
        imageAccessLastRequestError: requestError
      });
    }

    renderStatus(await readStatusState(), { requestAttempted, requestAccepted, requestError });
  } catch {
    highQualityInput.checked = !desired;
    showError("Could not save the higher-quality setting.");
  } finally {
    highQualityInput.disabled = false;
  }
}

async function readStatusState() {
  return extensionApi.storage.local.get({
    imageAccessVerified: false,
    imageAccessRequestAccepted: false,
    imageAccessLastRequestError: ""
  });
}

function reflectDebug() {
  debugToggle.setAttribute("aria-pressed", String(debugOn));
  debugToggle.textContent = debugOn ? "Hide diagnostics" : "Diagnostics";
  status.hidden = !debugOn;
}

// The status line is diagnostic detail, so it only shows when diagnostics is on.
// A normal user never has to read it.
function renderStatus(stored, requestResult = null) {
  status.textContent = `${enabledInput.checked ? "Copy on" : "Copy off"} · ${qualityDetail(stored, requestResult)}.`;
  status.hidden = !debugOn;
}

function qualityDetail(stored, requestResult) {
  if (!highQualityInput.checked) {
    return "reliable mode, copies the loaded image or a clean crop";
  }
  if (stored.imageAccessVerified) {
    return "higher quality, CDN fetch has worked before, still falls back";
  }
  if (requestResult?.requestError || stored.imageAccessLastRequestError) {
    return "higher quality, access unconfirmed, still falls back";
  }
  if (requestResult?.requestAttempted || stored.imageAccessRequestAccepted) {
    return "higher quality, tries CDN first, then falls back";
  }
  return "higher quality, Safari may ask for access, still falls back";
}

function showError(message) {
  status.textContent = message;
  status.hidden = false;
}
