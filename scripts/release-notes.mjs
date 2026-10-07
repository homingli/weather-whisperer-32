#!/usr/bin/env node
// Print the release notes for one version from CHANGELOG.mobile.md.
// `make upload` redirects stdout into the GitHub release description
// (--notes-file), so sections are published verbatim.
// Run via the Makefile; --version overrides the versionName in build.gradle.

import { readFileSync } from "node:fs";

const GRADLE = "android/app/build.gradle";
const CHANGELOG = "CHANGELOG.mobile.md";
const USAGE =
  "usage: node scripts/release-notes.mjs [--version X.Y[.Z]] [--file CHANGELOG.mobile.md]";

const args = process.argv.slice(2);
const parsed = {};
for (let i = 0; i < args.length; i += 2) {
  const flag = args[i];
  const value = args[i + 1];
  if (!["--version", "--file"].includes(flag) || !value) {
    console.error(USAGE);
    process.exit(1);
  }
  parsed[flag.slice(2)] = value;
}

let version = parsed.version;
if (!version) {
  const gradle = readFileSync(GRADLE, "utf8");
  version = gradle.match(/versionName "([^"]+)"/)?.[1];
}
if (!version) {
  console.error(`could not read versionName from ${GRADLE} — pass --version X.Y[.Z]`);
  process.exit(1);
}

const FILE = parsed.file ?? CHANGELOG;
let md;
try {
  md = readFileSync(FILE, "utf8");
} catch {
  console.error(`${FILE} not found — create it with one section per release (make bump scaffolds it)`);
  process.exit(1);
}

const esc = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const heading = md.match(new RegExp(`^## v${esc}\\b[^\\n]*`, "m"));
if (!heading) {
  console.error(`no "## v${version}" section in ${FILE} — add it before uploading (make bump scaffolds it)`);
  process.exit(1);
}
const rest = md.slice(heading.index + heading[0].length);
const next = rest.match(/^## /m);
const body = (next ? rest.slice(0, next.index) : rest).trim();
if (!body) {
  console.error(`the "## v${version}" section in ${FILE} is empty — write the release notes first`);
  process.exit(1);
}
console.log(body);
