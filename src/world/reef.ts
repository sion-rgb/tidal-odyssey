import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { seeded } from "./terrain.ts";
import { terrainHeight } from "../route.ts";

export function createReef(low: boolean) {
  const random = seeded(301),
    group = new THREE.Group(),
    matrix = new THREE.Matrix4(),
    dummy = new THREE.Object3D();
  const coralColors = [
    "#ca786b",
    "#e4a866",
    "#aaa7d2",
    "#677b9f",
    "#d59c96",
    "#7ba6a1",
  ];
  const chunks: THREE.BufferGeometry[][] = coralColors.map(() => []);
  function branch(
    start: THREE.Vector3,
    direction: THREE.Vector3,
    length: number,
    radius: number,
    depth: number,
    bucket: number,
  ) {
    const end = start.clone().addScaledVector(direction, length),
      mid = start.clone().add(end).multiplyScalar(0.5);
    const geometry = new THREE.CylinderGeometry(
      radius * 0.5,
      radius,
      length,
      5,
      1,
    );
    dummy.position.copy(mid);
    dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    geometry.applyMatrix4(dummy.matrix);
    chunks[bucket].push(geometry);
    if (depth > 0)
      for (let j = 0; j < 3; j++) {
        const d = direction
          .clone()
          .add(
            new THREE.Vector3(
              (random() - 0.5) * 1.6,
              0.25,
              (random() - 0.5) * 1.6,
            ),
          )
          .normalize();
        branch(end, d, length * 0.66, radius * 0.65, depth - 1, bucket);
      }
  }
  for (let i = 0; i < (low ? 80 : 150); i++) {
    let x = (random() - 0.5) * 82,
      z = -27 - random() * 100;
    const y = terrainHeight(x, z);
    // Keep the camera corridor open and compose reefs along either side.
    if (Math.abs(x) < 7 && z > -45) x += 12;
    const bucket = i % coralColors.length;
    branch(
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(0, 1, 0),
      0.9 + random() * 2,
      0.13 + random() * 0.16,
      3,
      bucket,
    );
  }
  for (const [x, z] of [
    [-11, -48],
    [-9, -65],
    [9, -75],
    [16, -91],
    [-3, -88],
  ]) {
    for (let i = 0; i < 6; i++) {
      const xx = x + (random() - 0.5) * 4,
        zz = z + (random() - 0.5) * 4;
      branch(
        new THREE.Vector3(xx, terrainHeight(xx, zz), zz),
        new THREE.Vector3(0, 1, 0),
        1.8 + random() * 0.9,
        0.18,
        3,
        i,
      );
    }
  }
  chunks.forEach((geos, i) => {
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(
      merged,
      new THREE.MeshStandardMaterial({
        color: coralColors[i],
        emissive: coralColors[i],
        emissiveIntensity: 0.12,
        roughness: 0.78,
      }),
    );
    group.add(mesh);
  });
  const brainGeo = new THREE.SphereGeometry(1, 22, 16),
    bp = brainGeo.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i),
      y = bp.getY(i),
      z = bp.getZ(i),
      r =
        1 +
        0.045 * Math.sin(x * 24 + Math.sin(y * 21)) * Math.cos(z * 23 + y * 8);
    bp.setXYZ(i, x * r, y * r, z * r);
  }
  brainGeo.computeVertexNormals();
  const brains = new THREE.InstancedMesh(
    brainGeo,
    new THREE.MeshStandardMaterial({
      color: "#dc9676",
      emissive: "#dc9676",
      emissiveIntensity: 0.08,
      roughness: 0.75,
    }),
    60,
  );
  const brainColor = new THREE.Color();
  for (let i = 0; i < 60; i++) {
    const x = (random() - 0.5) * 65,
      z = -35 - random() * 80,
      s = 0.6 + random() * 0.95;
    dummy.position.set(x, terrainHeight(x, z) + s * 0.4, z);
    dummy.rotation.set(0, random() * 6, 0);
    dummy.scale.set(s, s * 0.8, s);
    dummy.updateMatrix();
    brains.setMatrixAt(i, dummy.matrix);
    brainColor.set(
      i % 3 === 0 ? "#c487b1" : i % 3 === 1 ? "#e4ad6c" : "#cf8672",
    );
    brains.setColorAt(i, brainColor);
  }
  group.add(brains);
  const boulderGeo = new THREE.IcosahedronGeometry(1, 1),
    boulderMat = new THREE.MeshStandardMaterial({
      color: "#6d8b80",
      roughness: 1,
    });
  const rocks = new THREE.InstancedMesh(boulderGeo, boulderMat, 70);
  for (let i = 0; i < 70; i++) {
    const x = (random() - 0.5) * 110,
      z = -30 - random() * 105,
      y = terrainHeight(x, z),
      s = 0.6 + random() * 2.4;
    dummy.position.set(x, y - 0.3, z);
    dummy.rotation.set(random(), random() * 6, random());
    dummy.scale.set(s, s * 0.7, s * 1.1);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  group.add(rocks);
  const plateGeo = new THREE.CylinderGeometry(1, 0.72, 0.13, 20),
    plateMat = new THREE.MeshStandardMaterial({
      color: "#bc9b77",
      roughness: 0.8,
    });
  const plates = new THREE.InstancedMesh(plateGeo, plateMat, 120);
  for (let i = 0; i < 120; i++) {
    const cluster = Math.floor(i / 3),
      x = Math.sin(cluster * 12.31) * 34,
      z = -40 + Math.cos(cluster * 9.18) * 39;
    const s = 0.7 + random() * 1.6;
    dummy.position.set(x, terrainHeight(x, z) + 0.5 + (i % 3) * 0.55, z);
    dummy.rotation.set(random() * 0.18, random() * 6, random() * 0.12);
    dummy.scale.set(s, 1, s);
    dummy.updateMatrix();
    plates.setMatrixAt(i, dummy.matrix);
  }
  group.add(plates);
  // Sea grass: one instanced draw, swaying in the vertex shader.
  const grassMat = new THREE.MeshStandardMaterial({
    color: "#357f6d",
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const grassClock = { value: 0 };
  grassMat.onBeforeCompile = (s) => {
    s.uniforms.uTime = grassClock;
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ntransformed.x += sin(uTime*1.2+instanceMatrix[3].x)*pow(max(position.y,0.),2.)*.16;",
      );
  };
  const blade = new THREE.PlaneGeometry(0.17, 1.6, 1, 5);
  blade.translate(0, 0.8, 0);
  const grass = new THREE.InstancedMesh(blade, grassMat, low ? 240 : 600);
  for (let i = 0; i < grass.count; i++) {
    const x = (random() - 0.5) * 100,
      z = -20 - random() * 110;
    dummy.position.set(x, terrainHeight(x, z), z);
    dummy.rotation.set(0, random() * 6.28, 0);
    dummy.scale.setScalar(0.45 + random());
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
  }
  group.add(grass);
  const bubbleCount = low ? 100 : 240,
    coords = new Float32Array(bubbleCount * 3),
    speeds = new Float32Array(bubbleCount);
  for (let i = 0; i < bubbleCount; i++) {
    coords[i * 3] = (random() - 0.5) * 85;
    coords[i * 3 + 1] = -24 + random() * 23;
    coords[i * 3 + 2] = -20 - random() * 115;
    speeds[i] = 0.3 + random() * 0.6;
  }
  const bubbleGeo = new THREE.BufferGeometry();
  bubbleGeo.setAttribute("position", new THREE.BufferAttribute(coords, 3));
  const bubbleMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uPixelRatio: { value: 1 } },
    vertexShader:
      "uniform float uPixelRatio; void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(24.*uPixelRatio/-mv.z,1.,7.);gl_Position=projectionMatrix*mv;}",
    fragmentShader:
      "void main(){float d=length(gl_PointCoord-.5); if(d>.5)discard;float a=pow(smoothstep(.18,.49,d),2.)*(1.-smoothstep(.4,.5,d)); gl_FragColor=vec4(.5,.9,.9,a*.55);}",
  });
  group.add(new THREE.Points(bubbleGeo, bubbleMat));
  // Tapered volumetric-style shafts, world-space geometry with soft radial falloff.
  const shaftMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSub: { value: 0 } },
    vertexShader:
      "varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader:
      "varying vec2 vUv;uniform float uTime;uniform float uSub;void main(){float edge=pow(sin(vUv.x*3.14159),3.);float a=edge*sin(vUv.y*3.14159)*.018*uSub*(.85+.15*sin(uTime+vUv.y*9.));gl_FragColor=vec4(.4,.85,.75,a);}",
  });
  for (let i = 0; i < 8; i++) {
    const ray = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 3.2, 27, 12, 1, true),
      shaftMat,
    );
    ray.position.set(-32 + i * 6, -12, -38 - (i % 4) * 20);
    ray.rotation.z = -0.22;
    group.add(ray);
  }
  return {
    group,
    update(time: number, delta: number, sub: number) {
      grassClock.value = time;
      shaftMat.uniforms.uTime.value = time;
      shaftMat.uniforms.uSub.value = sub;
      for (let i = 0; i < bubbleCount; i++) {
        coords[i * 3 + 1] += delta * speeds[i];
        if (coords[i * 3 + 1] > 0.1) coords[i * 3 + 1] = -24;
      }
      bubbleGeo.attributes.position.needsUpdate = true;
    },
  };
}
