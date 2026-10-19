export class OceanAudio {
  context: AudioContext | null = null;
  enabled = false;
  splashCount = 0;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private surf: GainNode | null = null;
  private wind: GainNode | null = null;
  private deep: GainNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private noiseBuffer: AudioBuffer | null = null;
  async toggle() {
    if (!this.context) this.initialize();
    await this.context!.resume();
    this.enabled = !this.enabled;
    this.master!.gain.setTargetAtTime(
      this.enabled ? 0.42 : 0,
      this.context!.currentTime,
      0.15,
    );
    return this.enabled;
  }
  private initialize() {
    const ctx = (this.context = new AudioContext());
    const master = (this.master = ctx.createGain());
    master.gain.value = 0;
    master.connect(ctx.destination);
    const filter = (this.filter = ctx.createBiquadFilter());
    filter.type = "lowpass";
    filter.frequency.value = 5000;
    filter.connect(master);
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 8, ctx.sampleRate),
      data = buffer.getChannelData(0);
    this.noiseBuffer = buffer;
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      brown = (brown + (Math.random() * 2 - 1) * 0.025) / 1.025;
      data[i] = brown * 4;
    }
    const noise = (type: BiquadFilterType, frequency: number) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = frequency;
      const g = ctx.createGain();
      src.connect(f).connect(g).connect(filter);
      src.start();
      this.sources.push(src);
      return g;
    };
    this.surf = noise("bandpass", 650);
    this.wind = noise("highpass", 1600);
    const drone = ctx.createOscillator();
    drone.frequency.value = 62;
    drone.type = "sine";
    this.deep = ctx.createGain();
    this.deep.gain.value = 0;
    drone.connect(this.deep).connect(filter);
    drone.start();
    this.sources.push(drone);
  }
  update(time: number, sub: number, height: number) {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.filter!.frequency.setTargetAtTime(520 + (1 - sub) * 5800, now, 0.18);
    this.surf!.gain.setTargetAtTime(
      (0.35 + 0.16 * Math.sin(time * 0.53)) * (1 - sub * 0.72),
      now,
      0.3,
    );
    this.wind!.gain.setTargetAtTime(
      0.04 + Math.min(0.3, Math.max(0, height) / 500),
      now,
      0.3,
    );
    this.deep!.gain.setTargetAtTime(sub * 0.12, now, 0.3);
  }
  splash(exiting: boolean, speed: number) {
    if (
      !this.enabled ||
      !this.context ||
      this.context.state !== "running" ||
      !this.noiseBuffer
    )
      return;
    this.splashCount++;
    const ctx = this.context,
      source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain(),
      now = ctx.currentTime;
    source.buffer = this.noiseBuffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(exiting ? 1200 : 5200, now);
    filter.frequency.exponentialRampToValueAtTime(
      exiting ? 5500 : 450,
      now + 0.45,
    );
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(
      Math.min(0.85, 0.35 + speed * 0.045),
      now + 0.018,
    );
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    source.connect(filter).connect(gain).connect(this.master!);
    this.sources.push(source);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      const i = this.sources.indexOf(source);
      if (i >= 0) this.sources.splice(i, 1);
    };
    source.start(now, 0.4, 0.95);
  }
  suspend() {
    void this.context?.suspend();
  }
  resume() {
    if (this.enabled) void this.context?.resume();
  }
  dispose() {
    this.sources.forEach((s) => s.stop());
    void this.context?.close();
  }
}
