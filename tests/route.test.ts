import test from "node:test";
import assert from "node:assert/strict";
import {
  sampleRoute,
  terrainHeight,
  submersion,
  waveHeight,
} from "../src/route.ts";

test("one continuous route crosses sea level exactly twice and clears terrain", () => {
  let previous = sampleRoute(0).position,
    crossings = 0,
    minClearance = Infinity;
  for (let i = 1; i <= 2000; i++) {
    const { position, target } = sampleRoute(i / 2000);
    assert.ok(position.toArray().every(Number.isFinite));
    assert.ok(
      position.distanceTo(previous) < 2,
      "no camera teleport between adjacent samples",
    );
    assert.ok(
      position.distanceTo(target) > 1,
      "camera and gaze cannot coincide",
    );
    if (Math.sign(previous.y) !== Math.sign(position.y)) crossings++;
    minClearance = Math.min(
      minClearance,
      position.y - terrainHeight(position.x, position.z),
    );
    previous = position;
  }
  assert.equal(crossings, 2);
  assert.ok(minClearance > 0.6, `terrain clearance ${minClearance}`);
  assert.equal(sampleRoute(1).position.y, 260);
});
test("reversing samples the identical route and optical state", () => {
  const forwards = Array.from({ length: 101 }, (_, i) =>
    sampleRoute(i / 100).position.toArray(),
  );
  for (let i = 100; i >= 0; i--) {
    assert.deepEqual(sampleRoute(i / 100).position.toArray(), forwards[i]);
    const y = sampleRoute(i / 100).position.y;
    assert.ok(submersion(y) >= 0 && submersion(y) <= 1);
  }
  assert.equal(submersion(0.5), 0);
  assert.equal(submersion(-0.5), 1);
  assert.equal(submersion(0), 0.5);
});
test("wave surface and underwater blend are smooth at both sides", () => {
  for (let t = 0; t < 40; t += 0.1) {
    assert.ok(Math.abs(waveHeight(4, -10, t)) <= 0.296);
  }
  for (let h = -0.42; h < 0.42; h += 0.001) {
    assert.ok(Math.abs(submersion(h) - submersion(h + 0.001)) < 0.003);
  }
});
test("opening maintains adult eye height above the beach", () => {
  for (let i = 0; i <= 150; i++) {
    const p = sampleRoute(i / 2000).position;
    assert.ok(
      p.y - terrainHeight(p.x, p.z) > 1.8,
      "opening camera clears the sand by 1.8m",
    );
  }
});
