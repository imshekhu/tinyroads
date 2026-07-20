export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineLow: OscillatorNode | null = null;
  private engineHigh: OscillatorNode | null = null;
  private muted = false;
  private paused = false;

  start() {
    if (this.context) {
      void this.context.resume();
      return;
    }

    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0.58;
    this.master.connect(this.context.destination);

    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1100;
    filter.Q.value = 1.2;
    filter.connect(this.master);

    this.engineGain = this.context.createGain();
    this.engineGain.gain.value = 0.04;
    this.engineGain.connect(filter);

    this.engineLow = this.context.createOscillator();
    this.engineLow.type = "sawtooth";
    this.engineLow.frequency.value = 48;
    this.engineLow.connect(this.engineGain);
    this.engineLow.start();

    this.engineHigh = this.context.createOscillator();
    this.engineHigh.type = "triangle";
    this.engineHigh.frequency.value = 96;
    const highGain = this.context.createGain();
    highGain.gain.value = 0.26;
    this.engineHigh.connect(highGain);
    highGain.connect(this.engineGain);
    this.engineHigh.start();
  }

  update(speedRatio: number, throttle: number, offRoad: boolean) {
    if (!this.context || !this.engineLow || !this.engineHigh || !this.engineGain) {
      return;
    }
    const now = this.context.currentTime;
    const rpm = 46 + speedRatio * 118 + throttle * 18;
    this.engineLow.frequency.setTargetAtTime(rpm, now, 0.055);
    this.engineHigh.frequency.setTargetAtTime(rpm * 2.03, now, 0.055);
    this.engineGain.gain.setTargetAtTime(
      (0.032 + speedRatio * 0.045 + throttle * 0.012) *
        (offRoad ? 1.12 : 1),
      now,
      0.08,
    );
  }

  collect() {
    this.playTone([620, 880, 1240], 0.055, "sine", 0.16);
  }

  checkpoint() {
    this.playTone([360, 520], 0.09, "triangle", 0.12);
  }

  raceStart() {
    this.playTone([240, 240, 480], 0.12, "square", 0.1);
  }

  raceFinish() {
    this.playTone([440, 554, 659, 880], 0.11, "triangle", 0.16);
  }

  powerPickup() {
    this.playTone([520, 780, 1040], 0.06, "triangle", 0.14);
  }

  powerUse() {
    this.playTone([300, 480, 640], 0.07, "square", 0.11);
  }

  private playTone(
    notes: number[],
    spacing: number,
    type: OscillatorType,
    gainAmount: number,
  ) {
    if (!this.context || !this.master || this.muted) return;
    const now = this.context.currentTime;
    notes.forEach((frequency, index) => {
      const oscillator = this.context!.createOscillator();
      const gain = this.context!.createGain();
      const start = now + index * spacing;
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(gainAmount, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      oscillator.connect(gain);
      gain.connect(this.master!);
      oscillator.start(start);
      oscillator.stop(start + 0.2);
    });
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(
        this.muted || this.paused ? 0 : 0.58,
        this.context.currentTime,
        0.04,
      );
    }
    return this.muted;
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(
        this.muted || paused ? 0 : 0.58,
        this.context.currentTime,
        0.05,
      );
    }
  }

  dispose() {
    this.engineLow?.stop();
    this.engineHigh?.stop();
    void this.context?.close();
    this.context = null;
  }
}
