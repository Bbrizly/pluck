#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const extensionDir = path.join(root, "extension");
const distDir = path.join(root, "dist");
const baseManifest = JSON.parse(fs.readFileSync(path.join(extensionDir, "manifest.json"), "utf8"));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

if (baseManifest.version !== packageJson.version) {
  throw new Error(`Version mismatch: manifest=${baseManifest.version}, package=${packageJson.version}`);
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

const targets = {
  safari: structuredClone(baseManifest),
  chromium: structuredClone(baseManifest),
  firefox: createFirefoxManifest(baseManifest)
};

for (const [target, manifest] of Object.entries(targets)) {
  const targetDir = path.join(distDir, target);
  fs.cpSync(extensionDir, targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(
    path.join(targetDir, "BUILD_TARGET.txt"),
    `${target}\nGenerated from Pluck ${packageJson.version}.\nSee docs/BROWSER_PORTING.md before publishing.\n`
  );
}

console.log(`Built Safari, Chromium, and Firefox candidates in ${distDir}`);

function createFirefoxManifest(base) {
  const manifest = structuredClone(base);

  // Firefox currently uses a non-persistent background document for MV3,
  // while Chromium uses a service worker. Including both lets each browser
  // select the environment it supports.
  manifest.background = {
    scripts: ["shared.js", "background.js"],
    service_worker: "background.js"
  };

  // Firefox MV3 requires a gecko id to lint/sign. Use the release secret when
  // present (must match the AMO listing), else a stable local id so the default
  // build passes `web-ext lint` and side-loads cleanly.
  const extensionId = process.env.FIREFOX_EXTENSION_ID?.trim() || "pluck@extension";
  manifest.browser_specific_settings = {
    gecko: {
      id: extensionId,
      // Pluck collects no user data (see PRIVACY.md); AMO now wants this stated.
      data_collection_permissions: { required: ["none"] }
    }
  };

  return manifest;
}
