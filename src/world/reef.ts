import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { seeded, causticGLSL } from "./terrain.ts";
import { terrainHeight, sampleRoute } from "../route.ts";
import { addSurfaceDetail, type WorldMaterials } from "./materials.ts";

function coralColony(seed: number, low: boolean) {
  const rand = seeded(seed),
    parts: T.BufferGeometry[] = [],
    up = new T.Vector3(0, 1, 0);
  function branch(
    start: T.Vector3,
    dir: T.Vector3,
    length: number,
    radius: number,
    depth: number,
  ) {
    const mid = start
        .clone()
        .addScaledVector(dir, length * 0.5)
        .add(new T.Vector3((rand() - 0.5) * 0.16, 0.04, (rand() - 0.5) * 0.16)),
      end = start.clone().addScaledVector(dir, length);
    const curve = new T.CatmullRomCurve3([start, mid, end]),
      g = new T.TubeGeometry(curve, low ? 2 : 5, radius, low ? 4 : 7, false),
      p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = Math.floor(i / (low ? 5 : 8)) / (low ? 2 : 5),
        center = curve.getPoint(t),
        v = new T.Vector3(p.getX(i), p.getY(i), p.getZ(i))
          .sub(center)
          .multiplyScalar(1 - t * 0.45)
          .add(center);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    parts.push(g);
    if (depth > 0)
      for (let i = 0; i < 2; i++) {
        const d = dir
          .clone()
          .add(new T.Vector3((rand() - 0.5) * 1.15, 0.2, (rand() - 0.5) * 1.15))
          .normalize();
        branch(end, d, length * 0.7, radius * 0.7, depth - 1);
      }
    else {
      const tip = new T.SphereGeometry(radius * 0.6, low ? 4 : 6, low ? 3 : 4);
      tip.translate(end.x, end.y, end.z);
      parts.push(tip);
    }
  }
  for (let i = 0; i < (low ? 4 : 6); i++)
    branch(
      new T.Vector3((rand() - 0.5) * 0.65, 0, (rand() - 0.5) * 0.65),
      up
        .clone()
        .add(new T.Vector3((rand() - 0.5) * 0.8, 0, (rand() - 0.5) * 0.8))
        .normalize(),
      0.7 + rand() * 0.35,
      0.075,
      2,
    );
  const merged = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  return merged;
}
function plateGeometry(low: boolean) {
  const pos = [],
    uv = [],
    idx = [],
    rows = low ? 7 : 8,
    sides = low ? 28 : 48;
  for (let i = 0; i <= rows; i++)
    for (let j = 0; j <= sides; j++) {
      const r = i / rows,
        a = (j / sides) * Math.PI * 2,
        radius = r * (1 + 0.075 * Math.sin(a * 7) + 0.035 * Math.sin(a * 13)),
        y =
          0.25 * (1 - r) ** 2 +
          0.035 * Math.sin(r * 32 + a * 2) * r +
          0.04 * Math.sin(a * 9) * r * r;
      pos.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
      uv.push((Math.cos(a) * r + 1) / 2, (Math.sin(a) * r + 1) / 2);
      if (i < rows && j < sides) {
        const n = i * (sides + 1) + j;
        idx.push(n, n + 1, n + sides + 1, n + 1, n + sides + 2, n + sides + 1);
      }
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
export function createReef(low: boolean, materials: WorldMaterials) {
  const group = new T.Group(),
    rand = seeded(301),
    dummy = new T.Object3D(),
    clock = { value: 0 };
  const routeSamples = Array.from(
    { length: 70 },
    (_, i) => sampleRoute(0.25 + (i / 69) * 0.4).position,
  );
  const safe = (x: number, z: number, height: number, radius = 0.8) =>
    !routeSamples.some(
      (p) =>
        Math.hypot(p.x - x, p.z - z) < radius + 2 &&
        p.y < terrainHeight(x, z) + height + 1,
    );
  const palettes = [
    "#d5ad83",
    "#c78b7f",
    "#c4b7cf",
    "#a594c4",
    "#b5b097",
    "#c1a568",
  ];
  function coralMaterial(color: string) {
    const m = materials.reef.clone();
    m.color.set(color);
    m.map = null;
    m.normalScale.set(0.3, 0.3);
    m.roughness = 0.7;
    m.aoMapIntensity = 0.3;
    addSurfaceDetail(m, 34, 0.22);
    const original = m.onBeforeCompile;
    m.onBeforeCompile = (s, r) => {
      original(s, r);
      s.uniforms.uReefTime = clock;
      s.vertexShader =
        "varying vec3 vReefWorld;\n" +
        s.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvReefWorld=(modelMatrix*instanceMatrix*vec4(position,1.)).xyz;",
        );
      s.fragmentShader =
        "uniform float uReefTime;varying vec3 vReefWorld;\n" +
        causticGLSL +
        s.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vec3(.07,.12,.1)*causticField(vReefWorld,uReefTime);",
        );
    };
    m.customProgramCacheKey = () => "reef-micro-caustics-v2";
    return m;
  }
  const colonies: { x: number; z: number; s: number }[] = [];
  for (let i = 0; i < (low ? 25 : 35); i++) {
    let x = (rand() - 0.5) * 68,
      z = -28 - rand() * 100,
      s = 0.7 + rand() * 0.9;
    if (!safe(x, z, s * 2)) x += x < 0 ? -7 : 7;
    colonies.push({ x, z, s });
  }
  // Deliberate foreground and midground groups around, rather than inside, the camera corridor.
  for (const [x, z] of [
    [-12, -45],
    [10, -53],
    [-13, -70],
    [9, -73],
    [-8, -82],
    [9, -84],
    [18, -88],
    [-5, -91],
    [-2, -96],
    [17, -102],
  ])
    for (let i = 0; i < 8; i++) {
      const xx = x + (rand() - 0.5) * 5,
        zz = z + (rand() - 0.5) * 5;
      if (safe(xx, zz, 2.4))
        colonies.push({ x: xx, z: zz, s: 0.9 + rand() * 0.45 });
    }
  const coralLods: {
    near: T.InstancedMesh;
    far: T.InstancedMesh;
    items: typeof colonies;
    transforms: T.Matrix4[];
  }[] = [];
  for (let type = 0; type < 4; type++) {
    const items = colonies.filter((_, i) => i % 4 === type),
      mat = coralMaterial(palettes[type]);
    const near = new T.InstancedMesh(
        coralColony(50 + type, low),
        mat,
        items.length,
      ),
      far = new T.InstancedMesh(
        coralColony(50 + type, true),
        mat,
        items.length,
      );
    const transforms = items.map((p, i) => {
      dummy.position.set(p.x, terrainHeight(p.x, p.z), p.z);
      dummy.rotation.set(0, rand() * 6.28, 0);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      far.setMatrixAt(i, dummy.matrix);
      return dummy.matrix.clone();
    });
    near.count = 0;
    near.castShadow = true;
    near.receiveShadow = far.receiveShadow = true;
    group.add(near, far);
    coralLods.push({ near, far, items, transforms });
  }
  const plates = new T.InstancedMesh(
    plateGeometry(low),
    coralMaterial("#c3ae80"),
    low ? 22 : 36,
  );
  for (let i = 0; i < plates.count; i++) {
    let x = Math.sin(Math.floor(i / 3) * 12.31) * 29,
      z = -61 + Math.cos(Math.floor(i / 3) * 9.18) * 30;
    if (!safe(x, z, 2, 2)) x += 7;
    dummy.position.set(x, terrainHeight(x, z) + 0.55 + (i % 3) * 0.55, z);
    dummy.rotation.set(rand() * 0.12, rand() * 6, rand() * 0.12);
    const s = 0.8 + rand() * 1.1;
    dummy.scale.set(s, 1, s);
    dummy.updateMatrix();
    plates.setMatrixAt(i, dummy.matrix);
  }
  plates.castShadow = true;
  plates.receiveShadow = true;
  group.add(plates);
  const brain = new T.SphereGeometry(1, low ? 24 : 32, low ? 16 : 20),
    bp = brain.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i),
      y = bp.getY(i),
      z = bp.getZ(i),
      theta = Math.atan2(z, x),
      phi = Math.acos(T.MathUtils.clamp(y, -1, 1));
    const maze =
      Math.sin(theta * 13 + Math.sin(phi * 11) * 1.2) *
      Math.cos(phi * 16 + Math.sin(theta * 7));
    const r = 1 + 0.045 * maze;
    bp.setXYZ(i, x * r, y * r, z * r);
  }
  brain.computeVertexNormals();
  const brains = new T.InstancedMesh(
    brain,
    coralMaterial("#bf9b7e"),
    low ? 12 : 20,
  );
  for (let i = 0; i < brains.count; i++) {
    let x = (rand() - 0.5) * 65,
      z = -35 - rand() * 80,
      s = 0.6 + rand() * 0.85;
    if (!safe(x, z, s * 1.8, s)) x += 8;
    dummy.position.set(x, terrainHeight(x, z) + s * 0.45, z);
    dummy.rotation.set(0, rand() * 6.28, 0);
    dummy.scale.set(s, s * 0.75, s);
    dummy.updateMatrix();
    brains.setMatrixAt(i, dummy.matrix);
  }
  brains.castShadow = true;
  brains.receiveShadow = true;
  group.add(brains);
  const spongeGeo = new T.LatheGeometry(
    [
      new T.Vector2(0.16, 0),
      new T.Vector2(0.22, 0.15),
      new T.Vector2(0.26, 0.65),
      new T.Vector2(0.33, 1),
      new T.Vector2(0.28, 1.07),
      new T.Vector2(0.21, 0.99),
      new T.Vector2(0.18, 0.6),
      new T.Vector2(0.12, 0.12),
    ],
    low ? 12 : 20,
  );
  const sponges = new T.InstancedMesh(spongeGeo, coralMaterial("#bd8565"), 28);
  for (let i = 0; i < sponges.count; i++) {
    let x = (rand() - 0.5) * 55,
      z = -42 - rand() * 60;
    if (!safe(x, z, 1.5)) x += 7;
    dummy.position.set(x, terrainHeight(x, z), z);
    dummy.rotation.set(rand() * 0.15, rand() * 6, rand() * 0.15);
    dummy.scale.setScalar(0.6 + rand() * 0.8);
    dummy.updateMatrix();
    sponges.setMatrixAt(i, dummy.matrix);
  }
  sponges.castShadow = true;
  sponges.receiveShadow = true;
  group.add(sponges);
  const stones = new T.InstancedMesh(
    new T.IcosahedronGeometry(1, 1),
    materials.rock,
    low ? 75 : 140,
  );
  for (let i = 0; i < stones.count; i++) {
    const x = (rand() - 0.5) * 100,
      z = -25 - rand() * 110,
      s = 0.15 + rand() * 0.65;
    dummy.position.set(x, terrainHeight(x, z), z);
    dummy.rotation.set(rand(), rand() * 6, rand());
    dummy.scale.set(s, s * 0.6, s * 0.8);
    dummy.updateMatrix();
    stones.setMatrixAt(i, dummy.matrix);
  }
  stones.receiveShadow = true;
  group.add(stones);
  const grassGeo = new T.PlaneGeometry(0.11, 1.35, 1, 8);
  grassGeo.translate(0, 0.675, 0);
  const gp = grassGeo.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const h = gp.getY(i);
    gp.setX(i, gp.getX(i) * (1 - h / 1.4) + Math.sin(h * 3) * 0.07);
    gp.setZ(i, Math.sin(h * 2.4) * 0.11);
  }
  grassGeo.computeVertexNormals();
  const grassMat = new T.MeshStandardMaterial({
    color: "#557d52",
    roughness: 0.66,
    side: T.DoubleSide,
  });
  grassMat.onBeforeCompile = (s) => {
    s.uniforms.uTime = clock;
    s.vertexShader =
      "uniform float uTime;\n" +
      s.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ntransformed.x+=sin(uTime+instanceMatrix[3].x)*pow(max(position.y,0.),2.)*.1;",
      );
  };
  const grass = new T.InstancedMesh(grassGeo, grassMat, low ? 220 : 420);
  for (let i = 0; i < grass.count; i++) {
    const cluster = Math.floor(i / 6),
      x = Math.sin(cluster * 12.4) * 35 + (rand() - 0.5),
      z = -25 - rand() * 95;
    dummy.position.set(x, terrainHeight(x, z), z);
    dummy.rotation.set(0, rand() * 6.28, 0);
    dummy.scale.setScalar(0.5 + rand() * 0.5);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
  }
  group.add(grass);
  const count = low ? 110 : 220,
    coords = new Float32Array(count * 3),
    speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    coords[i * 3] = (rand() - 0.5) * 72;
    coords[i * 3 + 1] = -24 + rand() * 24;
    coords[i * 3 + 2] = -22 - rand() * 100;
    speeds[i] = 0.2 + rand() * 0.4;
  }
  const particleGeo = new T.BufferGeometry();
  particleGeo.setAttribute("position", new T.BufferAttribute(coords, 3));
  const particleMat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    vertexShader:
      "void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(24./-p.z,1.,5.);gl_Position=projectionMatrix*p;}",
    fragmentShader:
      "void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;float rim=smoothstep(.15,.42,d)*(1.-smoothstep(.38,.5,d));gl_FragColor=vec4(.5,.86,.89,rim*.35);}",
  });
  group.add(new T.Points(particleGeo, particleMat));
  const lastLodCamera = new T.Vector3(10000, 10000, 10000);
  return {
    group,
    update(time: number, delta: number, _sub: number, camera: T.Vector3) {
      clock.value = time;
      group.visible = camera.y < 45;
      if (camera.distanceToSquared(lastLodCamera) > 4) {
        lastLodCamera.copy(camera);
        coralLods.forEach(({ near, far, items, transforms }) => {
          let n = 0,
            f = 0;
          items.forEach((p, i) => {
            const distance = Math.hypot(
              camera.x - p.x,
              camera.y - terrainHeight(p.x, p.z),
              camera.z - p.z,
            );
            if (distance < (low ? 10 : 17))
              near.setMatrixAt(n++, transforms[i]);
            else far.setMatrixAt(f++, transforms[i]);
          });
          near.count = n;
          far.count = f;
          near.visible = n > 0;
          far.visible = f > 0;
          near.instanceMatrix.needsUpdate =
            far.instanceMatrix.needsUpdate = true;
          if (n) near.computeBoundingSphere();
          if (f) far.computeBoundingSphere();
        });
      }
      for (let i = 0; i < count; i++) {
        coords[i * 3 + 1] += delta * speeds[i];
        if (coords[i * 3 + 1] > 0.05) coords[i * 3 + 1] = -24;
      }
      particleGeo.attributes.position.needsUpdate = true;
    },
  };
}
