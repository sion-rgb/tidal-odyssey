import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  prune,
  weld,
  meshopt,
  textureCompress,
} from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { stat } from "node:fs/promises";
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
for (const name of ["palm", "turtle"]) {
  const source = `assets-source/${name}.source.glb`,
    target = `public/models/${name}.glb`;
  const document = await io.read(source);
  await document.transform(
    dedup(),
    weld(),
    prune(),
    textureCompress({
      encoder: sharp,
      targetFormat: "webp",
      resize: [512, 512],
      quality: 88,
    }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  await io.write(target, document);
  console.log(
    JSON.stringify({
      name,
      sourceBytes: (await stat(source)).size,
      compressedBytes: (await stat(target)).size,
    }),
  );
}
