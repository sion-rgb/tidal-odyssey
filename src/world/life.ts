import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { seeded, DISTANT_ISLANDS, distantIslandHeight } from "./terrain.ts";
import { terrainHeight } from "../route.ts";
import { addSurfaceDetail, type WorldMaterials } from "./materials.ts";

function fishGeometry() {
  const positions = [],
    uv = [],
    indices = [],
    rows = 18,
    sides = 10;
  for (let i = 0; i <= rows; i++)
    for (let j = 0; j <= sides; j++) {
      const t = i / rows,
        a = (j / sides) * Math.PI * 2,
        r = Math.pow(Math.sin(t * Math.PI), 0.68);
      positions.push(
        -0.42 + t * 0.85,
        Math.sin(a) * 0.22 * r,
        Math.cos(a) * 0.095 * r,
      );
      uv.push(t, j / sides);
      if (i < rows && j < sides) {
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
  const body = new THREE.BufferGeometry();
  body.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  body.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  body.setIndex(indices);
  body.computeVertexNormals();
  const fins = new THREE.BufferGeometry();
  fins.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.28, 0.12, 0, -0.1, 0.34, 0, 0.25, 0.15, 0, -0.25, -0.12, 0, -0.05,
        -0.29, 0, 0.2, -0.15, 0, 0.1, 0, 0.08, -0.1, -0.15, 0.23, -0.15, 0.02,
        0.07, 0.1, 0, -0.08, -0.15, 0.02, -0.07, -0.1, -0.15, -0.23,
      ],
      3,
    ),
  );
  fins.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      Array.from({ length: 24 }, (_, i) => i % 2),
      2,
    ),
  );
  fins.computeVertexNormals();
  const merged = mergeGeometries([body.toNonIndexed(), fins]);
  body.dispose();
  fins.dispose();
  return merged;
}

export function createLife(
  low: boolean,
  materials: WorldMaterials,
  onProgress: (message: string, percent: number) => void,
  onWarning: (message: string) => void,
) {
  const group = new THREE.Group(),
    random = seeded(4),
    loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),
    dummy = new THREE.Object3D(),
    fishCount = low ? 54 : 108;
  const fishMat = new THREE.MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 0.34,
    metalness: 0.08,
    clearcoat: 0.35,
    clearcoatRoughness: 0.25,
    side: THREE.DoubleSide,
  });
  const fishClock = { value: 0 };
  fishMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = fishClock;
    shader.vertexShader =
      "uniform float uTime;varying vec3 vFish;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
      vFish=position;
      #ifdef USE_INSTANCING
      transformed.z+=sin(uTime*8.+instanceMatrix[3].x*.6+position.x*8.)*.06*smoothstep(.1,-.5,position.x);
      #endif`,
      );
    shader.fragmentShader =
      "varying vec3 vFish;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      float stripe=1.-smoothstep(.02,.075,abs(sin((vFish.x+.07)*13.)));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.92,.95,.88),stripe*.8);
      float scales=.5+.5*sin(vFish.x*160.)*sin(vFish.y*180.+vFish.x*80.);
      diffuseColor.rgb*=.9+.15*scales;
    `,
      );
  };
  fishMat.customProgramCacheKey = () => "reef-fish-v2";
  const fish = new THREE.InstancedMesh(fishGeometry(), fishMat, fishCount);
  const tailGeo = new THREE.BufferGeometry();
  tailGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.37, 0, 0, -0.67, 0.23, 0, -0.61, 0, 0, -0.37, 0, 0, -0.61, 0, 0,
        -0.67, -0.23, 0,
      ],
      3,
    ),
  );
  tailGeo.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      [0, 0.5, 1, 1, 1, 0.5, 0, 0.5, 1, 0.5, 1, 0],
      2,
    ),
  );
  tailGeo.computeVertexNormals();
  const tails = new THREE.InstancedMesh(tailGeo, fishMat, fishCount);
  const eyes = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.029, 6, 4),
    new THREE.MeshPhysicalMaterial({
      color: "#101a18",
      roughness: 0.12,
      clearcoat: 1,
    }),
    fishCount * 2,
  );
  fish.layers.set(1);
  tails.layers.set(1);
  eyes.layers.set(1);
  const color = new THREE.Color(),
    palette = ["#ed9a48", "#70a8b6", "#e3d9a7"];
  for (let i = 0; i < fishCount; i++) {
    color.set(palette[i % 3]);
    fish.setColorAt(i, color);
    tails.setColorAt(i, color);
  }
  group.add(fish, tails, eyes);
  const fishes = Array.from({ length: fishCount }, (_, i) => ({
    phase: random() * 6.28,
    radius: 3 + random() * 8,
    center: new THREE.Vector3(
      i % 3 === 0 ? -6 : 12,
      i % 3 === 0 ? -14 : -17,
      -53 - (i % 3) * 17,
    ),
    speed: 0.09 + random() * 0.08,
  }));
  const palms: THREE.Group[] = [],
    flippers: THREE.Object3D[] = [];
  const palmReady = Promise.all([
    loader.loadAsync(`${import.meta.env.BASE_URL}models/palm-botanical.glb`),
    loader.loadAsync(
      `${import.meta.env.BASE_URL}models/palm-botanical-low.glb`,
    ),
    loader.loadAsync(`${import.meta.env.BASE_URL}models/palm-silhouette.glb`),
  ])
    .then(([hi, lo, forest]) => {
      for (const source of [hi.scene, lo.scene])
        source.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.material = /Leaflets|Rachis/.test(object.name)
              ? materials.leaf
              : materials.bark;
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });
      const placements = [
        [-10, 12, 1],
        [-16, 18, 0.94],
        [6, 19, 1.05],
        [13, 28, 1],
        [-25, 39, 1],
        [-34, 32, 0.8],
        [28, 44, 0.9],
        [-44, 58, 1.1],
        [9, 53, 1],
        [-21, 65, 0.9],
        [22, 68, 0.9],
        [-47, 44, 1.1],
        [-31, 58, 0.85],
        [-16, 48, 0.9],
        [-8, 59, 1.1],
        [-36, 65, 0.8],
        [-5, 45, 0.85],
      ];
      if (innerWidth < 700) placements.push([-2, 12, 0.85]);
      for (const [x, z, s] of placements) {
        const root = new THREE.Group(),
          lod = new THREE.LOD();
        lod.addLevel(hi.scene.clone(true), 0);
        lod.addLevel(lo.scene.clone(true), low ? 12 : 23, 0.16);
        root.add(lod);
        root.scale.setScalar(s);
        root.position.set(x, terrainHeight(x, z), z);
        root.rotation.y = random() * 6.28;
        group.add(root);
        palms.push(root);
      }
      forest.scene.updateMatrixWorld(true);
      const forestMeshes: THREE.Mesh[] = [];
      forest.scene.traverse((o) => {
        if (o instanceof THREE.Mesh) forestMeshes.push(o);
      });
      const regions = [[-20, 50, 55, 65, 6], ...DISTANT_ISLANDS];
      regions.forEach((island, region) => {
        const [x, z, rx, rz] = island,
          transforms: THREE.Matrix4[] = [];
        for (
          let attempt = 0;
          attempt < 1800 && transforms.length < (low ? 55 : 100);
          attempt++
        ) {
          const xx = x + (random() - 0.5) * rx * 1.65,
            zz = z + (random() - 0.5) * rz * 1.65,
            h =
              region === 0
                ? terrainHeight(xx, zz)
                : distantIslandHeight(xx, zz, island);
          if (h < (region === 0 ? 4.9 : 4)) continue;
          dummy.position.set(xx, h, zz);
          dummy.rotation.set(0, random() * 6.28, 0);
          dummy.scale.setScalar(0.72 + random() * 0.65);
          dummy.updateMatrix();
          transforms.push(dummy.matrix.clone());
        }
        forestMeshes.forEach((source) => {
          const baked = new THREE.BufferGeometry();
          for (const name of ["position", "normal", "uv"]) {
            const attr = source.geometry.getAttribute(name);
            if (!attr) continue;
            const data = new Float32Array(attr.count * attr.itemSize);
            for (let i = 0; i < attr.count; i++) {
              data[i * attr.itemSize] = attr.getX(i);
              data[i * attr.itemSize + 1] = attr.getY(i);
              if (attr.itemSize > 2) data[i * attr.itemSize + 2] = attr.getZ(i);
            }
            baked.setAttribute(
              name,
              new THREE.BufferAttribute(data, attr.itemSize),
            );
          }
          if (source.geometry.index)
            baked.setIndex(source.geometry.index.clone());
          baked.applyMatrix4(source.matrixWorld);
          const inst = new THREE.InstancedMesh(
            baked,
            source.name.includes("Trunk") ? materials.bark : materials.leaf,
            transforms.length,
          );
          transforms.forEach((m, i) => inst.setMatrixAt(i, m));
          inst.receiveShadow = true;
          inst.computeBoundingSphere();
          group.add(inst);
        });
      });
      onProgress("細葉棕櫚與 PBR 材質已就緒", 70);
    })
    .catch(() => onWarning("棕櫚模型未能載入。"));
  const turtleRoot = new THREE.Group();
  group.add(turtleRoot);
  let turtlePromise: Promise<void> | null = null,
    turtleLoaded = false,
    disposed = false;
  function loadTurtle() {
    if (turtlePromise) return turtlePromise;
    turtlePromise = loader
      .loadAsync(`${import.meta.env.BASE_URL}models/turtle-anatomical.glb`)
      .then((gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }
        const unique = new Set<THREE.Material>();
        gltf.scene.traverse((object) => {
          object.layers.set(1);
          if (object.name.startsWith("Flipper_")) flippers.push(object);
          if (object instanceof THREE.Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;
            const m = object.material;
            if (m instanceof THREE.MeshStandardMaterial && !unique.has(m)) {
              unique.add(m);
              if (/Skin/.test(m.name)) addSurfaceDetail(m, 65, 0.22);
              if (/Scutes/.test(m.name)) {
                m.color.set("#ffffff");
                addSurfaceDetail(m, 90, 0.08);
              }
            }
          }
        });
        gltf.scene.scale.setScalar(0.94);
        turtleRoot.add(gltf.scene);
        turtleLoaded = true;
      })
      .catch(() => onWarning("海龜模型未能載入。"));
    return turtlePromise;
  }
  const eyeOffset = new THREE.Matrix4(),
    localEye = new THREE.Matrix4();
  return {
    group,
    palmReady,
    loadTurtle,
    get turtleLoaded() {
      return turtleLoaded;
    },
    update(
      time: number,
      progress: number,
      viewCamera: THREE.PerspectiveCamera,
    ) {
      const camera = viewCamera.position;
      // Marine animals are sub-pixel details once the flight leaves the coast.
      fish.visible =
        tails.visible =
        eyes.visible =
        turtleRoot.visible =
          camera.y < 40;
      if (progress > 0.11) void loadTurtle();
      fishClock.value = time;
      fishes.forEach((f, i) => {
        const phase = time * f.speed + f.phase;
        dummy.position.set(
          f.center.x + Math.cos(phase) * f.radius,
          f.center.y + Math.sin(phase * 1.7 + i) * 1.4,
          f.center.z + Math.sin(phase) * f.radius * 0.6,
        );
        if (dummy.position.distanceTo(camera) < 2.6) dummy.position.y += 2.5;
        dummy.rotation.set(
          0,
          -phase - Math.PI / 2,
          Math.sin(time * 3 + i) * 0.04,
        );
        dummy.scale.setScalar(0.65 + (i % 7) * 0.1);
        dummy.updateMatrix();
        fish.setMatrixAt(i, dummy.matrix);
        for (let j = 0; j < 2; j++) {
          localEye.makeTranslation(0.29, 0.055, j === 0 ? 0.08 : -0.08);
          eyeOffset.multiplyMatrices(dummy.matrix, localEye);
          eyes.setMatrixAt(i * 2 + j, eyeOffset);
        }
        dummy.rotation.y += Math.sin(time * 8 + i) * 0.25;
        dummy.updateMatrix();
        tails.setMatrixAt(i, dummy.matrix);
      });
      fish.instanceMatrix.needsUpdate = true;
      tails.instanceMatrix.needsUpdate = true;
      eyes.instanceMatrix.needsUpdate = true;
      turtleRoot.position.set(
        5 + Math.sin(time * 0.06) * 2,
        -19.0 + Math.sin(time * 0.35) * 0.25,
        -81 + Math.cos(time * 0.06) * 2,
      );
      turtleRoot.rotation.set(
        0.05 * Math.sin(time * 0.6),
        -0.55 + Math.sin(time * 0.06) * 0.2,
        0.035 * Math.sin(time * 0.7),
      );
      flippers.forEach((f) => {
        const sign = f.name.includes("left") ? 1 : -1,
          front = f.name.includes("front");
        f.rotation.x =
          sign * Math.sin(time * 1.3 + (front ? 0 : 1)) * (front ? 0.36 : 0.15);
        f.rotation.y = Math.sin(time * 1.3 + 0.8) * 0.08;
      });
      palms.forEach((p, i) => {
        p.rotation.z = Math.sin(time * 0.55 + i) * 0.006;
        const lod = p.children[0] as THREE.LOD;
        lod.autoUpdate = false;
        lod.update(viewCamera);
      });
    },
    dispose() {
      disposed = true;
    },
  };
}

export function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
      geometries.add(object.geometry);
      for (const mat of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        materials.add(mat);
        for (const value of Object.values(mat))
          if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}
