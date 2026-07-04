"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension/manifest.json"), "utf8"));
const buildSource = fs.readFileSync(path.join(root, "scripts/build-browsers.mjs"), "utf8");
const backgroundSource = fs.readFileSync(path.join(root, "extension/background.js"), "utf8");
const safariPackageSource = fs.readFileSync(path.join(root, "scripts/package-safari.sh"), "utf8");


test("repository and extension versions remain synchronized", () => {
  assert.equal(packageJson.version, manifest.version);
});


test("repository exposes deterministic validate, build, package, and CI commands", () => {
  for (const command of ["validate", "build", "package:all", "ci", "clean"]) {
    assert.equal(typeof packageJson.scripts[command], "string", `missing npm script: ${command}`);
  }
});


test("browser build script generates Safari, Chromium, and Firefox targets", () => {
  assert.match(buildSource, /safari:\s*structuredClone/);
  assert.match(buildSource, /chromium:\s*structuredClone/);
  assert.match(buildSource, /firefox:\s*createFirefoxManifest/);
  assert.match(buildSource, /scripts:\s*\["shared\.js", "background\.js"\]/);
  // Chromium/Safari keep the MV3 service worker; Firefox drops it (AMO warns).
  assert.equal(manifest.background.service_worker, "background.js");
});


test("background source supports both service workers and Firefox background documents", () => {
  assert.match(backgroundSource, /typeof importScripts === "function"/);
  assert.match(backgroundSource, /!globalThis\.PluckShared/);
});


test("Safari packager can run non-interactively in CI", () => {
  assert.match(safariPackageSource, /NO_OPEN/);
});


test("maintainer documentation is present", () => {
  for (const file of [
    "README.md",
    "PRIVACY.md",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "docs/ARCHITECTURE.md",
    "docs/CODEBASE_DEEP_DIVE.md",
    "docs/BROWSER_PORTING.md",
    "docs/CI_CD.md",
    "docs/RELEASE_CHECKLIST.md",
    "docs/STORE_PUBLISHING.md"
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `missing ${file}`);
  }
});
