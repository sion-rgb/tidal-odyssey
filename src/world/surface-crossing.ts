import * as T from "three";
import { CrossingTracker, type CrossingEvent } from "../crossing.ts";
import { waveGLSL, waveHeight } from "../route.ts";
import { seeded } from "./terrain.ts";

export function createSurfaceCrossing(low: boolean, reduced: boolean) {
  const group = new T.Group(),
    tracker = new CrossingTracker(),
    random = seeded(724);
  const uniforms = {
    uAge: { value: 20 },
    uTime: { value: 0 },
    uExit: { value: 0 },
    uPower: { value: 1 },
    uViewport: { value: 800 },
  };
  const pos: number[] = [],
    uv: number[] = [],
    indices: number[] = [],
    segments = low ? 40 : 72,
    rows = 6;
  for (let r = 0; r <= rows; r++)
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      pos.push(Math.cos(a), r / rows, Math.sin(a));
      uv.push(j / segments, r / rows);
      if (r < rows && j < segments) {
        const n = r * (segments + 1) + j;
        indices.push(
          n,
          n + 1,
          n + segments + 1,
          n + 1,
          n + segments + 2,
          n + segments + 1,
        );
      }
    }
  const crownGeo = new T.BufferGeometry();
  crownGeo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  crownGeo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  crownGeo.setIndex(indices);
  const crownMat = new T.ShaderMaterial({
    uniforms,
    side: T.DoubleSide,
    transparent: true,
    depthWrite: false,
    vertexShader:
      waveGLSL +
      `
      uniform float uAge,uTime,uExit,uPower;varying vec2 vUv;varying float vHeight;
      void main(){vUv=uv;float a=uv.x*6.283185;float h=max(0.,sin(min(uAge/1.15,1.)*3.14159));
        float teeth=.65+.19*sin(a*9.+.4)+.16*sin(a*17.-1.);
        float radius=.85+uAge*(1.7+uExit*.8)+uv.y*.38;
        vec3 p=vec3(position.x*radius,0.,position.z*radius);
        vec3 wp=(modelMatrix*vec4(p,1.)).xyz;
        p.y=oceanWave(wp.xz,uTime)-modelMatrix[3].y+.025+sin(uv.y*3.14159)*h*teeth*(.09+uExit*.42)*uPower;
        vHeight=sin(uv.y*3.14159)*h;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
      }`,
    fragmentShader: `uniform float uAge;varying vec2 vUv;varying float vHeight;
      void main(){float broken=.6+.4*sin(vUv.x*173.+sin(vUv.x*41.)*3.+vUv.y*19.);
        float crest=pow(max(0.,sin(vUv.y*3.14159)),.5);
        float alpha=crest*(.3+broken*.5)*(1.-smoothstep(.65,1.45,uAge));
        gl_FragColor=vec4(mix(vec3(.2,.65,.76),vec3(1.4,1.65,1.7),vHeight*.75+broken*.2),alpha);
      }`,
  });
  const crown = new T.Mesh(crownGeo, crownMat);
  crown.frustumCulled = false;
  crown.renderOrder = 3;
  group.add(crown);
  const count = low ? 84 : 180,
    origins = [],
    velocities = [],
    sizes = [],
    kinds = [];
  for (let i = 0; i < count; i++) {
    const a = random() * Math.PI * 2,
      r = 0.15 + random() * 0.35;
    origins.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    velocities.push(
      Math.cos(a) * (1.3 + random() * 3.4),
      3 + random() * 4,
      Math.sin(a) * (1.3 + random() * 3.4),
    );
    sizes.push(0.018 + random() * 0.055);
    kinds.push(i % 3 === 0 ? 1 : 0);
  }
  const particleGeo = new T.BufferGeometry();
  particleGeo.setAttribute(
    "position",
    new T.Float32BufferAttribute(origins, 3),
  );
  particleGeo.setAttribute(
    "aVelocity",
    new T.Float32BufferAttribute(velocities, 3),
  );
  particleGeo.setAttribute("aSize", new T.Float32BufferAttribute(sizes, 1));
  particleGeo.setAttribute("aKind", new T.Float32BufferAttribute(kinds, 1));
  const particleMat = new T.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `uniform float uAge,uExit,uPower,uViewport;attribute vec3 aVelocity;attribute float aSize,aKind;varying float vBubble;varying float vAlpha;
      void main(){float t=uAge;vec3 p=position+aVelocity*t*vec3(1.,1.+uExit*.6,1.);p.y-=4.9*t*t;
        vBubble=aKind*(1.-uExit);if(vBubble>.5)p.y=-.22-t*(aVelocity.y*.45)+t*t*.4;
        vec4 view=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*view;
        gl_PointSize=clamp(aSize*uPower*uViewport/max(.15,-view.z),1.,30.);
        vAlpha=(1.-smoothstep(.65,1.6,t))*smoothstep(0.,.055,t)*step(.06,-view.z);
      }`,
    fragmentShader: `varying float vBubble,vAlpha;void main(){vec2 q=gl_PointCoord*2.-1.;float d=length(q);if(d>1.)discard;
      float rim=smoothstep(.48,.8,d)*(1.-smoothstep(.8,1.,d));float glint=exp(-dot(q-vec2(-.25,.35),q-vec2(-.25,.35))*24.);
      float alpha=mix((1.-d*d)*.72,rim*.65+glint*.55,vBubble)*vAlpha;
      gl_FragColor=vec4(vec3(.6,.9,1.)+glint*.7,alpha);
    }`,
  });
  const spray = new T.Points(particleGeo, particleMat);
  spray.frustumCulled = false;
  spray.renderOrder = 4;
  group.add(spray);
  let born = -100,
    lastDirection: "entry" | "exit" = "entry",
    entries = 0,
    exits = 0,
    age = 20;
  group.visible = false;
  group.traverse((object) => object.layers.set(2));
  return {
    group,
    update(
      time: number,
      camera: T.PerspectiveCamera,
      progress: number,
      height: number,
    ): CrossingEvent | null {
      const p = camera.position,
        event = tracker.sample(height, progress, time, p.x, p.y, p.z);
      if (event) {
        born = time;
        lastDirection = event.direction;
        event.direction === "entry" ? entries++ : exits++;
        group.position.set(
          event.x,
          waveHeight(event.x, event.z, time),
          event.z,
        );
        uniforms.uExit.value = event.direction === "exit" ? 1 : 0;
        uniforms.uPower.value = reduced
          ? 0.7
          : T.MathUtils.clamp(0.7 + event.speed * 0.1, 0.9, 1.65);
      }
      age = Math.max(0, time - born);
      uniforms.uAge.value = age;
      uniforms.uTime.value = time;
      uniforms.uViewport.value = innerHeight * 0.5;
      group.visible = age < 1.65;
      return event;
    },
    get impact() {
      return Math.max(0, 1 - age / 0.75);
    },
    get wet() {
      return (
        Math.exp(-age / (lastDirection === "exit" ? 3.5 : 0.65)) *
        (age < 10 ? 1 : 0)
      );
    },
    get dropAge() {
      return age;
    },
    get exit() {
      return lastDirection === "exit";
    },
    get evidence() {
      return {
        entries,
        exits,
        lastDirection,
        age,
        active: group.visible,
        particles: group.visible ? count : 0,
      };
    },
    reset() {
      tracker.reset();
      born = -100;
      age = 20;
      group.visible = false;
    },
  };
}
