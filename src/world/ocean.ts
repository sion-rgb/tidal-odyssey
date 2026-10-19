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
  refraction.depthTexture = new THREE.DepthTexture(
    refraction.width,
    refraction.height,
    THREE.UnsignedIntType,
  );
  const surfaceGeometry = new THREE.PlaneGeometry(
    2,
    2,
    low ? 96 : 128,
    low ? 96 : 128,
  );
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
    textureWidth: low ? 512 : 1024,
    textureHeight: low ? 512 : 1024,
    waterNormals: normals,
    sunDirection: sun,
    sunColor: 0xffefcc,
    waterColor: 0x007d83,
    distortionScale: 1.3,
    side: THREE.DoubleSide,
    fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.material.uniforms.refractionSampler = { value: refraction.texture };
  water.material.uniforms.viewport = { value: new THREE.Vector2(1, 1) };
  water.material.uniforms.cameraY = { value: 4 };
  water.material.uniforms.depthSampler = { value: refraction.depthTexture };
  water.material.uniforms.cameraRange = {
    value: new THREE.Vector2(0.07, 10000),
  };
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
      "uniform float alpha; uniform sampler2D refractionSampler; uniform sampler2D depthSampler; uniform vec2 cameraRange; uniform vec2 viewport; uniform float cameraY;",
    )
    .replace(
      "vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );",
      `vec2 p=worldPosition.xz;
      vec2 slopes=vec2(.022*cos(p.x*.18+time*.7)+.024*cos(p.x*.7+p.y*.42-time*1.2),.016*cos(p.y*.23+time*.9)+.014*cos(p.x*.7+p.y*.42-time*1.2));
      float detail=1./(1.+dot(fwidth(p),fwidth(p))*2.5);
      slopes+=vec2(sin(p.x*1.7+p.y*.8-time*1.1),cos(p.y*1.9+p.x*.6+time))*.035*detail;
      slopes+=vec2(sin(p.x*5.7+p.y*3.1+time*1.4),cos(p.y*4.3-p.x*3.9-time*1.2))*.013*detail*detail;
      vec3 surfaceNormal=normalize(vec3(-slopes.x,1.,-slopes.y));`,
    )
    .replace(
      "vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );",
      "vec3 reflectionSample = texture2D(mirrorSampler,clamp(mirrorCoord.xy / mirrorCoord.w+distortion,0.002,0.998)).rgb;",
    )
    .replace(
      "vec3 outgoingLight = albedo;",
      `
      vec2 suv = gl_FragCoord.xy / viewport;
      vec3 refracted = texture2D(refractionSampler, clamp(suv + surfaceNormal.xz*.016, .002, .998)).rgb;
      float d = length((worldPosition.xz - vec2(-20.,50.))/vec2(55.,65.));
      float floorY = -24. + 30.*exp(-pow(d/.98,4.));
      float sampledDepth=texture2D(depthSampler,suv).x;
      float floorDistance=cameraRange.x*cameraRange.y/(cameraRange.y-sampledDepth*(cameraRange.y-cameraRange.x));
      float surfaceDistance=cameraRange.x*cameraRange.y/(cameraRange.y-gl_FragCoord.z*(cameraRange.y-cameraRange.x));
      float pathLength=max(.05,floorDistance-surfaceDistance);
      float depth=max(.05,-floorY);
      vec3 transmission=exp(-vec3(.21,.065,.032)*min(pathLength,100.));
      vec3 oceanTint=vec3(.006,.12,.18);
      vec3 body = refracted*transmission + oceanTint*(1.-transmission);
      float glitter=pow(max(0.,dot(eyeDirection,reflect(-sunDirection,surfaceNormal))),650.);
      vec3 outgoingLight=mix(body,reflectionSample,clamp(reflectance,.025,.98))+vec3(3.5,3.0,2.1)*glitter;
      float coast=(1.-smoothstep(.15,1.8,pathLength))*smoothstep(.55,.82,sin(depth*6.-time*2.+sin(p.x*3.)*.2)*.5+.5);
      outgoingLight=mix(outgoingLight,vec3(.8,.92,.88),coast*.8);
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
    if (++frame % (low ? 2 : 1) === 0) reflect(...args);
  };
  const targetSize = new THREE.Vector2();
  return {
    water,
    depthTexture: refraction.depthTexture,
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
      renderer.getDrawingBufferSize(targetSize);
      water.material.uniforms.viewport.value.copy(targetSize);
    },
    resize(width: number, height: number, scale: number) {
      refraction.setSize(
        Math.max(1, Math.floor(width * scale * (low ? 0.65 : 0.8))),
        Math.max(1, Math.floor(height * scale * (low ? 0.65 : 0.8))),
      );
    },
    dispose() {
      refraction.dispose();
      normals.dispose();
      water.material.uniforms.mirrorSampler.value.dispose();
    },
  };
}
