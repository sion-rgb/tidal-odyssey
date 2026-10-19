import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";

export function createOcean(
  renderer: THREE.WebGLRenderer,
  sun: THREE.Vector3,
  low: boolean,
) {
  const size = 256,
    pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2,
        v = (y / size) * Math.PI * 2,
        i = (y * size + x) * 4;
      const dx =
        Math.cos(u * 7 + Math.sin(v * 3)) * 0.24 +
        Math.sin(v * 11 + u * 3) * 0.14;
      const dy =
        Math.cos(v * 9 + Math.sin(u * 5)) * 0.24 +
        Math.cos(u * 13 + v * 2) * 0.14;
      pixels.set([128 + dx * 127, 128 + dy * 127, 244, 255], i);
    }
  const normals = new THREE.DataTexture(pixels, size, size);
  normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
  normals.magFilter = THREE.LinearFilter;
  normals.minFilter = THREE.LinearMipmapLinearFilter;
  normals.generateMipmaps = true;
  normals.needsUpdate = true;
  const refraction = new THREE.WebGLRenderTarget(
    low ? 384 : 768,
    low ? 256 : 512,
    { type: THREE.HalfFloatType },
  );
  const surfaceGeometry = new THREE.PlaneGeometry(2, 2, 256, 256);
  const vertices = surfaceGeometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    vertices.setX(
      i,
      Math.sign(vertices.getX(i)) *
        Math.pow(Math.abs(vertices.getX(i)), 2.7) *
        2500,
    );
    vertices.setY(
      i,
      Math.sign(vertices.getY(i)) *
        Math.pow(Math.abs(vertices.getY(i)), 2.7) *
        2500,
    );
  }
  surfaceGeometry.computeVertexNormals();
  const water = new Water(surfaceGeometry, {
    textureWidth: low ? 256 : 512,
    textureHeight: low ? 256 : 512,
    waterNormals: normals,
    sunDirection: sun,
    sunColor: 0xffefcc,
    waterColor: 0x007d83,
    distortionScale: 2.5,
    side: THREE.DoubleSide,
    fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.material.uniforms.refractionSampler = { value: refraction.texture };
  water.material.uniforms.viewport = { value: new THREE.Vector2(1, 1) };
  water.material.uniforms.cameraY = { value: 4 };
  water.material.vertexShader = water.material.vertexShader
    .replace(
      "mirrorCoord = modelMatrix * vec4( position, 1.0 );",
      `
      vec3 displaced = position;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      displaced.z += .12*sin(wp.x*.18+time*.7)+.07*sin(wp.z*.23+time*.9)+.035*sin(wp.x*.7+wp.z*.42-time*1.2);
      mirrorCoord = modelMatrix * vec4(displaced, 1.0);`,
    )
    .replace(
      "modelViewMatrix * vec4( position, 1.0 )",
      "modelViewMatrix * vec4( displaced, 1.0 )",
    );
  water.material.fragmentShader = water.material.fragmentShader
    .replace(
      "uniform float alpha;",
      "uniform float alpha; uniform sampler2D refractionSampler; uniform vec2 viewport; uniform float cameraY;",
    )
    .replace(
      "vec3 outgoingLight = albedo;",
      `
      vec2 suv = gl_FragCoord.xy / viewport;
      vec3 refracted = texture2D(refractionSampler, clamp(suv + surfaceNormal.xz*.009, .002, .998)).rgb;
      float d = length((worldPosition.xz - vec2(-20.,50.))/vec2(55.,65.));
      float floorY = -24. + 30.*exp(-pow(d/.98,4.));
      float depth = max(.1, -floorY);
      vec3 transmission = exp(-vec3(.15,.047,.027)*depth/max(.2,eyeDirection.y));
      vec3 oceanTint = vec3(.009,.21,.24);
      vec3 body = refracted*transmission + oceanTint*(1.-transmission);
      vec3 outgoingLight = mix(body, reflectionSample*.85+specularLight*.65, clamp(reflectance,.035,.94));
      float coast = (1.-smoothstep(.2,1.6,depth)) * smoothstep(.1,.7,sin(d*110.-time*1.7)*.5+.5);
      outgoingLight = mix(outgoingLight, vec3(.83,.94,.87), coast*.65);
      if(cameraY < worldPosition.y) {
        float snell = smoothstep(.18,.8,abs(eyeDirection.y));
        outgoingLight = mix(vec3(.016,.29,.33),refracted*.65+vec3(.035,.18,.2),snell*.8);
        outgoingLight += pow(max(0.,dot(reflect(-sunDirection,-surfaceNormal),eyeDirection)),160.)*.8;
      }
    `,
    );
  let frame = 0;
  const reflect = water.onBeforeRender.bind(water);
  water.onBeforeRender = (...args) => {
    if (++frame % (low ? 4 : 2) === 0) reflect(...args);
  };
  return {
    water,
    update(time: number, camera: THREE.Camera, scene: THREE.Scene) {
      water.material.uniforms.time.value = time;
      water.material.uniforms.eye.value.copy(camera.position);
      water.material.uniforms.cameraY.value = camera.position.y;
      const original = renderer.getRenderTarget();
      water.visible = false;
      renderer.setRenderTarget(refraction);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(original);
      water.visible = true;
      const targetSize = new THREE.Vector2();
      renderer.getDrawingBufferSize(targetSize);
      water.material.uniforms.viewport.value.copy(targetSize);
    },
    resize(width: number, height: number, scale: number) {
      refraction.setSize(
        Math.max(1, Math.floor(width * scale * 0.55)),
        Math.max(1, Math.floor(height * scale * 0.55)),
      );
    },
    dispose() {
      refraction.dispose();
      normals.dispose();
      water.material.uniforms.mirrorSampler.value.dispose();
    },
  };
}
