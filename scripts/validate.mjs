#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const extensionDir = path.join(root, "extension");

const packageJson = readJson(path.join(root, "package.json"));
const manifest = readJson(path.join(extensionDir, "manifest.json"));

assert(packageJson.version === manifest.version, "package.json and manifest.json versions must match");
assert(manifest.manifest_version === 3, "Pluck must remain Manifest V3");
assert(!JSON.stringify(manifest).includes("<all_urls>"), "Broad <all_urls> access is forbidden");
assert(
  manifest.optional_host_permissions?.length === 1
    && manifest.optional_host_permissions[0] === "https://i.pinimg.com/*",
  "The optional image permission must remain restricted to i.pinimg.com"
);

const javascriptFiles = fs.readdirSync(extensionDir)
  .filter((name) => name.endsWith(".js"))
  .map((name) => path.join(extensionDir, name));

for (const file of javascriptFiles) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

for (const file of fs.readdirSync(path.join(root, "scripts"))) {
  if (file.endsWith(".sh")) {
    execFileSync("bash", ["-n", path.join(root, "scripts", file)], { stdio: "inherit" });
  }
}

const requiredDocs = [
  "README.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "PRIVACY.md",
  "SECURITY.md",
  "docs/ARCHITECTURE.md",
  "docs/CODEBASE_DEEP_DIVE.md",
  "docs/BROWSER_PORTING.md",
  "docs/CI_CD.md",
  "docs/RELEASE_CHECKLIST.md",
  "docs/SAFARI_INSTALLATION.md",
  "docs/STORE_PUBLISHING.md"
];
for (const relativePath of requiredDocs) {
  assert(fs.existsSync(path.join(root, relativePath)), `Missing required file: ${relativePath}`);
}

console.log("Validation passed: manifest, permissions, JavaScript, shell scripts, versions, and documentation.");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
