import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

export function createLens(
  depth: THREE.DepthTexture,
  camera: THREE.PerspectiveCamera,
  low: boolean,
  sun: THREE.Vector3,
) {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: depth },
      tShadow: { value: null },
      uSun: { value: sun },
      uProjectionInverse: { value: camera.projectionMatrixInverse },
      uCameraWorld: { value: camera.matrixWorld },
      uShadowMatrix: { value: new THREE.Matrix4() },
      uTime: { value: 0 },
      uSub: { value: 0 },
      uSurface: { value: 0 },
      uWet: { value: 0 },
      uImpact: { value: 0 },
      uDropAge: { value: 20 },
      uAspect: { value: 1 },
      uAo: { value: low ? 0.35 : 0.65 },
    },
    vertexShader:
      "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: `
      #include <packing>
      uniform sampler2D tDiffuse;uniform sampler2D tDepth;uniform sampler2D tShadow;uniform mat4 uProjectionInverse;uniform mat4 uCameraWorld;uniform mat4 uShadowMatrix;
      uniform float uTime;uniform float uSub;uniform float uSurface;uniform float uAspect;uniform float uAo;uniform vec3 uSun;varying vec2 vUv;
      uniform float uWet,uImpact,uDropAge;
      vec3 viewPosition(vec2 uv){float d=texture2D(tDepth,clamp(uv,.001,.999)).x;vec4 p=uProjectionInverse*vec4(uv*2.-1.,d*2.-1.,1.);return p.xyz/p.w;}
      float lightAt(vec3 world){vec4 sc=uShadowMatrix*vec4(world,1.);vec3 q=sc.xyz/sc.w;if(any(lessThan(q,vec3(0.)))||any(greaterThan(q,vec3(1.))))return 1.;float d=unpackRGBAToDepth(texture2D(tShadow,q.xy));return mix(.15,1.,step(q.z-.001,d));}
      void main(){
        vec2 center=vUv-.5,uv=vUv+vec2(sin(vUv.y*32.+uTime*1.5),cos(vUv.x*27.+uTime*1.1))*(.0012*uSub+.006*uSurface);
        uv+=normalize(center+vec2(.0001))*sin(length(center*vec2(uAspect,1.))*44.-uDropAge*28.)*uImpact*.003;
        float dropLight=0.,dropShade=0.;
        if(uWet>.002&&uSub<.9){
          for(int i=0;i<${low ? 8 : 16};i++){
            float seed=fract(sin(float(i)*47.13+2.4)*43758.5453),seed2=fract(sin(float(i)*23.71+7.1)*13453.32);
            vec2 origin=vec2(.05+seed*.9,.15+seed2*.85-min(uDropAge,10.)*(.012+seed*.016));
            float radius=.011+seed2*.019;
            vec2 q=(vUv-origin)*vec2(uAspect,1.)/vec2(radius,radius*(1.1+seed*.5));float d=length(q);
            if(d<1.){
              float mask=(1.-smoothstep(.75,1.,d))*uWet*(1.-uSub);
              uv-=q*.012*mask;
              vec3 n=normalize(vec3(q,sqrt(max(.001,1.-d*d))));
              float spec=pow(max(0.,dot(n,normalize(vec3(-.4,.6,.7)))),45.);
              dropLight+=(spec*.8+exp(-pow((d-.88)*15.,2.))*.13)*mask;
              dropShade+=mask*.16;
            }
          }
        }
        vec3 color=texture2D(tDiffuse,clamp(uv,.001,.999)).rgb;
        float d=texture2D(tDepth,vUv).x;vec3 vp=viewPosition(vUv);
        if(d<.99998&&length(vp)<65.){
          vec3 normal=normalize(cross(dFdx(vp),dFdy(vp)));float occ=0.;
          float radius=clamp(.7/max(1.,-vp.z),.001,.03);
          for(int i=0;i<6;i++){
            float angle=float(i)*2.399963;vec2 off=vec2(cos(angle)/uAspect,sin(angle))*radius;
            vec3 delta=viewPosition(vUv+off)-vp;float dist=length(delta);
            occ+=max(0.,dot(normal,delta/max(.001,dist))-.1)*(1.-smoothstep(.05,1.5,dist));
          }
          color*=1.-min(.45,occ/6.*uAo);
        }
        if(uSub>.001){
          vec3 ray=normalize(vp),ro=uCameraWorld[3].xyz;
          vec3 worldRay=normalize((uCameraWorld*vec4(ray,0.)).xyz);
          float surfaceLimit=worldRay.y>.001?max(0.,(-.1-ro.y)/worldRay.y):10000.;
          float lengthToSurface=min(min(length(vp),45.),surfaceLimit),stepSize=lengthToSurface/float(${low ? 8 : 16});vec3 scattering=vec3(0.);
          for(int i=0;i<${low ? 8 : 16};i++){
            vec3 world=(uCameraWorld*vec4(ray*(float(i)+.5)*stepSize,1.)).xyz;
            vec2 surface=world.xz-world.y*uSun.xz/max(.05,uSun.y);
            float n=sin(surface.x*.42+sin(surface.y*.37+uTime*.5))*sin(surface.y*.44+cos(surface.x*.4-uTime*.45));
            float shaft=pow(1.-abs(n),8.);
            float sun=exp(world.y*.055)*lightAt(world);
            scattering+=vec3(.025,.065,.075)*(.025+shaft*.055)*sun*stepSize*exp(-float(i)*stepSize*.028);
          }
          color+=scattering*uSub;
          float opticalDistance=min(length(vp),surfaceLimit);
          float distantFog=1.-exp(-pow(opticalDistance*.018,2.));
          color=mix(color,vec3(.004,.084,.138),distantFog*uSub);
          color*=mix(vec3(1.),vec3(.72,1.02,1.03),uSub*.38);
        }
        color*=1.-dot(center*vec2(1.,.8),center)*.28;
        color=color*(1.-min(.3,dropShade))+vec3(.75,.9,1.)*dropLight;
        gl_FragColor=vec4(color,1.);
      }`,
  });
  // ShaderPass clones supplied uniforms. Rendered depth and moving camera
  // matrices must retain the live objects rather than cloned snapshots.
  pass.uniforms.tDepth.value = depth;
  pass.uniforms.uProjectionInverse.value = camera.projectionMatrixInverse;
  pass.uniforms.uCameraWorld.value = camera.matrixWorld;
  return pass;
}
