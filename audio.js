/* Original procedural SFX: no samples, network, music, or automatic playback. */
export const SOUND_EVENTS = Object.freeze(['crystal', 'magnet', 'fuel', 'shield', 'smash', 'damage', 'near', 'zone', 'arrival', 'won', 'lost']);

const NOTES = {
  magnet: [[0,330,.18,.14],[.09,494,.20,.12],[.18,740,.30,.13]],
  crystal: [[0, 659.25, .18, .16], [.045, 987.77, .22, .075]],
  shield: [[0, 196, .23, .20], [.03, 392, .27, .14], [.09, 784, .23, .09]],
  damage: [[0, 185, .12, .23], [.092, 138.59, .19, .17]],
  zone: [[0, 440, .14, .14], [.11, 659.25, .21, .12]],
  arrival: [[0, 293.66, .22, .13], [.12, 440, .24, .13], [.27, 587.33, .32, .16]],
  won: [[.05, 392, .28, .13], [.26, 523.25, .29, .14], [.49, 659.25, .38, .14], [.84, 783.99, .55, .16], [1.44, 659.25, .33, .12], [1.77, 783.99, .33, .12], [2.12, 1046.5, .80, .14], [2.14, 523.25, 1.25, .10], [2.15, 659.25, 1.20, .08], [2.16, 783.99, 1.15, .08]],
  lost: [[0, 293.66, .28, .16], [.23, 246.94, .32, .14], [.51, 196, .54, .14], [.53, 98, .70, .10]],
};
const DURATION = {magnet:.55,crystal:.38, fuel:.53, shield:.40, smash:.36, damage:.34, near:.30, zone:.36, arrival:.66, won:3.85, lost:1.30};

function envelope(t, length, attack = .007, release = .07) {
  if (t < 0 || t >= length) return 0;
  return Math.min(1, t / attack) * Math.min(1, (length - t) / release) * Math.exp(-1.9 * t / length);
}
function triangle(phase) { return 2 / Math.PI * Math.asin(Math.sin(phase)); }

/** Pure deterministic renderer, shared by browser playback and offline WAV previews. */
export function renderSound(event, sampleRate = 44100, variation = 0) {
  if (!SOUND_EVENTS.includes(event)) return new Float32Array(0);
  const data = new Float32Array(Math.ceil(DURATION[event] * sampleRate));
  let randomState = (0x54ab19 + SOUND_EVENTS.indexOf(event) * 73513 + variation * 997) >>> 0;
  const random = () => {
    randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5;
    return (randomState >>> 0) / 4294967296 * 2 - 1;
  };
  // A fixed three-step rotation keeps collectible repetitions musical.
  const crystalShift = [1, 1.122462, 1.334840][((variation % 3) + 3) % 3];
  const notes = NOTES[event] || [];
  let lowNoise = 0, motorPhase = 0, bassPhase = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate;
    const noise = random();
    lowNoise += (noise - lowNoise) * (1 - Math.exp(-2 * Math.PI * (event === 'near' ? 1250 : 2100) / sampleRate));
    let value = 0;
    for (const [start, frequency, length, gain] of notes) {
      const nt = t - start;
      if (nt < 0 || nt >= length) continue;
      const f = frequency * (event === 'crystal' ? crystalShift : 1);
      const phase = 2 * Math.PI * f * nt;
      const body = event === 'crystal'
        ? .94 * Math.sin(phase) + .06 * Math.sin(phase * 2) * Math.exp(-nt * 35)
        : .73 * Math.sin(phase) + .22 * triangle(phase) + .05 * Math.sin(phase * 2);
      value += body * gain * envelope(nt, length, event === 'crystal' ? .012 : event === 'won' ? .016 : .006, event === 'crystal' ? .12 : event === 'won' ? .24 : .075);
    }
    if (event === 'fuel') {
      motorPhase += 2 * Math.PI * (70 + 310 * Math.pow(t / .53, .75)) / sampleRate;
      value += (.21 * triangle(motorPhase) + .075 * lowNoise) * envelope(t, .51, .018, .15);
    } else if (event === 'shield') {
      value += lowNoise * .045 * envelope(t, .34, .012, .16);
    } else if (event === 'smash') {
      bassPhase += 2 * Math.PI * (49 + 100 * Math.exp(-t * 24)) / sampleRate;
      const shards = (.55 + .45 * Math.max(0, Math.sin(t * 2 * Math.PI * 71)));
      value += (.24 * Math.sin(bassPhase) + .25 * lowNoise * shards) * envelope(t, .34, .002, .18);
    } else if (event === 'damage') {
      value += lowNoise * .075 * envelope(t, .11, .002, .08);
    } else if (event === 'near') {
      const air = Math.pow(Math.sin(Math.PI * t / .30), 2);
      motorPhase += 2 * Math.PI * (690 - 510 * t / .30) / sampleRate;
      value += (.10 * lowNoise + .045 * Math.sin(motorPhase)) * air;
    }
    // Smooth saturation bounds individual voices, including chords and transients.
    data[i] = Math.tanh(value * 1.25) * .78;
  }
  return data;
}

/** Call enable() directly from the sound-toggle click/pointer handler. */
export function createSoundBank() {
  let context = null, master = null, enabled = false, variation = 0;
  const active = [];
  const cache = new Map();
  const lastPlayed = new Map();
  const stopAll = () => {
    for (const voice of active.splice(0)) {
      try { voice.source.stop(); } catch { /* Already ended. */ }
    }
  };
  return {
    async enable() {
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContext) return false;
      try {
        if (!context) {
          context = new AudioContext({latencyHint:'interactive'});
          master = context.createGain();
          master.gain.value = .55;
          const limiter = context.createDynamicsCompressor();
          limiter.threshold.value = -12;
          limiter.knee.value = 12;
          limiter.ratio.value = 6;
          limiter.attack.value = .003;
          limiter.release.value = .12;
          master.connect(limiter).connect(context.destination);
        }
        await context.resume();
        enabled = context.state === 'running';
        return enabled;
      } catch { enabled = false; return false; }
    },
    setEnabled(value) {
      enabled = Boolean(value) && Boolean(context) && context.state === 'running';
      if (!enabled) stopAll();
      return enabled;
    },
    play(event) {
      if (!enabled || !context || context.state !== 'running' || !SOUND_EVENTS.includes(event)) return false;
      const now = context.currentTime;
      // Avoid unbounded queues and harsh repeated collision chatter.
      if (now - (lastPlayed.get(event) ?? -Infinity) < (event === 'crystal' ? .045 : .08)) return false;
      lastPlayed.set(event, now);
      while (active.length >= 5) {
        const old = active.shift();
        old.gain.gain.setTargetAtTime(0, now, .007);
        old.source.stop(now + .025);
      }
      const take = event === 'crystal' ? variation++ % 3 : 0;
      const key = `${event}:${take}`;
      if (!cache.has(key)) {
        const pcm = renderSound(event, context.sampleRate, take);
        const buffer = context.createBuffer(1, pcm.length, context.sampleRate);
        buffer.copyToChannel(pcm, 0);
        cache.set(key, buffer);
      }
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = cache.get(key);
      source.connect(gain).connect(master);
      const voice = {source, gain, event, started:now};
      active.push(voice);
      source.onended = () => {
        const index = active.indexOf(voice);
        if (index >= 0) active.splice(index, 1);
        source.disconnect(); gain.disconnect();
      };
      source.start();
      return true;
    },
  };
}
