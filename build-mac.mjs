import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { packager } from "@electron/packager";

const root = path.dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);

const appPaths = await packager({
  dir: root,
  name: "OSCrVIDnode.light (Alpha)",
  platform: "darwin",
  arch: "arm64",
  out: path.join(root, "dist"),
  overwrite: true,
  prune: true,
  asar: true,
  icon: path.join(root, "assets", "SimpleOSCSender.icns"),
  appBundleId: "studio.slopnode.oscrvidnode-light-alpha",
  appVersion: "0.1.0",
  ignore: [
    /^\/dist($|\/)/,
    /^\/release($|\/)/,
    /^\/\.verification($|\/)/,
    /^\/preview.*\.png$/,
    /^\/\.oscrvidnode-light-state\.json(\.tmp)?$/,
    /^\/verify.*\.mjs$/,
    /^\/build-(mac|windows)\.mjs$/,
  ],
});

for (const appPath of appPaths) {
  const bundlePath = path.join(appPath, "OSCrVIDnode.light (Alpha).app");
  await run("codesign", ["--force", "--deep", "--sign", "-", bundlePath]);
  console.log(`Packaged and ad-hoc signed: ${bundlePath}`);
}
