export type CrossingEvent = {
  direction: "entry" | "exit";
  x: number;
  y: number;
  z: number;
  speed: number;
};
type Sample = {
  height: number;
  progress: number;
  time: number;
  x: number;
  y: number;
  z: number;
};

/** Detect travel through the displaced surface, never a bobbing idle camera. */
export class CrossingTracker {
  private previous: Sample | null = null;
  private armed = false;
  reset() {
    this.previous = null;
    this.armed = false;
  }
  sample(
    height: number,
    progress: number,
    time: number,
    x: number,
    y: number,
    z: number,
  ): CrossingEvent | null {
    const previous = this.previous;
    this.previous = { height, progress, time, x, y, z };
    if (!previous) {
      this.armed = Math.abs(height) > 0.32;
      return null;
    }
    const distance = Math.hypot(x - previous.x, y - previous.y, z - previous.z),
      dt = time - previous.time;
    if (
      distance > 8 ||
      Math.abs(progress - previous.progress) > 0.035 ||
      dt < 0 ||
      dt > 0.3
    ) {
      this.armed = Math.abs(height) > 0.32;
      return null;
    }
    const moved =
      Math.abs(progress - previous.progress) > 1e-7 && distance > 0.0005;
    if (
      this.armed &&
      moved &&
      dt > 0 &&
      height * previous.height <= 0 &&
      height !== previous.height
    ) {
      const t = previous.height / (previous.height - height);
      this.armed = false;
      return {
        direction: height > previous.height ? "exit" : "entry",
        x: previous.x + (x - previous.x) * t,
        y: previous.y + (y - previous.y) * t,
        z: previous.z + (z - previous.z) * t,
        speed: Math.min(14, distance / dt),
      };
    }
    if (Math.abs(height) > 0.32) this.armed = true;
    return null;
  }
}
