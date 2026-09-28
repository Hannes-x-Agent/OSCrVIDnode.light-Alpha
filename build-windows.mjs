import { readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packager } from "@electron/packager";

const root = path.dirname(fileURLToPath(import.meta.url));
const pngPath = path.join(root, "assets", "SimpleOSCSender.iconset", "icon_256x256.png");
const icoPath = path.join(os.tmpdir(), `oscrvidnode-light-${process.pid}.ico`);

function pngAsIco(png) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(0, 6);
  header.writeUInt8(0, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, png]);
}

try {
  await writeFile(icoPath, pngAsIco(await readFile(pngPath)));
  const appPaths = await packager({
    dir: root,
    name: "OSCrVIDnode.light (Alpha)",
    platform: "win32",
    arch: "x64",
    out: path.join(root, "dist"),
    overwrite: true,
    prune: true,
    asar: true,
    icon: icoPath,
    appVersion: "0.1.0",
    win32metadata: {
      CompanyName: "otherno.devs // echo\\void;",
      FileDescription: "OSCrVIDnode.light (Alpha)",
      InternalName: "OSCrVIDnode.light (Alpha)",
      OriginalFilename: "OSCrVIDnode.light (Alpha).exe",
      ProductName: "OSCrVIDnode.light (Alpha)",
    },
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
  for (const appPath of appPaths) console.log(`Packaged Windows x64 app: ${appPath}`);
} finally {
  await unlink(icoPath).catch(() => {});
}
