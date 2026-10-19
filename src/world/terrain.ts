import * as THREE from "three";
import { terrainHeight } from "../route.ts";

export function seeded(seed = 42) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}
export function createTerrain() {
  const geometry = new THREE.PlaneGeometry(410, 430, 180, 180);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(-10, 0, -15);
  const pos = geometry.attributes.position,
    colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color("#e6d8b5"),
    green = new THREE.Color("#476746"),
    wet = new THREE.Color("#b6c5a3");
  const color = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      z = pos.getZ(i),
      h = terrainHeight(x, z);
    pos.setY(i, h);
    color.copy(h < 0 ? wet : sand);
    if (h > 3.4) color.lerp(green, THREE.MathUtils.smoothstep(h, 3.4, 5.3));
    color.multiplyScalar(0.96 + 0.04 * Math.sin(x * 3.4 + z * 2.2));
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.93,
  });
  const clock = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = clock;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorld;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvWorld = (modelMatrix * vec4(position,1.)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uTime; varying vec3 vWorld;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float grain = fract(sin(dot(vWorld.xz*130.,vec2(12.98,78.23)))*43758.54);
        diffuseColor.rgb *= .95 + grain*.1;
        float c1 = sin(vWorld.x*.72+sin(vWorld.z*.65+uTime*.6)*1.5+uTime*.5);
        float c2 = sin(vWorld.z*.91+sin(vWorld.x*.82-uTime*.4)*1.7);
        float caustic = pow(1.-abs(c1*c2),14.);
        diffuseColor.rgb += vec3(.16,.25,.17)*caustic*(1.-smoothstep(-1.,1.,vWorld.y));
      `,
      );
  };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  const abyssMaterial = material.clone();
  abyssMaterial.vertexColors = false;
  abyssMaterial.color.copy(wet).multiplyScalar(0.96);
  abyssMaterial.onBeforeCompile = material.onBeforeCompile;
  const abyss = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    abyssMaterial,
  );
  abyss.rotation.x = -Math.PI / 2;
  abyss.position.y = -24.1;
  group.add(abyss);
  // Distant islands are geometry too, visible throughout the same take.
  const islands = [
    [-210, 140, 54, 41, 23],
    [160, 110, 50, 75, 28],
    [130, -240, 36, 48, 22],
    [-240, -190, 50, 35, 24],
  ];
  for (const [x, z, rx, rz, height] of islands) {
    const geo = new THREE.PlaneGeometry(rx * 3, rz * 3, 48, 48);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position,
      c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const d = Math.hypot(p.getX(i) / rx, p.getZ(i) / rz),
        h = -10 + (height + 10) * Math.exp(-Math.pow(d, 3));
      p.setY(i, h);
      color.copy(sand).lerp(green, THREE.MathUtils.smoothstep(h, 1, 5));
      color.toArray(c, i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
    geo.computeVertexNormals();
    const island = new THREE.Mesh(geo, material);
    island.position.set(x, 0, z);
    group.add(island);
  }
  return {
    group,
    update(time: number) {
      clock.value = time;
    },
  };
}
