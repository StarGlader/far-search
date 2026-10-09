export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function random(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// Uniform sampling over the remaining interval lengths, rather than piling rejected rocks at the edges.
export function sampleOutside(rng, forbidden, lo = -.9, hi = .9) {
  let intervals = [[lo,hi]];
  for (const [left,right] of forbidden) {
    const next=[];
    for(const [a,b] of intervals){
      if(right<=a || left>=b) next.push([a,b]);
      else {if(left>a)next.push([a,Math.min(left,b)]);if(right<b)next.push([Math.max(right,a),b]);}
    }
    intervals=next;
  }
  const total=intervals.reduce((sum,[a,b])=>sum+b-a,0);
  if(total<=0) return lo; // Not reached with the game's bounded reward corridor.
  let offset=rng()*total;
  for(const [a,b] of intervals){if(offset<b-a)return a+offset;offset-=b-a;}
  return intervals.at(-1)[1];
}
export const PLANETS = ['Лира', 'Вега', 'Нова'];
export class Flight {
  constructor(seed = 7319, level = 1) {
    this.level = clamp(level, 1, 3); this.seed = seed >>> 0;
    this.rng = random((this.seed ^ Math.imul(this.level, 0x9E3779B9)) >>> 0);
    this.state = 'ready'; this.q = this.previousQ = this.target = 0;
    this.depth = this.previousDepth = this.targetDepth = 1;
    this.velocity = this.distance = this.time = this.score = 0;
    this.length = [4200, 5400, 6700][this.level - 1];
    this.hp = 2; this.magnet = this.shield = this.boost = this.invulnerable = 0;
    this.crystals = this.destroyed = this.near = this.crystalPoints = this.boostCrystals = 0;
    this.objects = []; this.events = []; this.nextRow = 130;
    this.sequence = this.rows = this.arrivalTime = 0; this.lastZone = 0; this.rewardLane = .15; this.magnetRow = 8 + (this.level-1)*2 + Math.floor(this.rng()*5);
  }
  get zone() { return this.distance / this.length < .18 ? 0 : this.distance / this.length < .78 ? 1 : 2; }
  emit(type, data = {}) { this.events.push({type, ...data}); }
  add(type, q, z = 8, radius = .14) {
    this.objects.push({id: ++this.sequence, type, q, z, previousZ: z, radius,
      spin: this.rng() * 6.28, rotation: (this.rng() - .5) * 1.5,
      sprite: Math.floor(this.rng() * 8)});
  }
  start() {
    this.state = 'playing';
    const opening=(this.rng()-.5)*.8;
    const shieldLane=clamp(opening+(this.rng()-.5)*.5,-.65,.65);
    this.rewardLane=shieldLane;
    this.add('fuel',opening,3.8,.16); this.add('shield',shieldLane,5.8,.16);
    const forbidden=[[opening-.48,opening+.48],[shieldLane-.4,shieldLane+.4]];
    this.add('rock',sampleOutside(this.rng,forbidden),4.1+this.rng()*.4,.2+this.rng()*.04);
    this.add('rock',sampleOutside(this.rng,forbidden),5.7+this.rng()*.4,.2+this.rng()*.04);
    this.crystalLine(opening,4.8,3);
  }
  crystalLine(lane, z, count = this.rng() < .5 ? 3 : 5) {
    // Alternate short diagonals and arcs; all points remain in the safe collection corridor.
    const pattern = this.lastCrystalPattern === undefined ? Math.floor(this.rng()*3)
      : (this.lastCrystalPattern + 1 + Math.floor(this.rng()*2)) % 3;
    this.lastCrystalPattern = pattern;
    for (let i=0;i<count;i++) {
      const u=i/(count-1)*2-1;
      const q=lane+u*.18;
      const offset=pattern===0 ? (u+1)*.5 : pattern===1 ? (1-u)*.5 : Math.abs(u)*.7;
      this.add('crystal',q,z+offset,.16);
    }
  }
  pause() {
    if (this.state === 'playing' || this.state === 'arriving') {
      this.pausedState = this.state; this.state = 'paused';
      this.target = this.q; this.targetDepth = this.depth; this.emit('pause');
    }
  }
  resume() { if (this.state === 'paused') this.state = this.pausedState; }
  updateScore() { this.score = Math.floor(this.distance / 20) + this.crystalPoints + 10 * this.destroyed + 15 * this.near + (this.state === 'won' ? 100 : 0); }
  collectCrystal(q) {
    const points = this.boost > 0 ? 20 : 10;
    this.crystals++; this.crystalPoints += points;
    if (this.boost > 0) this.boostCrystals++;
    this.emit('crystal', {q, points});
  }
  step(dt) {
    if (this.state === 'arriving') {
      this.arrivalTime = Math.min(4, this.arrivalTime + dt);
      if (this.arrivalTime >= 4) { this.state = 'won'; this.updateScore(); this.emit('won'); }
      return;
    }
    if (this.state !== 'playing') return;
    this.time += dt; this.previousQ = this.q; this.previousDepth = this.depth;
    this.q += (clamp(this.target, -1, 1) - this.q) * (1 - Math.exp(-15 * dt));
    this.depth += (clamp(this.targetDepth, .9, 1.15) - this.depth) * (1 - Math.exp(-12 * dt));
    this.velocity = (this.q - this.previousQ) / dt;
    for (const key of ['shield', 'boost', 'magnet', 'invulnerable']) this[key] = Math.max(0, this[key] - dt);
    const speed = (90 + (this.level - 1) * 12) * (this.boost > 0 ? 1.5 : 1);
    this.speed = speed; this.distance = Math.min(this.length, this.distance + speed * dt);
    if (this.distance >= this.nextRow && this.distance < this.length - 730) {
      this.nextRow += (this.zone === 0 ? 170 : this.zone === 1 ? 145 : 132) - (this.level - 1) * 7;
      this.row();
    }
    for (const o of this.objects) {
      o.previousZ = o.z;
      if (o.type === 'crystal' && o.suction) {
        o.suction.time += dt;
        const t = clamp(o.suction.time / .2, 0, 1), ease = t * t;
        o.q = o.suction.q + (this.q - o.suction.q) * ease;
        o.z = o.suction.z + (this.depth - o.suction.z) * ease;
        if (t >= 1) { o.consumed = true; this.collectCrystal(this.q); }
        continue;
      }
      o.z -= speed * dt / 100; o.spin += o.rotation * dt;
      // The route stays untouched until a crystal enters the close vacuum radius.
      if (this.magnet > 0 && o.type === 'crystal' && !o.passed && o.z > this.depth && Math.hypot(o.q-this.q, (o.z-this.depth)*.7) < .5) {
        o.suction = {q:o.q, z:o.z, time:0};
        continue;
      }
      const previousGap = o.previousZ - this.previousDepth, currentGap = o.z - this.depth;
      if (!o.passed && previousGap > 0 && currentGap <= 0) {
        const f = previousGap / (previousGap - currentGap);
        const q = this.previousQ + (this.q - this.previousQ) * f;
        const gap = Math.abs(o.q - q), hit = gap < o.radius + .065;
        if (hit) {
          if (o.type === 'rock') {
            if (this.shield > 0) {
              o.consumed = true; this.destroyed++;
              // Ore emerges locally at impact, never as a new train farther down the route.
              for (let i = 0; i < 3; i++) this.add('crystal', clamp(o.q + (i - 1) * .07, -.95, .95), this.depth + .16, .16);
              this.emit('smash', {q: o.q});
            } else if (!this.invulnerable) {
              this.hp--; this.invulnerable = 1.4; this.emit('damage', {q: o.q});
              if (!this.hp) this.state = 'lost';
            }
          } else {
            o.consumed = true;
            if (o.type === 'fuel') { this.boost = 3; this.emit('fuel'); }
            else if (o.type === 'shield') { this.shield = 4; this.emit('shield'); }
            else if (o.type === 'magnet') { this.magnet = 6; this.emit('magnet'); }
            else { this.collectCrystal(o.q); }
          }
        } else if (o.type === 'rock' && gap < o.radius + .22) { this.near++; this.emit('near'); }
        o.passed = true;
        if (this.state === 'lost') break;
      }
    }
    this.objects = this.objects.filter(o => o.z > .45 && !o.consumed);
    this.updateScore();
    if (this.state === 'lost') { this.emit('lost'); return; }
    if (this.zone !== this.lastZone) { this.lastZone = this.zone; this.emit('zone', {zone: this.zone}); }
    if (this.distance >= this.length) {
      this.state = 'arriving'; this.target = this.q; this.targetDepth = this.depth;
      this.objects = []; this.emit('arrival');
    }
  }
  row() {
    this.rows++;
    // A continuous reward route prevents overlapping trains from demanding full-width zigzags.
    const previousReward = this.rewardLane;
    let safe = this.rewardLane + (this.rng() - .5) * .6;
    // Reflect at the boundaries, avoiding a probability spike caused by clamping.
    if(safe>.75)safe=1.5-safe; if(safe<-.75)safe=-1.5-safe;
    this.rewardLane = safe;
    const lane = sampleOutside(this.rng, [[safe-.52,safe+.52],[previousReward-.4,previousReward+.4]]);
    this.add('rock', lane, 8, .19 + this.rng() * .065);
    if (this.level > 1 && this.zone === 1 && this.rows % 4 === 0) {
      const second = (lane > 0 ? -1 : 1) * (.82 + this.rng() * .16);
      if (Math.abs(second - safe) > .45 && Math.abs(second - previousReward) > .4) this.add('rock', second, 8, .18);
    }
    if (this.rows === this.magnetRow) this.add('magnet', safe, 8.5, .16);
    else if (this.rows % 10 === 6) this.add('shield', safe, 8.5, .16);
    else if (this.rows % 6 === 3) this.add('fuel', safe, 8.5, .16);
    else if (this.rows % 3 === 1) this.crystalLine(safe,8.4);
  }
}
