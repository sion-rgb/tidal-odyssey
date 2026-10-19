import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

export function createLens() {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uSub: { value: 0 },
      uSurface: { value: 0 },
      uSpeed: { value: 0 },
      uAspect: { value: 1 },
    },
    vertexShader:
      "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: `uniform sampler2D tDiffuse;uniform float uTime;uniform float uSub;uniform float uSurface;uniform float uSpeed;uniform float uAspect;varying vec2 vUv;
      void main(){vec2 uv=vUv;vec2 center=uv-.5;
        vec2 ripple=vec2(sin(uv.y*32.+uTime*1.5),cos(uv.x*27.+uTime*1.1));
        uv+=ripple*(.0018*uSub+.008*uSurface);
        // Surface film and refraction remain attached to the physical crossing, in both directions.
        float droplet=pow(max(0.,sin(uv.x*75.+sin(uv.y*23.))*sin(uv.y*55.)),14.)*uSurface;
        vec3 color=texture2D(tDiffuse,clamp(uv+droplet*.008,0.,1.)).rgb;
        color*=mix(vec3(1.),vec3(.68,1.03,1.04),uSub*.65);
        float vignette=1.-dot(center*vec2(1.,.85),center)*(.42+uSub*.55);
        color*=vignette;
        float grain=fract(sin(dot(vUv+uTime*.01,vec2(12.9898,78.233)))*43758.5453)-.5;
        color+=grain*.006;
        gl_FragColor=vec4(color,1.);
      }`,
  });
}
