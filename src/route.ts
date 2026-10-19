import { CatmullRomCurve3, MathUtils, Vector3 } from "three";

export const DURATION = 100;
export const CHAPTERS = [0, 0.4, 0.84] as const;
// The same continuous curve is sampled in either direction. Y=0 is mean sea level.
export const WAYPOINTS = [
  [0, 5.6, 25],
  [1, 4.2, 17],
  [2, 2.1, 5],
  [2, 0.45, -8],
  [1, -3.5, -20],
  [-4, -12, -36],
  [-10, -20, -55],
  [0, -20, -77],
  [15, -17, -93],
  [23, -8, -106],
  [25, -4, -112],
  [25, 16, -113],
  [22, 58, -105],
  [6, 100, -75],
  [-35, 180, 60],
  [-100, 260, 240],
] as const;
const lookPoints = [
  [-4, -2, -35],
  [-4, -2, -40],
  [-4, 0, -45],
  [-3, -4, -43],
  [-5, -13, -48],
  [-8, -20, -60],
  [4, -21, -78],
  [18, -18, -96],
  [23, -8, -111],
  [25, 4, -117],
  [25, 20, -118],
  [20, 45, -110],
  [3, 100, -85],
  [-15, 135, -15],
  [-20, 35, 40],
  [-20, 0, 40],
];
export const route = new CatmullRomCurve3(
  WAYPOINTS.map((p) => new Vector3(...p)),
  false,
  "centripetal",
);
const gaze = new CatmullRomCurve3(
  lookPoints.map((p) => new Vector3(...(p as [number, number, number]))),
  false,
  "centripetal",
);
export function sampleRoute(
  progress: number,
  position = new Vector3(),
  target = new Vector3(),
) {
  const p = MathUtils.clamp(progress, 0, 1);
  route.getPoint(p, position);
  gaze.getPoint(p, target);
  return { position, target };
}
// CPU crossings, displaced surface, spray and normals share these wave terms.
const waves = [
  [0.16, 0.2, 0.11, -0.85],
  [0.1, -0.06, 0.3, 1.1],
  [0.035, 0.85, 0.65, -1.7],
] as const;
export function waveHeight(x: number, z: number, time: number) {
  let y = 0;
  for (const [a, kx, kz, speed] of waves)
    y += a * Math.sin(x * kx + z * kz + time * speed);
  return y;
}
const f = (n: number) => n.toFixed(5);
export const waveGLSL = `
float oceanWave(vec2 p,float t){return ${waves.map(([a, x, z, s]) => `${f(a)}*sin(p.x*${f(x)}+p.y*${f(z)}+t*${f(s)})`).join("+")};}
vec2 oceanSlope(vec2 p,float t){return ${waves.map(([a, x, z, s]) => `vec2(${f(a * x)},${f(a * z)})*cos(p.x*${f(x)}+p.y*${f(z)}+t*${f(s)})`).join("+")};}
`;
export function submersion(height: number) {
  return 1 - MathUtils.smoothstep(height, -0.42, 0.42);
}
export function chapterAt(progress: number) {
  return progress < 0.29 ? 0 : progress < 0.755 ? 1 : 2;
}
export function terrainHeight(x: number, z: number) {
  const d = Math.hypot((x + 20) / 55, (z - 50) / 65);
  const island = 30 * Math.exp(-Math.pow(d / 0.98, 4));
  const ripple =
    Math.sin(x * 0.16) * Math.cos(z * 0.13) * 0.6 +
    Math.sin(x * 0.48 + z * 0.28) * 0.18;
  return -24 + island + ripple * MathUtils.smoothstep(island, 1, 14);
}
