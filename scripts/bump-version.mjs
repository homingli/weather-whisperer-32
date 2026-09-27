#!/usr/bin/env node
// Bump the app version: versionName + versionCode in android/app/build.gradle,
// mirrored into package.json. Run via `make bump` (see Makefile).

import { readFileSync, writeFileSync } from "node:fs";

const GRADLE = "android/app/build.gradle";
const PKG = "package.json";
const USAGE =
  "usage: node scripts/bump-version.mjs [--minor | --major | --set X.Y[.Z]]  (default: patch)";

const args = process.argv.slice(2);
const setIdx = args.indexOf("--set");
const set = setIdx === -1 ? null : args[setIdx + 1];
const unknown = args.filter(
  (a, i) => !["--minor", "--major", "--set"].includes(a) && i !== setIdx + 1,
);
if (
  unknown.length > 0 ||
  (setIdx !== -1 && !set) ||
  (args.includes("--minor") && args.includes("--major")) ||
  (set && (args.includes("--minor") || args.includes("--major")))
) {
  console.error(USAGE);
  process.exit(1);
}

const gradle = readFileSync(GRADLE, "utf8");
const name = gradle.match(/versionName "([^"]+)"/)?.[1];
const code = gradle.match(/versionCode (\d+)/)?.[1];
if (!name || !code) {
  console.error(`could not read versionName/versionCode from ${GRADLE}`);
  process.exit(1);
}

let next;
if (set) {
  if (!/^\d+\.\d+(\.\d+)?$/.test(set)) {
    console.error(`invalid version "${set}" — expected X.Y or X.Y.Z`);
    process.exit(1);
  }
  next = set.split(".").length === 2 ? `${set}.0` : set;
} else {
  const [major, minor, patch = 0] = name.split(".").map(Number);
  if ([major, minor].some(Number.isNaN)) {
    console.error(`cannot bump non-numeric version "${name}" — use --set X.Y.Z instead`);
    process.exit(1);
  }
  if (args.includes("--major")) next = `${major + 1}.0.0`;
  else if (args.includes("--minor")) next = `${major}.${minor + 1}.0`;
  else next = `${major}.${minor}.${patch + 1}`;
}
if (next === name) {
  console.error(`${GRADLE} is already ${next}`);
  process.exit(1);
}

const versionCode = Number(code) + 1;
writeFileSync(
  GRADLE,
  gradle
    .replace(/versionCode \d+/, `versionCode ${versionCode}`)
    .replace(/versionName "[^"]+"/, `versionName "${next}"`),
);

try {
  const pkg = JSON.parse(readFileSync(PKG, "utf8"));
  pkg.version = next;
  writeFileSync(PKG, `${JSON.stringify(pkg, null, 2)}\n`);
} catch {
  console.warn(`warn: could not sync version into ${PKG}`);
}

console.log(`${name} → ${next} (versionCode ${code} → ${versionCode})`);
console.log("next: make apk | make apk-release | make release (build + upload)");
