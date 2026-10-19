import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";

export function createAtmosphere(sun: THREE.Vector3, low: boolean) {
  const sky = new Sky();
  sky.scale.setScalar(8000);
  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = 2.1;
  uniforms.rayleigh.value = 2.6;
  uniforms.mieCoefficient.value = 0.0025;
  uniforms.mieDirectionalG.value = 0.8;
  uniforms.sunPosition.value.copy(sun).multiplyScalar(1000);
  uniforms.submerge = { value: 0 };
  sky.material.fragmentShader = (
    "uniform float submerge;\n" + sky.material.fragmentShader
  ).replace(
    "#include <tonemapping_fragment>",
    `float elevation=max(direction.y,0.);
    vec3 calibratedSky=mix(vec3(.34,.65,.84),vec3(.025,.22,.52),pow(elevation,.36));
    vec3 daylight=mix(min(gl_FragColor.rgb*.35,vec3(2.)),calibratedSky,.8)+vec3(8.,7.,5.)*sundisc;
    gl_FragColor.rgb=mix(daylight,vec3(.004,.084,.138),submerge);
    #include <tonemapping_fragment>`,
  );
  // A real world-space volume: integrate procedural cloud density along each view ray.
  const noiseData = new Uint8Array(32 * 32 * 32);
  let noiseSeed = 9876;
  for (let i = 0; i < noiseData.length; i++) {
    noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) | 0;
    noiseData[i] = noiseSeed >>> 24;
  }
  const noiseTexture = new THREE.Data3DTexture(noiseData, 32, 32, 32);
  noiseTexture.format = THREE.RedFormat;
  noiseTexture.type = THREE.UnsignedByteType;
  noiseTexture.minFilter = noiseTexture.magFilter = THREE.LinearFilter;
  noiseTexture.wrapS =
    noiseTexture.wrapT =
    noiseTexture.wrapR =
      THREE.RepeatWrapping;
  noiseTexture.unpackAlignment = 1;
  noiseTexture.needsUpdate = true;
  const cloudMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: {
      uNoise: { value: noiseTexture },
      uTime: { value: 0 },
      uCamera: { value: new THREE.Vector3() },
      uCenter: { value: new THREE.Vector3(0, 95, -70) },
      uExtent: { value: new THREE.Vector3(250, 26, 190) },
    },
    vertexShader:
      "varying vec3 vWorld; void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}",
    fragmentShader: `
      varying vec3 vWorld;uniform vec3 uCamera;uniform vec3 uCenter;uniform vec3 uExtent;uniform float uTime;
      uniform highp sampler3D uNoise;
      float noise(vec3 p){return texture(uNoise,p/32.).r;}
      float cloud(vec3 p,vec3 center,vec3 extent){vec3 q=(p-center)/extent;float d=max(0.,1.-dot(q,q)*.55);return d*d*d;}
      float density(vec3 p){vec3 q=(p-uCenter)/uExtent;float edge=max(0.,1.-pow(abs(q.y),2.));float macro=cloud(p,vec3(-15.,95.,-75.),vec3(58.,27.,48.))+cloud(p,vec3(70.,99.,-115.),vec3(55.,25.,42.))+cloud(p,vec3(-100.,92.,20.),vec3(70.,26.,55.));if(macro<.35)return 0.;float n=noise(p*.052+vec3(uTime*.007,0.,0.))*.65+noise(p*.12)*.25+noise(p*.26)*.1;return max(0.,.65*macro+n*.42-.52)*edge;}
      void main(){vec3 rd=normalize(vWorld-uCamera);vec3 inv=1./rd;vec3 ta=(uCenter-uExtent-uCamera)*inv,tb=(uCenter+uExtent-uCamera)*inv;vec3 lo=min(ta,tb),hi=max(ta,tb);float entry=max(0.,max(max(lo.x,lo.y),lo.z)),exit=min(min(hi.x,hi.y),hi.z);if(exit<=entry)discard;
        float stepSize=(exit-entry)/float(${low ? 16 : 30});float trans=1.;vec3 light=vec3(0.);
        for(int i=0;i<${low ? 16 : 30};i++){vec3 p=uCamera+rd*(entry+(float(i)+.5)*stepSize);float d=density(p);float a=1.-exp(-d*stepSize*.22);float shade=exp(-density(p+vec3(-2.,6.,-7.))*6.);vec3 c=mix(vec3(.35,.48,.57),vec3(1.1,1.02,.87),shade);light+=trans*a*c;trans*=1.-a;}
        gl_FragColor=vec4(light/max(1.-trans,.001),1.-trans);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const clouds = new THREE.Mesh(
    new THREE.BoxGeometry(500, 52, 380),
    cloudMaterial,
  );
  clouds.position.set(0, 95, -70);
  clouds.renderOrder = 1;
  clouds.onBeforeRender = (_renderer, _scene, renderCamera) =>
    cloudMaterial.uniforms.uCamera.value.copy(renderCamera.position);
  return {
    sky,
    clouds,
    dispose() {
      noiseTexture.dispose();
    },
    update(time: number, camera: THREE.Camera, sub: number) {
      uniforms.submerge.value = sub;
      cloudMaterial.uniforms.uTime.value = time;
      cloudMaterial.uniforms.uCamera.value.copy(camera.position);
      clouds.visible = camera.position.y > -2;
    },
  };
}
