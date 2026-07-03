"use strict";

const extensionApi = globalThis.browser ?? globalThis.chrome;
const enabledInput = document.querySelector("#enabled");
const debugInput = document.querySelector("#debugEnabled");
const highQualityInput = document.querySelector("#highQualityEnabled");
const status = document.querySelector("#status");
const IMAGE_ORIGINS = ["https://i.pinimg.com/*"];

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
    debugInput.checked = stored.debugEnabled === true;
    highQualityInput.checked = stored.highQualityEnabled === true;
    renderStatus(stored);
  } catch {
    status.textContent = "Could not read the extension settings.";
  }

  enabledInput.addEventListener("change", () => saveBooleanSetting("enabled", enabledInput));
  debugInput.addEventListener("change", () => saveBooleanSetting("debugEnabled", debugInput));
  highQualityInput.addEventListener("change", updateHighQualityMode);
}

async function saveBooleanSetting(key, input) {
  input.disabled = true;
  try {
    await extensionApi.storage.local.set({ [key]: input.checked });
    const stored = await readStatusState();
    renderStatus(stored);
  } catch {
    status.textContent = "Could not save the extension setting.";
  } finally {
    input.disabled = false;
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

    const stored = await readStatusState();
    renderStatus(stored, {
      requestAttempted,
      requestAccepted,
      requestError
    });
  } catch {
    highQualityInput.checked = !desired;
    status.textContent = "Could not save the higher-quality setting.";
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

function renderStatus(stored, requestResult = null) {
  const extensionState = enabledInput.checked ? "Copy is enabled" : "Copy is disabled";
  const debugState = debugInput.checked ? "diagnostics are on" : "diagnostics are off";

  let qualityState;
  if (!highQualityInput.checked) {
    qualityState = "reliable mode is on; Pluck skips the CDN and uses the loaded image or clean screen crop";
  } else if (stored.imageAccessVerified) {
    qualityState = "higher-quality mode is on and the CDN fetch has worked before; failures still fall back automatically";
  } else if (requestResult?.requestError || stored.imageAccessLastRequestError) {
    qualityState = "higher-quality mode is on, but Safari did not confirm access; copying still falls back automatically";
  } else if (requestResult?.requestAttempted || stored.imageAccessRequestAccepted) {
    qualityState = "higher-quality mode is on; the next copy will try the CDN first and fall back automatically";
  } else {
    qualityState = "higher-quality mode is on; Safari may ask for image access, and failures fall back automatically";
  }

  status.textContent = `${extensionState}; ${debugState}; ${qualityState}.`;
}
