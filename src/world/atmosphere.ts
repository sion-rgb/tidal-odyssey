import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";

export function createAtmosphere(sun: THREE.Vector3, low: boolean) {
  const sky = new Sky();
  sky.scale.setScalar(8000);
  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = 3;
  uniforms.rayleigh.value = 1.6;
  uniforms.mieCoefficient.value = 0.004;
  uniforms.mieDirectionalG.value = 0.82;
  uniforms.sunPosition.value.copy(sun).multiplyScalar(1000);
  uniforms.submerge = { value: 0 };
  sky.material.fragmentShader = (
    "uniform float submerge;\n" + sky.material.fragmentShader
  ).replace(
    "#include <tonemapping_fragment>",
    "gl_FragColor.rgb = mix(min(gl_FragColor.rgb,vec3(2.5)), vec3(.008,.08,.10), submerge);\n#include <tonemapping_fragment>",
  );
  // A real world-space volume: integrate procedural cloud density along each view ray.
  const cloudMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: {
      uTime: { value: 0 },
      uCamera: { value: new THREE.Vector3() },
      uCenter: { value: new THREE.Vector3(0, 95, -70) },
      uExtent: { value: new THREE.Vector3(250, 26, 190) },
    },
    vertexShader:
      "varying vec3 vWorld; void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}",
    fragmentShader: `
      varying vec3 vWorld;uniform vec3 uCamera;uniform vec3 uCenter;uniform vec3 uExtent;uniform float uTime;
      float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1)),f.x),f.y),f.z);}
      float cloud(vec3 p,vec3 center,vec3 extent){vec3 q=(p-center)/extent;return exp(-dot(q,q)*1.7);}
      float density(vec3 p){vec3 q=(p-uCenter)/uExtent;float edge=max(0.,1.-pow(abs(q.y),2.));float n=noise(p*.052+vec3(uTime*.007,0.,0.))*.65+noise(p*.12)*.25+noise(p*.26)*.1;float macro=cloud(p,vec3(-15.,95.,-75.),vec3(58.,27.,48.))+cloud(p,vec3(70.,99.,-115.),vec3(55.,25.,42.))+cloud(p,vec3(-100.,92.,20.),vec3(70.,26.,55.));return max(0.,.65*macro+n*.42-.52)*edge;}
      void main(){vec3 rd=normalize(vWorld-uCamera);vec3 inv=1./rd;vec3 ta=(uCenter-uExtent-uCamera)*inv,tb=(uCenter+uExtent-uCamera)*inv;vec3 lo=min(ta,tb),hi=max(ta,tb);float entry=max(0.,max(max(lo.x,lo.y),lo.z)),exit=min(min(hi.x,hi.y),hi.z);if(exit<=entry)discard;
        float stepSize=(exit-entry)/float(${low ? 12 : 22});float trans=1.;vec3 light=vec3(0.);
        for(int i=0;i<${low ? 12 : 22};i++){vec3 p=uCamera+rd*(entry+(float(i)+.5)*stepSize);float d=density(p);float a=1.-exp(-d*stepSize*.16);vec3 c=mix(vec3(.48,.66,.7),vec3(1.,.98,.89),clamp((p.y-69.)/52.,0.,1.));light+=trans*a*c;trans*=1.-a;}
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
  clouds.renderOrder = 5;
  return {
    sky,
    clouds,
    update(time: number, camera: THREE.Camera, sub: number) {
      uniforms.submerge.value = sub;
      cloudMaterial.uniforms.uTime.value = time;
      cloudMaterial.uniforms.uCamera.value.copy(camera.position);
      clouds.visible = camera.position.y > 8;
    },
  };
}
