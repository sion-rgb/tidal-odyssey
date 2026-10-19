import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  prune,
  weld,
  simplify,
  meshopt,
  textureCompress,
} from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

const cache = "../../work/pbr-source",
  manifest = [];
await Promise.all([
  mkdir(cache, { recursive: true }),
  mkdir("public/textures", { recursive: true }),
]);
async function download(file, destination) {
  await mkdir(dirname(destination), { recursive: true });
  let data;
  try {
    data = await readFile(destination);
  } catch {}
  if (
    !data ||
    (file.md5 && createHash("md5").update(data).digest("hex") !== file.md5)
  ) {
    const response = await fetch(file.url);
    if (!response.ok) throw new Error(`${response.status}: ${file.url}`);
    data = Buffer.from(await response.arrayBuffer());
    await writeFile(destination, data);
  }
  if (file.md5 && createHash("md5").update(data).digest("hex") !== file.md5)
    throw new Error("Source checksum mismatch");
  return data;
}
for (const [id, label] of [
  ["aerial_beach_02", "sand"],
  ["palm_tree_bark", "bark"],
  ["coral_gravel", "reef"],
]) {
  const [files, info] = await Promise.all([
    fetch(`https://api.polyhaven.com/files/${id}`).then((r) => r.json()),
    fetch(`https://api.polyhaven.com/info/${id}`).then((r) => r.json()),
  ]);
  const maps = {};
  for (const [key, name] of [
    ["Diffuse", "color"],
    ["nor_gl", "normal"],
    ["Rough", "roughness"],
    ["AO", "ao"],
  ]) {
    const file = files[key]["1k"].jpg;
    const bytes = await download(file, join(cache, `${id}-${name}.jpg`));
    const target = `public/textures/${label}-${name}.webp`;
    await sharp(bytes)
      .resize(1024, 1024)
      .webp({ quality: name === "normal" ? 95 : 88 })
      .toFile(target);
    maps[name] = { url: file.url, sourceMD5: file.md5, path: target };
  }
  manifest.push({
    id,
    source: `https://polyhaven.com/a/${id}`,
    license: "CC0-1.0",
    authors: info.authors,
    maps,
  });
  console.log(`PBR ready: ${id}`);
}
const rockId = "coast_rocks_02",
  files = await fetch(`https://api.polyhaven.com/files/${rockId}`).then((r) =>
    r.json(),
  ),
  asset = files.gltf["1k"].gltf;
const rockDir = join(cache, rockId),
  rockSource = join(rockDir, `${rockId}_1k.gltf`);
await download(asset, rockSource);
for (const [path, file] of Object.entries(asset.include))
  await download(file, join(rockDir, path));
await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const document = await io.read(rockSource);
await document.transform(
  dedup(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.012, error: 0.005 }),
  prune(),
  textureCompress({
    encoder: sharp,
    targetFormat: "webp",
    resize: [1024, 1024],
    quality: 88,
  }),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);
await io.write("public/models/coast-rocks.glb", document);
manifest.push({
  id: rockId,
  source: `https://polyhaven.com/a/${rockId}`,
  license: "CC0-1.0",
  authors: (
    await fetch(`https://api.polyhaven.com/info/${rockId}`).then((r) =>
      r.json(),
    )
  ).authors,
  path: "public/models/coast-rocks.glb",
  processing: "weld, simplify to 1.2% source triangles, WebP 1K, Meshopt",
});
const hdriFiles = await fetch(
  "https://api.polyhaven.com/files/kiara_5_noon",
).then((r) => r.json());
await download(hdriFiles.hdri["1k"].hdr, "public/textures/environment.hdr");
manifest.push({
  id: "kiara_5_noon",
  source: "https://polyhaven.com/a/kiara_5_noon",
  license: "CC0-1.0",
  path: "public/textures/environment.hdr",
  use: "lighting only, never scene background",
});
await writeFile(
  "assets-source/pbr-provenance.json",
  JSON.stringify(manifest, null, 2),
);
console.log("Photogrammetry rock + IBL ready");
