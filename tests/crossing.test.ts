import test from "node:test";
import assert from "node:assert/strict";
import { CrossingTracker } from "../src/crossing.ts";

test("crossing records both directions and interpolates the impact on the surface", () => {
  const tracker = new CrossingTracker();
  tracker.sample(0.5, 0.2, 0, 2, 0.5, -8);
  const entry = tracker.sample(-0.1, 0.201, 0.1, 2, -0.1, -8.5);
  assert.equal(entry?.direction, "entry");
  assert.ok(Math.abs(entry!.y) < 1e-8);
  tracker.sample(-0.6, 0.203, 0.2, 2, -0.6, -9);
  const exit = tracker.sample(0.1, 0.201, 0.3, 2, 0.1, -8.5);
  assert.equal(exit?.direction, "exit");
  assert.ok(Math.abs(exit!.y) < 1e-8);
});
test("idle waves and camera seeks do not produce impact bursts", () => {
  const tracker = new CrossingTracker();
  tracker.sample(0.6, 0.2, 0, 2, 0.5, -8);
  for (let i = 1; i < 20; i++)
    assert.equal(
      tracker.sample(Math.sin(i) * 0.2, 0.2, i * 0.02, 2, 0.5, -8),
      null,
    );
  assert.equal(tracker.sample(-10, 0.44, 0.5, -5, -20, -70), null);
});
test("surface chatter cannot retrigger before leaving the surface band", () => {
  const tracker = new CrossingTracker();
  tracker.sample(0.5, 0.2, 0, 0, 0.5, 0);
  assert.equal(
    tracker.sample(-0.01, 0.201, 0.05, 0, -0.01, -0.1)?.direction,
    "entry",
  );
  assert.equal(tracker.sample(0.02, 0.202, 0.1, 0, 0.02, -0.2), null);
  assert.equal(tracker.sample(-0.03, 0.203, 0.15, 0, -0.03, -0.3), null);
});
