#!/usr/bin/env node

// Publishes a packaged ZIP to Microsoft Edge Add-ons using the public
// submission API. There is no official/trusted third-party CLI for this
// store (unlike chrome-webstore-upload-cli for Chrome and web-ext for
// Firefox), so this is a small direct client instead of an extra dependency.
// Docs: https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/using-addons-api

import fs from "node:fs";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

const zipPath = process.argv[2];
if (!zipPath) {
  console.error("Usage: node scripts/publish-edge.mjs <path-to-zip>");
  process.exit(1);
}

const PRODUCT_ID = requireEnv("EDGE_PRODUCT_ID");
const CLIENT_ID = requireEnv("EDGE_CLIENT_ID");
const CLIENT_SECRET = requireEnv("EDGE_CLIENT_SECRET");
const ACCESS_TOKEN_URL = requireEnv("EDGE_ACCESS_TOKEN_URL");
const API_ROOT = `https://api.addons.microsoftedge.microsoft.com/v1/products/${PRODUCT_ID}`;
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 36; // 3 minutes; longer review states are tracked in Partner Center, not here.

await main();

async function main() {
  const token = await getAccessToken();
  const packageOperationLocation = await uploadPackage(token);
  await pollOperation(token, packageOperationLocation, "package upload");

  const submissionOperationLocation = await createSubmission(token);
  await pollOperation(token, submissionOperationLocation, "submission");

  console.log("Edge Add-ons submission created. Review status is tracked in Partner Center.");
}

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "client_credentials",
    scope: "https://api.addons.microsoftedge.microsoft.com/.default"
  });

  const response = await fetch(ACCESS_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error(`Edge token request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function uploadPackage(token) {
  const zipBytes = fs.readFileSync(zipPath);
  const response = await fetch(`${API_ROOT}/submissions/draft/package`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/zip"
    },
    body: zipBytes
  });

  if (response.status !== 202) {
    throw new Error(`Edge package upload failed: ${response.status} ${await response.text()}`);
  }

  return requireHeader(response, "location");
}

async function createSubmission(token) {
  const response = await fetch(`${API_ROOT}/submissions`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` }
  });

  if (response.status !== 202) {
    throw new Error(`Edge submission create failed: ${response.status} ${await response.text()}`);
  }

  return requireHeader(response, "location");
}

async function pollOperation(token, operationUrl, label) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const response = await fetch(operationUrl, {
      headers: { authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      throw new Error(`Edge ${label} status check failed: ${response.status} ${await response.text()}`);
    }

    const status = await response.json();
    if (status.status === "Succeeded") {
      return;
    }
    if (status.status === "Failed") {
      throw new Error(`Edge ${label} failed: ${JSON.stringify(status.errors || status)}`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Edge ${label} did not finish within the polling window; check Partner Center.`);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requireHeader(response, name) {
  const value = response.headers.get(name);
  if (!value) {
    throw new Error(`Edge API response missing expected "${name}" header`);
  }
  return value;
}
