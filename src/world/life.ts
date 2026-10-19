import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { seeded } from "./terrain.ts";
import { terrainHeight } from "../route.ts";

const base = import.meta.env.BASE_URL;
export function createLife(
  low: boolean,
  onProgress: (message: string, percent: number) => void,
  onWarning: (message: string) => void,
) {
  const group = new THREE.Group(),
    random = seeded(4),
    loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const dummy = new THREE.Object3D(),
    fishCount = low ? 64 : 150;
  const fishGeo = new THREE.SphereGeometry(1, 10, 6);
  fishGeo.scale(0.38, 0.19, 0.12);
  const fishMat = new THREE.MeshStandardMaterial({
    color: "#d6cda2",
    metalness: 0.23,
    roughness: 0.45,
  });
  const fish = new THREE.InstancedMesh(fishGeo, fishMat, fishCount);
  const tailGeo = new THREE.ConeGeometry(0.16, 0.3, 3);
  tailGeo.rotateZ(Math.PI / 2);
  tailGeo.translate(-0.45, 0, 0);
  const tails = new THREE.InstancedMesh(tailGeo, fishMat, fishCount);
  const fishColor = new THREE.Color();
  for (let i = 0; i < fishCount; i++) {
    fishColor.setHSL(0.12 + (i % 3) * 0.2, 0.4, 0.6);
    fish.setColorAt(i, fishColor);
    tails.setColorAt(i, fishColor);
  }
  group.add(fish, tails);
  const fishes = Array.from({ length: fishCount }, (_, i) => ({
    phase: random() * 6.28,
    radius: 3 + random() * 10,
    center: new THREE.Vector3(
      i % 3 === 0 ? -9 : 12,
      i % 3 === 0 ? -10 : -14,
      -54 - (i % 3) * 19,
    ),
    speed: 0.1 + random() * 0.1,
  }));
  const palms: THREE.Group[] = [];
  const palmReady = loader
    .loadAsync(`${base}models/palm.glb`)
    .then((gltf) => {
      const source = gltf.scene,
        box = new THREE.Box3().setFromObject(source),
        size = box.getSize(new THREE.Vector3());
      source.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      const scale = 8 / size.y;
      // Sparse foreground silhouettes frame the open water, rather than covering it.
      const placements = [
        [-10, 12, 1.15],
        [-16, 18, 0.95],
        [6, 19, 1.1],
        [13, 28, 1.1],
        [-25, 39, 1.1],
        [-34, 32, 0.8],
        [28, 44, 0.9],
        [-44, 58, 1.2],
        [9, 53, 1],
        [-21, 65, 0.8],
        [22, 68, 0.9],
        [-47, 44, 1.1],
      ];
      if (innerWidth < 700) placements.push([4, 17, 0.8]);
      for (const [x, z, s] of placements) {
        const palm = new THREE.Group(),
          model = source.clone(true);
        model.scale.setScalar(scale * s);
        model.position.y = -box.min.y * scale * s;
        palm.add(model);
        palm.position.set(x, terrainHeight(x, z) - 0.1, z);
        palm.rotation.y = random() * 6.28;
        group.add(palm);
        palms.push(palm);
      }
      onProgress("椰樹已就緒", 65);
    })
    .catch(() => onWarning("椰樹模型無法載入；其餘旅程可繼續。"));
  const turtleRoot = new THREE.Group();
  group.add(turtleRoot);
  let turtlePromise: Promise<void> | null = null,
    turtleLoaded = false,
    disposed = false;
  function loadTurtle() {
    if (turtlePromise) return turtlePromise;
    turtlePromise = loader
      .loadAsync(`${base}models/turtle.glb`)
      .then((gltf) => {
        if (disposed) {
          disposeObject(gltf.scene);
          return;
        }
        const box = new THREE.Box3().setFromObject(gltf.scene),
          size = box.getSize(new THREE.Vector3());
        const model = gltf.scene;
        model.position.sub(box.getCenter(new THREE.Vector3()));
        const normalized = new THREE.Group();
        normalized.add(model);
        normalized.scale.setScalar(3.5 / Math.max(size.x, size.y, size.z));
        turtleRoot.add(normalized);
        turtleLoaded = true;
      })
      .catch(() => onWarning("海龜模型無法載入；其餘海底景物不受影響。"));
    return turtlePromise;
  }
  return {
    group,
    palmReady,
    loadTurtle,
    get turtleLoaded() {
      return turtleLoaded;
    },
    update(time: number, progress: number, camera: THREE.Vector3) {
      if (progress > 0.11) void loadTurtle();
      fishes.forEach((f, i) => {
        const phase = time * f.speed + f.phase;
        dummy.position.set(
          f.center.x + Math.cos(phase) * f.radius,
          f.center.y + Math.sin(phase * 1.7 + i) * 1.7,
          f.center.z + Math.sin(phase) * f.radius * 0.6,
        );
        if (dummy.position.distanceTo(camera) < 3.5) dummy.position.y += 3.5;
        dummy.rotation.set(
          0,
          -phase - Math.PI / 2,
          Math.sin(time * 3 + i) * 0.055,
        );
        dummy.scale.setScalar(0.65 + (i % 7) * 0.13);
        dummy.updateMatrix();
        fish.setMatrixAt(i, dummy.matrix);
        dummy.rotation.y += Math.sin(time * 8 + i) * 0.22;
        dummy.updateMatrix();
        tails.setMatrixAt(i, dummy.matrix);
      });
      fish.instanceMatrix.needsUpdate = true;
      tails.instanceMatrix.needsUpdate = true;
      turtleRoot.position.set(
        5 + Math.sin(time * 0.07) * 3,
        -17 + Math.sin(time * 0.4) * 0.5,
        -82 + Math.cos(time * 0.07) * 3,
      );
      turtleRoot.rotation.set(
        0.1 * Math.sin(time * 0.8),
        time * 0.07 + 0.8,
        0.07 * Math.sin(time * 0.5),
      );
      palms.forEach((p, i) => {
        p.rotation.z = Math.sin(time * 0.65 + i) * 0.012;
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
