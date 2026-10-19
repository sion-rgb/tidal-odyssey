import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { terrainHeight } from "../route.ts";
import type { WorldMaterials } from "./materials.ts";

export function seeded(seed = 42) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}
export const DISTANT_ISLANDS = [
  [-210, 140, 54, 41, 23],
  [160, 110, 50, 75, 28],
  [130, -240, 36, 48, 22],
  [-240, -190, 50, 35, 24],
];
export function distantIslandHeight(xx: number, zz: number, island: number[]) {
  const [x, z, rx, rz, height] = island,
    lx = (xx - x) / rx,
    lz = (zz - z) / rz,
    a = Math.atan2(lz, lx),
    d =
      Math.hypot(lx, lz) *
      (1 + 0.09 * Math.sin(a * 3) + 0.055 * Math.sin(a * 7));
  return (
    -24.05 +
    ((height + 24.05) * Math.exp(-Math.pow(d, 3)) +
      Math.sin(xx * 0.15) *
        Math.cos(zz * 0.14) *
        (1 - THREE.MathUtils.smoothstep(d, 0.5, 1.2))) *
      (1 - THREE.MathUtils.smoothstep(d, 1.05, 1.45))
  );
}

export const causticGLSL = `
float causticField(vec3 p,float time){
  vec2 q=(p.xz-p.y*vec2(-.28,-.9)/.32)*.65;
  q+=vec2(sin(q.y*.7+time*.65),cos(q.x*.6-time*.5))*.8;
  float c=sin(q.x+sin(q.y*1.1+time*.5))*sin(q.y+cos(q.x*.9-time*.6));
  return pow(1.-abs(c),18.);
}\n`;

export function createTerrain(materials: WorldMaterials, low: boolean) {
  const group = new THREE.Group(),
    clock = { value: 0 };
  const material = materials.sand;
  material.vertexColors = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = clock;
    shader.vertexShader =
      "varying vec3 vGround;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvGround=(modelMatrix*vec4(position,1.)).xyz;",
      );
    shader.fragmentShader =
      "uniform float uTime;varying vec3 vGround;\n" +
      causticGLSL +
      shader.fragmentShader
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
        float luminance=dot(diffuseColor.rgb,vec3(.299,.587,.114));
        vec3 whiteSand=mix(diffuseColor.rgb,vec3(luminance*1.06,luminance*1.04,luminance*.97),.65)*3.2;
        diffuseColor.rgb=mix(whiteSand,vec3(.055,.12,.035)*(.8+luminance*.4),smoothstep(4.5,6.,vGround.y));
        float wet=1.-smoothstep(-.2,1.1,vGround.y);
        diffuseColor.rgb*=mix(1.,.65,wet);
      `,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.28,(1.-smoothstep(-.2,.7,abs(vGround.y)))*.7);`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
        float submerged=1.-smoothstep(-.2,.3,vGround.y);
        totalEmissiveRadiance+=vec3(.11,.2,.14)*causticField(vGround,uTime)*submerged;
      `,
        );
  };
  material.customProgramCacheKey = () => "pbr-ground-v2";
  const sand = new THREE.Color("#f5f0e1"),
    green = new THREE.Color("#6d8553"),
    color = new THREE.Color();
  function ground(
    geometry: THREE.PlaneGeometry,
    height: (x: number, z: number) => number,
    originX = 0,
    originZ = 0,
  ) {
    const pos = geometry.attributes.position,
      uv = geometry.attributes.uv,
      colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + originX,
        z = pos.getZ(i) + originZ,
        h = height(x, z);
      pos.setY(i, h);
      uv.setXY(i, x * 0.29, z * 0.29);
      color.copy(sand).lerp(green, THREE.MathUtils.smoothstep(h, 4.5, 6.0));
      color.toArray(colors, i * 3);
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(originX, 0, originZ);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  const geometry = new THREE.PlaneGeometry(
    340,
    350,
    low ? 110 : 160,
    low ? 110 : 160,
  );
  geometry.rotateX(-Math.PI / 2);
  // Spend the existing vertices near the walking shoreline, not the flat abyss.
  const beachVertices = geometry.attributes.position;
  for (let i = 0; i < beachVertices.count; i++) {
    const u = beachVertices.getX(i) / 170,
      v = beachVertices.getZ(i) / 175;
    beachVertices.setX(
      i,
      Math.sign(u) * Math.pow(Math.abs(u), 1.6) * (u < 0 ? 180 : 160),
    );
    beachVertices.setZ(
      i,
      20 + Math.sign(v) * Math.pow(Math.abs(v), 1.6) * (v < 0 ? 210 : 140),
    );
  }
  ground(geometry, terrainHeight);
  const floor = new THREE.PlaneGeometry(6000, 6000);
  floor.rotateX(-Math.PI / 2);
  ground(floor, () => -24.05).layers.set(1);
  for (const island of DISTANT_ISLANDS) {
    const [x, z, rx, rz] = island;
    const geo = new THREE.PlaneGeometry(rx * 3, rz * 3, 36, 36);
    geo.rotateX(-Math.PI / 2);
    ground(
      geo,
      (xx, zz) => {
        return distantIslandHeight(xx, zz, island);
      },
      x,
      z,
    );
  }
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const ready = loader
    .loadAsync(`${import.meta.env.BASE_URL}models/coast-rocks.glb`)
    .then((gltf) => {
      const bounds = new THREE.Box3().setFromObject(gltf.scene),
        center = bounds.getCenter(new THREE.Vector3()),
        size = bounds.getSize(new THREE.Vector3());
      gltf.scene.position.sub(center);
      gltf.scene.position.y += size.y / 2;
      gltf.scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
          if (object.material instanceof THREE.MeshStandardMaterial) {
            object.material.roughness = 0.72;
            object.material.envMapIntensity = 0.55;
          }
        }
      });
      for (const [x, z, scale, rotation] of [
        [-12, 24, 0.16, 0.3],
        [-8, 29, 0.09, 1.8],
        [10, -8, 0.22, 2],
        [-30, -63, 0.28, -0.8],
      ]) {
        const patch = new THREE.Group();
        patch.add(gltf.scene.clone(true));
        patch.scale.setScalar(scale);
        patch.rotation.y = rotation;
        patch.position.set(x, terrainHeight(x, z) - 0.25, z);
        patch.name = `shore-rock-${x}-${z}`;
        patch.updateWorldMatrix(true, true);
        const footprint = new THREE.Box3().setFromObject(patch);
        let support = Infinity;
        for (let ix = 0; ix < 3; ix++)
          for (let iz = 0; iz < 3; iz++)
            support = Math.min(
              support,
              terrainHeight(
                THREE.MathUtils.lerp(footprint.min.x, footprint.max.x, ix / 2),
                THREE.MathUtils.lerp(footprint.min.z, footprint.max.z, iz / 2),
              ),
            );
        // Bury the base across the footprint instead of floating a flat scan on a slope.
        patch.position.y += support - footprint.min.y - 0.18;
        if (patch.position.y < -3) patch.traverse((o) => o.layers.set(1));
        group.add(patch);
      }
    });
  return {
    group,
    ready,
    update(time: number) {
      clock.value = time;
    },
  };
}
