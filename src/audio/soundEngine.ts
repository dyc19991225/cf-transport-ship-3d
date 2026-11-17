import { MaterialType, WeaponId } from '../types';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private oceanNode: AudioBufferSourceNode | null = null;

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.72;

      // Subtle compressor for punchy FPS gunshots without clipping
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 18;
      comp.ratio.value = 6;
      comp.attack.value = 0.002;
      comp.release.value = 0.16;

      this.masterGain.connect(comp);
      comp.connect(this.ctx.destination);

      this.noiseBuffer = this.createNoiseBuffer(2.0);
      this.reverbNode = this.createShipDeckReverb(0.55);
      this.reverbGain = this.ctx.createGain();
      this.reverbGain.gain.value = 0.22;
      this.reverbNode.connect(this.reverbGain);
      this.reverbGain.connect(this.masterGain);

      this.startOceanAmbience();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private createNoiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  private createShipDeckReverb(duration: number): ConvolverNode {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * duration);
    const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.pow(1 - t, 2.8);
        // Slight metallic hull early reflections
        const early = i < ctx.sampleRate * 0.045 && i % 190 < 12 ? 1.45 : 1.0;
        d[i] = (Math.random() * 2 - 1) * env * early;
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = impulse;
    return conv;
  }

  private startOceanAmbience(): void {
    if (!this.ctx || !this.noiseBuffer || !this.masterGain || this.oceanNode) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 280;

    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.16; // 6-second ocean wave swell
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 110;
    lfo.connect(filter.frequency);

    const ambGain = this.ctx.createGain();
    ambGain.gain.value = 0.042;

    src.connect(filter);
    filter.connect(ambGain);
    ambGain.connect(this.masterGain);

    src.start();
    lfo.start();
    this.oceanNode = src;
  }

  private routeSpatial(pan = 0, volume = 1, sendReverb = true): GainNode | null {
    if (!this.ctx || !this.masterGain) return null;
    const out = this.ctx.createGain();
    out.gain.value = volume;

    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      out.connect(panner);
      panner.connect(this.masterGain);
      if (sendReverb && this.reverbNode) {
        panner.connect(this.reverbNode);
      }
    } else {
      out.connect(this.masterGain);
      if (sendReverb && this.reverbNode) {
        out.connect(this.reverbNode);
      }
    }
    return out;
  }

  public playWeaponFire(weapon: WeaponId, pan = 0, distanceScale = 1): void {
    this.unlock();
    if (!this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const vol = Math.max(0.05, Math.min(1, distanceScale));
    const dest = this.routeSpatial(pan, vol, weapon !== 'm4a1s');
    if (!dest) return;

    if (weapon === 'ak47') {
      // Raw, aggressive 7.62mm metallic bark
      this.noiseBurst(dest, now, 0.16, 950, 1.2, 'bandpass', 1.15);
      this.noiseBurst(dest, now, 0.06, 2600, 0.8, 'highpass', 0.55);
      this.pitchDrop(dest, now, 185, 46, 0.11, 'sawtooth', 0.85);
      this.mechClick(dest, now + 0.03, 2100, 0.18);
    } else if (weapon === 'm4a1s') {
      // Classic CF suppressed M4A1-S tight "thwip-chk"
      this.noiseBurst(dest, now, 0.075, 1950, 2.1, 'bandpass', 0.72);
      this.pitchDrop(dest, now, 310, 95, 0.055, 'triangle', 0.58);
      this.mechClick(dest, now + 0.018, 3400, 0.28);
    } else if (weapon === 'awm') {
      // Crisp supersonic .338 sniper crack + hull echo
      this.noiseBurst(dest, now, 0.34, 1150, 0.75, 'bandpass', 1.35);
      this.noiseBurst(dest, now, 0.09, 3200, 0.9, 'highpass', 0.75);
      this.pitchDrop(dest, now, 220, 34, 0.24, 'sawtooth', 1.1);
    } else if (weapon === 'barrett') {
      // Earth-shattering .50 BMG cannon thunder ("大炮")
      this.noiseBurst(dest, now, 0.52, 620, 0.65, 'lowpass', 1.65);
      this.noiseBurst(dest, now, 0.22, 1650, 0.8, 'bandpass', 1.15);
      this.pitchDrop(dest, now, 145, 24, 0.38, 'sawtooth', 1.45);
      this.pitchDrop(dest, now, 88, 22, 0.44, 'sine', 1.2);
    } else if (weapon === 'deagle') {
      // Heavy .50 AE pistol snap
      this.noiseBurst(dest, now, 0.15, 1300, 1.0, 'bandpass', 0.95);
      this.pitchDrop(dest, now, 230, 58, 0.09, 'square', 0.65);
    } else if (weapon === 'kukri') {
      // Fast blade whoosh
      this.noiseBurst(dest, now, 0.11, 1600, 2.4, 'bandpass', 0.48);
      this.pitchDrop(dest, now, 620, 190, 0.09, 'sine', 0.25);
    }
  }

  public playBoltCycle(): void {
    this.unlock();
    if (!this.ctx) return;
    const dest = this.routeSpatial(0.1, 0.55, false);
    if (!dest) return;
    const now = this.ctx.currentTime;
    this.mechClick(dest, now + 0.22, 2400, 0.38);
    this.mechClick(dest, now + 0.36, 1750, 0.42);
    this.mechClick(dest, now + 0.56, 2050, 0.42);
    this.mechClick(dest, now + 0.68, 2850, 0.35);
  }

  public playKnifeDraw(): void {
    this.unlock();
    if (!this.ctx) return;
    const dest = this.routeSpatial(0, 0.45, false);
    if (!dest) return;
    const now = this.ctx.currentTime;
    // Metallic blade ring "shing!"
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2150, now);
    osc.frequency.exponentialRampToValueAtTime(3480, now + 0.14);
    g.gain.setValueAtTime(0.24, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(g);
    g.connect(dest);
    osc.start(now);
    osc.stop(now + 0.23);
  }

  public playReload(duration: number): void {
    this.unlock();
    if (!this.ctx) return;
    const dest = this.routeSpatial(-0.08, 0.55, false);
    if (!dest) return;
    const now = this.ctx.currentTime;
    // Mag out -> mag slap in -> bolt rack
    this.mechClick(dest, now + duration * 0.16, 1450, 0.42);
    this.mechClick(dest, now + duration * 0.54, 1180, 0.52);
    this.mechClick(dest, now + duration * 0.58, 2350, 0.38);
    this.mechClick(dest, now + duration * 0.82, 2650, 0.46);
  }

  public playFootstep(material: MaterialType, underground = false, pan = 0, vol = 0.32): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const dest = this.routeSpatial(pan, vol, underground);
    if (!dest) return;
    const now = this.ctx.currentTime;
    if (material === 'wood') {
      this.pitchDrop(dest, now, 165, 62, 0.055, 'triangle', 0.55);
      this.noiseBurst(dest, now, 0.04, 650, 1.8, 'bandpass', 0.35);
    } else if (material === 'container' || underground) {
      // Hollow metallic clang
      this.pitchDrop(dest, now, 280, 92, 0.07, 'sine', 0.48);
      this.mechClick(dest, now, 1850, 0.32);
    } else if (material === 'concrete') {
      this.noiseBurst(dest, now, 0.045, 900, 1.2, 'lowpass', 0.45);
    } else {
      // Heavy steel ship deck step
      this.pitchDrop(dest, now, 195, 68, 0.05, 'triangle', 0.45);
      this.mechClick(dest, now, 2150, 0.2);
    }
  }

  public playImpact(material: MaterialType, pan = 0, vol = 0.45): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const dest = this.routeSpatial(pan, vol, false);
    if (!dest) return;
    const now = this.ctx.currentTime;
    if (material === 'wood') {
      this.noiseBurst(dest, now, 0.06, 820, 1.4, 'bandpass', 0.65);
      this.pitchDrop(dest, now, 240, 85, 0.045, 'triangle', 0.45);
    } else if (material === 'steel' || material === 'container') {
      // Crisp metallic ricochet ping
      const freq = 2400 + Math.random() * 1100;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.55, now + 0.11);
      g.gain.setValueAtTime(0.28, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(g);
      g.connect(dest);
      osc.start(now);
      osc.stop(now + 0.13);
      this.mechClick(dest, now, 3200, 0.35);
    } else {
      this.noiseBurst(dest, now, 0.05, 1100, 1.1, 'bandpass', 0.45);
    }
  }

  public playHitConfirm(headshot: boolean): void {
    this.unlock();
    if (!this.ctx) return;
    const dest = this.routeSpatial(0, headshot ? 0.85 : 0.52, false);
    if (!dest) return;
    const now = this.ctx.currentTime;

    if (headshot) {
      // Iconic CF Helmet DING + crunch!
      const ding = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      ding.type = 'triangle';
      ding.frequency.setValueAtTime(2880, now);
      ding.frequency.exponentialRampToValueAtTime(2360, now + 0.18);
      g.gain.setValueAtTime(0.55, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      ding.connect(g);
      g.connect(dest);
      ding.start(now);
      ding.stop(now + 0.23);
      this.noiseBurst(dest, now, 0.055, 1800, 1.5, 'bandpass', 0.55);
    } else {
      this.mechClick(dest, now, 1650, 0.45);
    }
  }

  public playKillStreakStinger(streak: number, headshot: boolean): void {
    if (!this.ctx) return;
    const dest = this.routeSpatial(0, 0.55, true);
    if (!dest) return;
    const now = this.ctx.currentTime;
    const baseNotes = [330, 392, 440, 523.25, 587.33, 659.25];
    const idx = Math.min(baseNotes.length - 1, Math.max(0, streak - 1));
    const root = baseNotes[idx] * (headshot ? 1.12 : 1.0);

    // Energetic CF rock chord stinger
    [1, 1.25, 1.5].forEach((mult, i) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = i === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(root * mult, now + i * 0.035);
      g.gain.setValueAtTime(0.16, now + i * 0.035);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.38 + i * 0.04);
      osc.connect(g);
      g.connect(dest);
      osc.start(now + i * 0.035);
      osc.stop(now + 0.44 + i * 0.04);
    });
  }

  public playFireInTheHoleRadio(): void {
    if (!this.ctx) return;
    const dest = this.routeSpatial(0, 0.45, false);
    if (!dest) return;
    const now = this.ctx.currentTime;
    // Two-tone tactical walkie-talkie chirp
    [1560, 1980].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.22, now + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.055);
      osc.connect(g);
      g.connect(dest);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.06);
    });
  }

  public playGrenadeExplosion(pan = 0, distanceScale = 1): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const dest = this.routeSpatial(pan, Math.min(1.2, distanceScale * 1.15), true);
    if (!dest) return;
    const now = this.ctx.currentTime;
    this.noiseBurst(dest, now, 0.85, 380, 0.6, 'lowpass', 1.7);
    this.noiseBurst(dest, now, 0.35, 1400, 0.8, 'bandpass', 0.95);
    this.pitchDrop(dest, now, 115, 20, 0.65, 'sine', 1.5);
  }

  private noiseBurst(
    dest: AudioNode,
    time: number,
    dur: number,
    freq: number,
    q: number,
    type: BiquadFilterType,
    amp: number
  ): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, time);
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(amp, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start(time, Math.random() * 0.4);
    src.stop(time + dur + 0.01);
  }

  private pitchDrop(
    dest: AudioNode,
    time: number,
    fStart: number,
    fEnd: number,
    dur: number,
    type: OscillatorType,
    amp: number
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(fStart, time);
    osc.frequency.exponentialRampToValueAtTime(Math.max(16, fEnd), time + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(amp, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + dur + 0.01);
  }

  private mechClick(dest: AudioNode, time: number, freq: number, amp: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.45, time + 0.025);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(amp, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.028);
    osc.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + 0.03);
  }
}
