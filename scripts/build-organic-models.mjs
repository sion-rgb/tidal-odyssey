import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, weld, prune, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import { writeFile, mkdir } from "node:fs/promises";

// Exported geometry is original authored work. Runtime assigns the licensed PBR maps.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
};
function mesh(geometry, material, name) {
  const m = new T.Mesh(geometry, material);
  m.name = name;
  return m;
}
function merged(geometries, material, name) {
  const g = mergeGeometries(geometries);
  geometries.forEach((g) => g.dispose());
  return mesh(g, material, name);
}
function tube(points, radius, segments = 24, sides = 6) {
  return new T.TubeGeometry(
    new T.CatmullRomCurve3(points),
    segments,
    radius,
    sides,
    false,
  );
}
function ribbon(point, width, steps = 6) {
  const positions = [],
    uvs = [],
    indices = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      p = point(t),
      p1 = point(Math.min(1, t + 0.01)),
      p0 = point(Math.max(0, t - 0.01));
    const side = new T.Vector3()
      .subVectors(p1, p0)
      .cross(new T.Vector3(0, 1, 0))
      .normalize();
    const w = width * Math.pow(Math.sin(Math.PI * t), 0.7) + 0.001;
    for (let j = 0; j < 3; j++) {
      const v = j - 1,
        q = p.clone().addScaledVector(side, w * v);
      q.y -= Math.abs(v) * w * 0.33;
      positions.push(q.x, q.y, q.z);
      uvs.push(j / 2, t);
    }
    if (i < steps)
      for (let j = 0; j < 2; j++) {
        const a = i * 3 + j;
        indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
function palm(detailed) {
  const root = new T.Group();
  root.name = "BotanicalPalm";
  const bark = new T.MeshStandardMaterial({
    name: "PalmBark",
    color: "#a89171",
    roughness: 0.9,
  });
  const leaf = new T.MeshPhysicalMaterial({
    name: "PalmLeaf",
    color: "#43763a",
    roughness: 0.48,
    side: T.DoubleSide,
    sheen: 0.35,
    sheenColor: new T.Color("#b2cd78"),
  });
  const trunkPath = new T.CatmullRomCurve3([
    new T.Vector3(0, 0, 0),
    new T.Vector3(0.2, 2.3, 0.1),
    new T.Vector3(0.65, 5.4, 0.1),
    new T.Vector3(1.15, 8.3, 0),
  ]);
  const rings = detailed ? 120 : 48,
    sides = detailed ? 16 : 10,
    positions = [],
    uvs = [],
    indices = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings,
      c = trunkPath.getPoint(t),
      r = (0.29 * (1 - t) + 0.12 * t) * (1 + 0.05 * Math.sin(t * 260));
    for (let j = 0; j <= sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      positions.push(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r);
      uvs.push(j / sides, t * 5);
      if (i < rings && j < sides) {
        const n = i * (sides + 1) + j;
        indices.push(
          n,
          n + 1,
          n + sides + 1,
          n + 1,
          n + sides + 2,
          n + sides + 1,
        );
      }
    }
  }
  const trunk = new T.BufferGeometry();
  trunk.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  trunk.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  trunk.setIndex(indices);
  trunk.computeVertexNormals();
  root.add(mesh(trunk, bark, "GrowthRingTrunk"));
  const fronds = [],
    stems = [],
    leafCount = detailed ? 15 : 9,
    pairs = detailed ? 23 : 12,
    crown = trunkPath.getPoint(1);
  for (let i = 0; i < leafCount; i++) {
    const angle = i * 2.399963,
      len = 3.4 + (i % 4) * 0.32,
      rise = i % 3 === 0 ? 1.5 : 0.9,
      drop = 0.8 + (i % 4) * 0.32;
    const center = (t) =>
      new T.Vector3(
        crown.x + Math.cos(angle) * len * t,
        crown.y + rise * Math.sin(t * Math.PI) - drop * t * t,
        crown.z + Math.sin(angle) * len * t,
      );
    stems.push(
      tube(
        [center(0), center(0.3), center(0.65), center(1)],
        0.027,
        detailed ? 20 : 10,
        4,
      ),
    );
    for (let j = 1; j < pairs; j++)
      for (const sign of [-1, 1]) {
        const t = j / pairs,
          start = center(t),
          a = angle + sign * (1.05 + 0.2 * t),
          l = (0.95 * Math.sin(t * Math.PI) ** 0.7 + 0.13) * (1 - 0.3 * t);
        const p = (u) =>
          new T.Vector3(
            start.x + Math.cos(a) * l * u,
            start.y + 0.1 * Math.sin(u * Math.PI) - 0.36 * u * u - l * 0.2 * u,
            start.z + Math.sin(a) * l * u,
          );
        fronds.push(
          ribbon(
            p,
            (detailed ? 0.053 : 0.07) * (1 - 0.25 * t),
            detailed ? 5 : 2,
          ),
        );
      }
  }
  root.add(
    merged(fronds, leaf, "PinnateLeaflets"),
    merged(stems, leaf, "FrondRachis"),
  );
  const nuts = [];
  for (let i = 0; i < 6; i++) {
    const g = new T.SphereGeometry(0.15, 10, 8);
    g.scale(0.85, 1.2, 1);
    g.translate(
      crown.x + Math.cos(i) * 0.28,
      crown.y - 0.24 + (i % 2) * 0.12,
      crown.z + Math.sin(i) * 0.28,
    );
    nuts.push(g);
  }
  root.add(merged(nuts, bark, "CoconutCluster"));
  return root;
}
function distantPalm() {
  const root = new T.Group(),
    bark = new T.MeshStandardMaterial({
      name: "PalmBark",
      color: "#8a8064",
      roughness: 0.9,
    }),
    leaf = new T.MeshStandardMaterial({
      name: "PalmLeaf",
      color: "#507a3b",
      roughness: 0.7,
      side: T.DoubleSide,
    });
  const trunk = new T.CylinderGeometry(0.1, 0.24, 7.5, 6, 5);
  trunk.translate(0, 3.75, 0);
  root.add(mesh(trunk, bark, "ForestTrunk"));
  const leaves = [];
  for (let i = 0; i < 8; i++) {
    const a = i * 2.399963;
    leaves.push(
      ribbon(
        (t) =>
          new T.Vector3(
            Math.cos(a) * 3 * t,
            7.5 + Math.sin(t * Math.PI) * 0.8 - t * t * 0.8,
            Math.sin(a) * 3 * t,
          ),
        0.32,
        3,
      ),
    );
  }
  root.add(merged(leaves, leaf, "ForestCrown"));
  return root;
}
function turtle() {
  const root = new T.Group();
  root.name = "HawksbillTurtle";
  const skin = new T.MeshPhysicalMaterial({
    name: "TurtleSkin",
    color: "#ac9e72",
    roughness: 0.55,
    clearcoat: 0.28,
    clearcoatRoughness: 0.4,
  });
  const shell = new T.MeshPhysicalMaterial({
    name: "TurtleScutes",
    color: "#695031",
    roughness: 0.37,
    clearcoat: 0.55,
    clearcoatRoughness: 0.2,
    vertexColors: true,
  });
  const dark = new T.MeshStandardMaterial({
    name: "TurtleSeams",
    color: "#352e20",
    roughness: 0.65,
  });
  const plastron = new T.MeshStandardMaterial({
    name: "TurtlePlastron",
    color: "#d9c592",
    roughness: 0.65,
  });
  const base = new T.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
  base.scale(1.4, 0.62, 1.02);
  base.translate(0, 0.03, 0);
  root.add(mesh(base, dark, "CarapaceUnderlay"));
  const plateGeos = [];
  const hex = 0.23;
  for (let row = -4; row <= 4; row++)
    for (let col = -4; col <= 4; col++) {
      const cx = col * hex * 1.72 + (row % 2) * hex * 0.86,
        cz = row * hex * 1.5;
      if ((cx / 1.34) ** 2 + (cz / 0.97) ** 2 > 0.87) continue;
      const pos = [],
        color = [],
        idx = [],
        c = new T.Color().setHSL(
          0.09 + Math.sin(row * 4 + col) * 0.02,
          0.35,
          0.24 + (Math.sin(col * 7 + row * 3) + 1) * 0.06,
        );
      const surface = (x, z) =>
        0.045 +
        0.62 * Math.sqrt(Math.max(0.01, 1 - (x / 1.4) ** 2 - (z / 1.02) ** 2));
      pos.push(cx, surface(cx, cz) + 0.014, cz);
      c.toArray(color, 0);
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * Math.PI * 2,
          x = cx + Math.cos(a) * hex * 0.96,
          z = cz + Math.sin(a) * hex * 0.96;
        pos.push(x, surface(x, z), z);
        c.clone()
          .multiplyScalar(0.88)
          .toArray(color, (i + 1) * 3);
        if (i < 6) idx.push(0, i + 1, i + 2);
      }
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      g.setAttribute("color", new T.Float32BufferAttribute(color, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      plateGeos.push(g);
    }
  root.add(merged(plateGeos, shell, "RaisedScutePlates"));
  const rim = new T.TorusGeometry(1, 0.036, 6, 80);
  rim.rotateX(Math.PI / 2);
  rim.scale(1.39, 1, 1.02);
  rim.translate(0, 0.045, 0);
  root.add(mesh(rim, skin, "MarginalScutes"));
  const underside = new T.SphereGeometry(1, 48, 20);
  underside.scale(1.3, 0.23, 0.94);
  underside.translate(0, -0.06, 0);
  root.add(mesh(underside, plastron, "Plastron"));
  const neck = new T.CylinderGeometry(0.22, 0.28, 0.8, 24, 14);
  neck.rotateZ(-Math.PI / 2);
  neck.translate(1.35, 0.06, 0);
  root.add(mesh(neck, skin, "WrinkledNeck"));
  const head = new T.SphereGeometry(1, 40, 28);
  head.scale(0.48, 0.29, 0.28);
  head.translate(1.95, 0.12, 0);
  root.add(mesh(head, skin, "BeakedHead"));
  const beak = new T.ConeGeometry(0.2, 0.4, 24);
  beak.rotateZ(-Math.PI / 2);
  beak.scale(1, 0.8, 1);
  beak.translate(2.32, 0.02, 0);
  root.add(mesh(beak, skin, "HawksbillBeak"));
  const eyeMaterial = new T.MeshPhysicalMaterial({
    name: "WetEyes",
    color: "#13150c",
    roughness: 0.06,
    clearcoat: 1,
  });
  for (const sign of [-1, 1]) {
    const eye = new T.SphereGeometry(0.065, 16, 12);
    eye.translate(2.04, 0.23, sign * 0.247);
    root.add(mesh(eye, eyeMaterial, "Eye"));
    const nose = new T.SphereGeometry(0.018, 8, 6);
    nose.translate(2.33, 0.12, sign * 0.067);
    root.add(mesh(nose, dark, "Nostril"));
    const mouth = tube(
      [
        new T.Vector3(1.91, -0.015, sign * 0.24),
        new T.Vector3(2.18, -0.03, sign * 0.18),
        new T.Vector3(2.42, -0.015, 0),
      ],
      0.009,
      16,
      4,
    );
    root.add(mesh(mouth, dark, "JawLine"));
  }
  for (const front of [true, false])
    for (const sign of [-1, 1]) {
      const pivot = new T.Group();
      pivot.name = `Flipper_${front ? "front" : "rear"}_${sign > 0 ? "left" : "right"}`;
      pivot.position.set(
        front ? 0.6 : -1.02,
        -0.08,
        sign * (front ? 0.69 : 0.64),
      );
      const pos = [],
        idx = [],
        uv = [],
        rows = 20,
        cols = 8;
      for (let i = 0; i <= rows; i++) {
        const u = i / rows,
          width =
            Math.sin((u * 0.93 + 0.035) * Math.PI) *
            (front ? 0.38 : 0.28) *
            (1 - 0.4 * u),
          length = front ? 1.85 : 0.85;
        for (let j = 0; j <= cols; j++) {
          const v = (j / cols) * 2 - 1;
          pos.push(
            (front ? -0.8 : -0.25) * u + v * width,
            0.08 * Math.sin(u * Math.PI) - 0.23 * u * u - Math.abs(v) * 0.04,
            sign * length * u,
          );
          uv.push(j / cols, u);
          if (i < rows && j < cols) {
            const a = i * (cols + 1) + j;
            idx.push(a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1);
          }
        }
      }
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = skin.clone();
      m.side = T.DoubleSide;
      pivot.add(mesh(g, m, "ScaledFlipper"));
      root.add(pivot);
    }
  const tail = tube(
    [
      new T.Vector3(-1.1, -0.09, 0),
      new T.Vector3(-1.48, -0.14, 0),
      new T.Vector3(-1.64, -0.12, 0),
    ],
    0.065,
    12,
    8,
  );
  root.add(mesh(tail, skin, "Tail"));
  return root;
}
await mkdir("public/models", { recursive: true });
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });
for (const [name, root] of [
  ["palm-botanical", palm(true)],
  ["palm-botanical-low", palm(false)],
  ["palm-silhouette", distantPalm()],
  ["turtle-anatomical", turtle()],
]) {
  const binary = await new GLTFExporter().parseAsync(root, { binary: true });
  const document = await io.readBinary(new Uint8Array(binary));
  await document.transform(
    dedup(),
    weld(),
    prune({ keepAttributes: true }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  await io.write(`public/models/${name}.glb`, document);
  const triangles = document
    .getRoot()
    .listMeshes()
    .reduce(
      (n, m) =>
        n +
        m
          .listPrimitives()
          .reduce(
            (n, p) =>
              n +
              (p.getIndices()?.getCount() ||
                p.getAttribute("POSITION").getCount()) /
                3,
            0,
          ),
      0,
    );
  console.log(
    JSON.stringify({
      name,
      triangles,
      nodes: document.getRoot().listNodes().length,
    }),
  );
}
