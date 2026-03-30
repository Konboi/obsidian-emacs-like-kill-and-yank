import fs from "node:fs";

const rawVersion = process.env.TAGPR_NEXT_VERSION ?? process.env.npm_package_version;

if (!rawVersion) {
  throw new Error("TAGPR_NEXT_VERSION or npm_package_version is required.");
}

const version = rawVersion.startsWith("v") ? rawVersion.slice(1) : rawVersion;
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const versions = JSON.parse(fs.readFileSync("versions.json", "utf8"));

versions[version] = manifest.minAppVersion;

fs.writeFileSync("versions.json", `${JSON.stringify(versions, null, 2)}\n`);
