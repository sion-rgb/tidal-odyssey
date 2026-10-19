import "./style.css";
import * as THREE from "three";
import { gsap } from "gsap";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import {
  sampleRoute,
  waveHeight,
  submersion,
  chapterAt,
  CHAPTERS,
  DURATION,
} from "./route.ts";
import { createOcean } from "./world/ocean.ts";
import { createTerrain } from "./world/terrain.ts";
import { createAtmosphere } from "./world/atmosphere.ts";
import { createLife, disposeObject } from "./world/life.ts";
import { createLens } from "./effects.ts";
import { OceanAudio } from "./audio.ts";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("world"),
  loading = $("loading"),
  range = $<HTMLInputElement>("progress"),
  quality = $<HTMLSelectElement>("quality");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = matchMedia("(max-width: 700px)").matches;
const low = small || (navigator.hardwareConcurrency || 4) <= 4;
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: low ? "low-power" : "high-performance",
  });
} catch {
  loading.innerHTML =
    '<div class="loader-brand">PELAGIC</div><p>這個旅程需要 WebGL 2</p><p>請使用支援硬體加速的新版瀏覽器。</p>';
  throw new Error("WebGL 2 unavailable");
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.info.autoReset = false;
renderer.shadowMap.enabled = !low;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#96ccce");
scene.fog = new THREE.FogExp2("#adcfd1", 0.0011);
const camera = new THREE.PerspectiveCamera(small ? 66 : 56, 1, 0.07, 10000);
const sunDirection = new THREE.Vector3(-0.45, 0.7, -0.5).normalize();
const sun = new THREE.DirectionalLight("#fff1d3", 3.1);
sun.position.copy(sunDirection).multiplyScalar(100);
scene.add(sun);
sun.castShadow = !low;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 70;
sun.shadow.camera.bottom = -60;
sun.shadow.camera.far = 240;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.06;
const ambient = new THREE.HemisphereLight("#cce9f0", "#5f6851", 2.05);
scene.add(ambient);
const atmosphere = createAtmosphere(sunDirection, low);
scene.add(atmosphere.sky, atmosphere.clouds);
const terrain = createTerrain();
scene.add(terrain.group);
const ocean = createOcean(renderer, sunDirection, low);
scene.add(ocean.water);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const lens = createLens();
composer.addPass(lens);
const fxaa = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader:
    "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
  fragmentShader:
    "uniform sampler2D tDiffuse;uniform vec2 resolution;varying vec2 vUv;void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;vec3 n=texture2D(tDiffuse,vUv+vec2(0.,resolution.y)).rgb;vec3 s=texture2D(tDiffuse,vUv-vec2(0.,resolution.y)).rgb;vec3 e=texture2D(tDiffuse,vUv+vec2(resolution.x,0.)).rgb;vec3 w=texture2D(tDiffuse,vUv-vec2(resolution.x,0.)).rgb;vec3 l=vec3(.299,.587,.114);float edge=length(vec2(dot(n-s,l),dot(e-w,l)));gl_FragColor=vec4(mix(c,(n+s+e+w)*.25,smoothstep(.15,.6,edge)*.45),1.);}",
});
composer.addPass(fxaa);
composer.addPass(new OutputPass());
const audio = new OceanAudio();
let toastTimer = 0;
function notice(message: string) {
  $("notice").textContent = message;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ($("notice").textContent = ""), 5000);
}
function loadingProgress(message: string, percent: number) {
  $<HTMLProgressElement>("load-progress").value = percent;
  $("load-status").textContent = `${message} · ${percent}%`;
}
loadingProgress("建立海洋與日光", 35);
const life = createLife(low, loadingProgress, notice);
scene.add(life.group);
type Reef = ReturnType<(typeof import("./world/reef.ts"))["createReef"]>;
let reef: Reef | undefined, reefPromise: Promise<void> | undefined;
function ensureReef() {
  if (!reefPromise)
    reefPromise = import("./world/reef.ts")
      .then(({ createReef }) => {
        reef = createReef(low);
        scene.add(reef.group);
      })
      .catch(() => {
        notice("海底景物載入失敗，請重新開啟旅程。");
      });
  return reefPromise;
}
const state = { p: 0 },
  seekProxy = { p: 0 };
let started = false,
  running = false,
  reversed = false,
  previousChapter = -1,
  desired = 0;
const timeline = gsap.timeline({
  paused: true,
  onUpdate: updateUI,
  onComplete: () => setRunning(false),
  onReverseComplete: () => setRunning(false),
});
timeline.to(state, { p: 1, duration: DURATION, ease: "none" });
let seekTween: gsap.core.Tween | undefined;
function setRunning(value: boolean) {
  running = value;
  $("play").setAttribute("aria-pressed", String(value));
  $("play").setAttribute("aria-label", value ? "暫停遊覽" : "播放自動遊覽");
  $("play-icon").setAttribute(
    "d",
    value ? "M7 5h4v14H7zM14 5h4v14h-4z" : "M8 5l11 7-11 7z",
  );
  $("play-label").textContent = value
    ? reversed
      ? "正在返回"
      : "正在遊覽"
    : "自動遊覽";
  if (!value) timeline.pause();
}
function begin() {
  if (!started) {
    started = true;
    document.body.dataset.started = "true";
    void ensureReef();
  }
}
function togglePlay() {
  begin();
  seekTween?.kill();
  if (running) {
    setRunning(false);
    return;
  }
  if (state.p >= 0.999) {
    reversed = true;
  } else if (state.p <= 0.001) {
    reversed = false;
  }
  $("reverse").setAttribute("aria-pressed", String(reversed));
  setRunning(true);
  if (reversed) timeline.reverse();
  else timeline.play();
}
function seek(target: number, duration = 0.7) {
  begin();
  setRunning(false);
  seekTween?.kill();
  desired = THREE.MathUtils.clamp(target, 0, 1);
  seekProxy.p = state.p;
  seekTween = gsap.to(seekProxy, {
    p: desired,
    duration: reduced ? Math.min(duration, 0.35) : duration,
    ease: "power2.out",
    onUpdate: () => timeline.progress(seekProxy.p, false),
  });
}
const chapterCopy = [
  [
    "白沙之岸",
    "把世界，<br>交給潮汐。",
    "腳下是溫暖白沙，眼前是無盡蔚藍。<br>向前走，海洋正在等你。",
    "熱帶海岸",
  ],
  [
    "深藍之下",
    "聽見，<br>海的呼吸。",
    "穿過粼粼海面，讓光帶路。<br>珊瑚、魚群，與另一個世界相遇。",
    "珊瑚海域",
  ],
  [
    "雲海之上",
    "向光，<br>也向自由。",
    "衝破海面，穿越雲的邊界。<br>回望來時的海，世界豁然開朗。",
    "海島上空",
  ],
];
function updateUI() {
  const p = state.p,
    ch = chapterAt(p);
  range.value = String(Math.round(p * 1000));
  range.style.setProperty("--fill", `${p * 100}%`);
  range.setAttribute(
    "aria-valuetext",
    `${chapterCopy[ch][0]}，${Math.round(p * 100)}%`,
  );
  const seconds = Math.round(p * DURATION);
  $("elapsed").textContent = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  if (ch !== previousChapter) {
    previousChapter = ch;
    $("chapter-kicker").textContent = started
      ? chapterCopy[ch][0]
      : "一場跨越海與天的遠征";
    $("headline").innerHTML = chapterCopy[ch][1];
    if (started) $("description").innerHTML = chapterCopy[ch][2];
    $("location").textContent = chapterCopy[ch][3];
    document.querySelectorAll("[data-chapter]").forEach((el, i) => {
      if (i === ch) el.setAttribute("aria-current", "step");
      else el.removeAttribute("aria-current");
    });
  }
}
$("begin").addEventListener("click", togglePlay);
$("play").addEventListener("click", togglePlay);
$("reverse").addEventListener("click", () => {
  begin();
  seekTween?.kill();
  if (state.p < 0.001) {
    notice("已在沙灘起點。向前開始探索。");
    return;
  }
  reversed = !reversed;
  $("reverse").setAttribute("aria-pressed", String(reversed));
  setRunning(true);
  if (reversed) timeline.reverse();
  else timeline.play();
});
range.addEventListener("input", () => seek(Number(range.value) / 1000, 0.35));
document
  .querySelectorAll<HTMLButtonElement>("[data-chapter]")
  .forEach((button) =>
    button.addEventListener("click", () => {
      const target = CHAPTERS[Number(button.dataset.chapter)];
      seek(target, Math.max(1, Math.abs(target - state.p) * 9));
    }),
  );
const dialog = $<HTMLDialogElement>("about");
function showAbout() {
  setRunning(false);
  seekTween?.kill();
  dialog.showModal();
}
$("about-open").addEventListener("click", showAbout);
$("help").addEventListener("click", showAbout);
document
  .querySelector(".dialog-close")!
  .addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      dialog.close();
  }
});
$("sound").addEventListener("click", async () => {
  try {
    const enabled = await audio.toggle();
    $("sound").setAttribute("aria-pressed", String(enabled));
    $("sound").querySelector("span")!.textContent = enabled
      ? "聲音已開"
      : "開啟聲音";
  } catch {
    notice("瀏覽器未能啟動音訊，請再次按下聲音按鈕。");
  }
});
window.addEventListener(
  "wheel",
  (event) => {
    if (
      dialog.open ||
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement
    )
      return;
    event.preventDefault();
    const amount =
      (event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY) * 0.00016;
    seek(
      (seekTween?.isActive() ? desired : state.p) +
        THREE.MathUtils.clamp(amount, -0.07, 0.07),
    );
  },
  { passive: false },
);
let touchY: number | null = null;
canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "mouse") {
    touchY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (touchY === null) return;
  const delta = touchY - e.clientY;
  touchY = e.clientY;
  seek((seekTween?.isActive() ? desired : state.p) + delta * 0.0008, 0.35);
});
const endTouch = () => {
  touchY = null;
};
canvas.addEventListener("pointerup", endTouch);
canvas.addEventListener("pointercancel", endTouch);
window.addEventListener("keydown", (event) => {
  if (
    dialog.open ||
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLSelectElement
  )
    return;
  if (
    event.target instanceof HTMLButtonElement ||
    event.target instanceof HTMLAnchorElement
  )
    return;
  if (event.code === "Space") {
    event.preventDefault();
    togglePlay();
  } else if (event.code === "ArrowDown" || event.code === "ArrowRight") {
    event.preventDefault();
    seek(state.p + 0.025);
  } else if (event.code === "ArrowUp" || event.code === "ArrowLeft") {
    event.preventDefault();
    seek(state.p - 0.025);
  } else if (event.code === "Home") {
    event.preventDefault();
    seek(0, 3);
  } else if (event.code === "End") {
    event.preventDefault();
    seek(1, 5);
  } else if (event.code === "KeyR") $("reverse").click();
});

let pixelRatio = low ? 1 : Math.min(devicePixelRatio, 1.5),
  frameCount = 0,
  frameTotal = 0,
  adjustments = 0,
  fps = 0;
function resize() {
  const width = innerWidth,
    height = innerHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);
  ocean.resize(width, height, pixelRatio);
  camera.aspect = width / height;
  camera.fov = width < 700 ? 66 : 56;
  camera.updateProjectionMatrix();
  fxaa.uniforms.resolution.value.set(
    1 / (width * pixelRatio),
    1 / (height * pixelRatio),
  );
  lens.uniforms.uAspect.value = width / height;
}
function applyQuality() {
  pixelRatio =
    quality.value === "high"
      ? Math.min(devicePixelRatio, 2)
      : quality.value === "low"
        ? 0.7
        : quality.value === "balanced"
          ? 1
          : low
            ? 1
            : Math.min(devicePixelRatio, 1.5);
  frameTotal = frameCount = 0;
  resize();
}
quality.addEventListener("change", applyQuality);
window.addEventListener("resize", resize);
resize();
let raf = 0,
  last = performance.now(),
  worldTime = 0,
  ready = false,
  wasRunning = false,
  disposed = false;
const position = new THREE.Vector3(),
  target = new THREE.Vector3(),
  aboveFog = new THREE.Color("#b8d9dc"),
  belowFog = new THREE.Color("#076677");
function render(now: number) {
  if (disposed) return;
  const rawDelta = (now - last) / 1000,
    delta = Math.min(rawDelta, 0.05);
  last = now;
  worldTime += delta * (reduced ? 0.16 : 1);
  sampleRoute(state.p, position, target);
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const height =
      camera.position.y -
      waveHeight(camera.position.x, camera.position.z, worldTime),
    sub = submersion(height);
  scene.fog!.color.copy(aboveFog).lerp(belowFog, sub);
  (scene.fog as THREE.FogExp2).density = THREE.MathUtils.lerp(
    0.0011,
    0.026,
    sub,
  );
  sun.intensity = THREE.MathUtils.lerp(3.1, 1.75, sub);
  ambient.intensity = THREE.MathUtils.lerp(2.05, 1.35, sub);
  terrain.update(worldTime);
  atmosphere.update(worldTime, camera, sub);
  life.update(worldTime, state.p, camera.position);
  reef?.update(worldTime, delta * (reduced ? 0.16 : 1), sub);
  lens.uniforms.uTime.value = worldTime;
  lens.uniforms.uSub.value = sub;
  lens.uniforms.uSurface.value = Math.exp(-Math.abs(height) * 3.6);
  audio.update(worldTime, sub, camera.position.y);
  $("altitude-label").textContent = height < 0 ? "水深" : "海拔";
  $("altitude-value").innerHTML =
    `${camera.position.y >= 0 ? "+" : ""}${Math.round(camera.position.y)}<span>m</span>`;
  renderer.info.reset();
  ocean.update(worldTime, camera, scene);
  composer.render();
  if (ready && rawDelta > 0 && rawDelta < 0.4) {
    frameTotal += rawDelta;
    frameCount++;
    if (frameCount >= 120) {
      fps = frameCount / frameTotal;
      if (quality.value === "auto" && fps < 38 && pixelRatio > 0.65) {
        pixelRatio = Math.max(0.65, pixelRatio * 0.82);
        adjustments++;
        resize();
      }
      frameTotal = frameCount = 0;
    }
  }
  raf = requestAnimationFrame(render);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    wasRunning = running;
    setRunning(false);
    seekTween?.pause();
    cancelAnimationFrame(raf);
    audio.suspend();
  } else {
    last = performance.now();
    raf = requestAnimationFrame(render);
    seekTween?.resume();
    audio.resume();
    if (wasRunning) {
      setRunning(true);
      if (reversed) timeline.reverse();
      else timeline.play();
    }
  }
});
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  cancelAnimationFrame(raf);
  setRunning(false);
  notice("圖形資源已中斷；正在恢復。");
});
canvas.addEventListener("webglcontextrestored", () => {
  last = performance.now();
  raf = requestAnimationFrame(render);
  notice("圖形資源已恢復，可繼續旅程。");
});
function dispose() {
  disposed = true;
  cancelAnimationFrame(raf);
  timeline.kill();
  seekTween?.kill();
  audio.dispose();
  life.dispose();
  ocean.dispose();
  disposeObject(scene);
  composer.passes.forEach((pass) => pass.dispose());
  composer.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
}
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) dispose();
});
render(performance.now());
void life.palmReady
  .then(async () => {
    loadingProgress("編譯即時渲染", 85);
    await renderer.compileAsync(scene, camera);
    loadingProgress("準備出發", 100);
    ready = true;
    loading.remove();
    updateUI();
    // The reef is a separate chunk, warmed after the first coast frame.
    window.setTimeout(() => void ensureReef(), 1200);
  })
  .catch(() => {
    loadingProgress("渲染啟動失敗，請使用新版瀏覽器", 100);
  });

// Read-only runtime evidence is available in production; seek is development-only.
const diagnostics = () => ({
  ready,
  progress: state.p,
  running,
  reversed,
  camera: camera.position.toArray(),
  submerged: submersion(
    camera.position.y -
      waveHeight(camera.position.x, camera.position.z, worldTime),
  ),
  chapter: chapterAt(state.p),
  pixelRatio,
  fps,
  adjustments,
  drawCalls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
  geometries: renderer.info.memory.geometries,
  textures: renderer.info.memory.textures,
  reefLoaded: !!reef,
  turtleLoaded: life.turtleLoaded,
  audio: audio.context?.state ?? "not-created",
  reducedMotion: reduced,
});
Object.defineProperty(window, "pelagicDiagnostics", { value: diagnostics });
if (import.meta.env.DEV)
  Object.defineProperty(window, "pelagicTest", {
    value: {
      seek: (p: number) => {
        begin();
        setRunning(false);
        seekTween?.kill();
        timeline.progress(p, false);
      },
      ensureReef,
      views: { ocean: ocean.water, clouds: atmosphere.clouds, scene },
    },
  });
