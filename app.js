import {Flight, clamp, random, PLANETS} from './engine.js';
import {createSoundBank} from './audio.js';
import {normalizeCareer, awardFlight, MEDAL_TARGETS} from './progression.js';
const $ = id => document.getElementById(id);
const canvas = $('space'), ctx = canvas.getContext('2d', {alpha: false});
ctx.imageSmoothingEnabled = false;
const soundBank = createSoundBank();
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
let career = (()=>{try{return normalizeCareer(JSON.parse(read('far-search-career-v1','{}')));}catch{return normalizeCareer();}})();
function flightSeed() {
  if (globalThis.crypto?.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0];
  return (Math.random()*4294967296)>>>0;
}
let sideRocks = [];
function makeFlight(level) { const flight=new Flight(flightSeed(),level); sideRocks=makeSideRocks(flight.seed); canvas.dataset.seed=String(flight.seed); return flight; }
const records = (()=>{try { const r=JSON.parse(read('far-search-records-v4','{}')); return r && typeof r==='object' && !Array.isArray(r) ? r : {}; } catch {return {};}})();
let best = Number(records[career.selected]) || 0;
const accents = Object.freeze({fuel:'#ffc35a', shield:'#65d9ff', crystal:'#b542ff', magnet:'#8876ff'});
let game = makeFlight(career.selected), ink, paper, sprites = [], sound = read('far-search-sound', 'on') !== 'off', accumulator = 0, last = 0;
let visualTime = 0, particles = [], messageTimer = 0, trauma = 0, keys = new Set(), drag = null;
const zones = ['ВНЕШНИЙ ПОЯС', 'КАМЕННОЕ ПОЛЕ', 'ПОДЛЁТ К ПЛАНЕТЕ'];
const stars = Array.from({length: 55}, (_, i) => {
  const r = random(i * 33 + 5); return {x: r() * 240, y: r() * 400, drift: .15 + r() * .25};
});
function makeSideRocks(seed) { return Array.from({length: 20}, (_, i) => {
  const r = random(seed ^ (i * 117 + 19)); return {side: i % 2 ? 1 : -1, spread: 145 + r() * 110, y: -70 + r() * 290, z: .5 + r() * 8, radius: 15 + r() * 22, sprite: i % 8, spin: r() * 6.28};
}); }
function applyTheme() {
  document.documentElement.dataset.theme = 'dark';
  ink = '#f2f2f2'; paper = '#1d1d1d';
  document.querySelector('meta[name=theme-color]').content = paper;
  sprites = Array.from({length: 8}, (_, i) => makeRock(i));
}
function makeRock(seed) {
  const c = document.createElement('canvas'); c.width = c.height = 48;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  const r = random(seed * 17 + 32), radii = Array.from({length: 20}, () => 18 + r() * 5);
  x.fillStyle = '#999999'; x.beginPath();
  radii.forEach((radius, i) => { const a = i / 20 * Math.PI * 2; const px = 24 + Math.cos(a) * radius, py = 24 + Math.sin(a) * radius; i ? x.lineTo(px, py) : x.moveTo(px, py); });
  x.closePath(); x.fill(); x.save(); x.clip();
  x.fillStyle = paper;
  for (let y = 2; y < 46; y++) for (let px = 2; px < 46; px++) if ((px + y) % 3 === 0 && px + y < 37) x.fillRect(px, y, 1, 1);
  for (let n = 0; n < 5; n++) {
    const px = Math.round(10 + r() * 28), py = Math.round(10 + r() * 28), s = Math.round(3 + r() * 4);
    x.fillStyle = paper; x.beginPath(); x.ellipse(px, py, s, s * .8, 0, 0, 6.28); x.fill();
    x.fillStyle = '#999999'; x.beginPath(); x.ellipse(px + 1, py + 1, s - 1, s * .8 - 1, 0, 0, 6.28); x.fill();
    x.fillStyle = paper; x.fillRect(px - s, py - 1, 2, 1);
  }
  x.restore(); return c;
}
applyTheme();
function message(text) { $('effect').textContent = text; messageTimer = 1.6; }
function projection(q, z) { return {x: 120 + q * 90 / z, y: 125 + (200 - q * q * 24) / z, s: 1 / z}; }
function burst(q, count = 16, color = ink) {
  const origin = projection(q, game.depth);
  for (let i = 0; i < count; i++) { const a = Math.random() * 6.28, s = 20 + Math.random() * 80; particles.push({x: origin.x, y: origin.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .6 + Math.random() * .3, color}); }
}
function panel(title, description, button, ad = false) {
  $('title').textContent = title; $('description').textContent = description; $('play').textContent = button;
  $('legend').hidden = true; $('ad').hidden = !ad; $('overlay').hidden = false; $('pause').disabled = true;
  renderCareer(); $('best').textContent = `${PLANETS[game.level-1]} · рекорд на устройстве: ${best}`; $('play').focus({preventScroll: true});
}
function record() { if (game.score > best) { best = game.score; records[game.level] = best; save('far-search-records-v4', JSON.stringify(records)); } }
function events() {
  for (const e of game.events) {
    soundBank.play(e.type);
    if (e.type === 'fuel') message('РАЗГОН · КРИСТАЛЛЫ ×2');
    if (e.type === 'magnet') message('МАГНИТ · КРИСТАЛЛЫ ПРИТЯГИВАЮТСЯ');
    if (e.type === 'shield') message('ЩИТ · ТЕПЕРЬ МОЖНО ТАРАНИТЬ');
    if (e.type === 'crystal') burst(e.q, 4);
    if (e.type === 'smash') { burst(e.q, 26, accents.crystal); trauma = .65; message('РАЗБИТО · ОСКОЛКИ КРИСТАЛЛОВ'); }
    if (e.type === 'near') message('БЛИЗКИЙ ПРОЛЁТ +15');
    if (e.type === 'damage') { trauma = 1; burst(e.q, 8); message('УДАР · КОРПУС −1'); }
    if (e.type === 'zone') message(zones[e.zone]);
    if (e.type === 'arrival') { keys.clear(); drag = null; message('ВЫХОД НА ОРБИТУ'); }
    if (e.type === 'pause') { soundBank.setEnabled(false); panel('Пауза', 'Маршрут подождёт.', 'Продолжить'); }
    if (e.type === 'won') { record(); career = awardFlight(career, game); save('far-search-career-v1', JSON.stringify(career)); panel(`На орбите: ${PLANETS[game.level - 1]}`, `${game.score} очков · ${game.crystals} кристаллов. Медали планеты: ${career.medals[game.level-1].filter(Boolean).length}/3. ${game.level < 3 ? 'Открыта планета '+PLANETS[game.level]+'.' : 'Маршрут открыт! Улучшай медали.'}`, game.level < 3 ? 'К следующей планете' : 'Повторить Нову', true); }
    if (e.type === 'lost') { record(); panel('Ещё один полёт?', `${game.score} очков · ${game.crystals} минералов. Цель: ${PLANETS[game.level - 1]}.`, 'Повторить перелёт'); }
  }
  game.events = [];
}
function renderCareer() {
  const menu = $('career'); menu.hidden = game.state === 'paused';
  const selected = game.state === 'won' ? career.selected : game.level;
  const buttons = $('destinations').querySelectorAll('button');
  buttons.forEach((button,i)=>{
    const unlocked = i < career.unlocked, count = career.medals[i].filter(Boolean).length;
    button.disabled = !unlocked; button.setAttribute('aria-pressed',String(selected===i+1));
    button.textContent = `${PLANETS[i]} · ${unlocked ? count+'/3' : 'закрыта'}`;
    button.setAttribute('aria-label', `${PLANETS[i]}, ${unlocked ? count+' из 3 медалей' : 'закрыта'}`);
  });
  $('mission').textContent = `Цели: долететь · ${MEDAL_TARGETS[selected-1]} кристаллов · без урона`;
}
$('destinations').querySelectorAll('button').forEach((button,i)=>button.onclick=()=>{
  if (i >= career.unlocked || ['playing','arriving','paused'].includes(game.state)) return;
  career.selected = i+1; save('far-search-career-v1',JSON.stringify(career));
  game = makeFlight(i+1); best = Number(records[i+1])||0;
  panel(`Курс: ${PLANETS[i]}`, 'Долетай, собирай кристаллы и улучшай медали. На разгоне кристаллы дают двойные очки.', 'В полёт');
});
renderCareer();
$('best').textContent = `${PLANETS[game.level-1]} · рекорд на устройстве: ${best}`;
$('play').onclick = () => {
  if (sound) enableSound();
  if (game.state === 'paused') game.resume();
  else { const level = game.state === 'won' ? career.selected : game.level; game = makeFlight(level); best = Number(records[level]) || 0; game.start(); particles = []; trauma = 0; }
  keys.clear(); drag = null; $('overlay').hidden = true; $('pause').disabled = false;
  canvas.focus({preventScroll: true}); accumulator = 0;
};
$('pause').onclick = () => { game.pause(); events(); };
function soundUI() {
  $('sound').textContent = `Звук: ${sound ? 'вкл' : 'выкл'}`;
  $('sound').setAttribute('aria-pressed', sound); $('sound').setAttribute('aria-label', sound ? 'Выключить звук' : 'Включить звук');
}
async function enableSound() {
  const enabled = await soundBank.enable();
  // A mute click may arrive while the browser is resuming its audio context.
  if (!sound) { soundBank.setEnabled(false); return; }
  if (enabled) soundBank.play('zone');
  else { sound = false; message('ЗВУК НЕДОСТУПЕН В ЭТОМ БРАУЗЕРЕ'); }
  soundUI();
}
$('sound').onclick = () => {
  sound = !sound; save('far-search-sound', sound ? 'on' : 'off');
  if (sound) enableSound(); else soundBank.setEnabled(false);
  soundUI();
};
soundUI();
canvas.addEventListener('pointerdown', e => {
  if (game.state !== 'playing' || drag) return;
  drag = {id: e.pointerId, x: e.clientX, y: e.clientY, q: game.q, depth: game.depth}; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (drag?.id !== e.pointerId || game.state !== 'playing') return;
  const r = canvas.getBoundingClientRect();
  game.target = clamp(drag.q + (e.clientX - drag.x) / r.width * 2.7, -1, 1);
  game.targetDepth = clamp(drag.depth - (e.clientY - drag.y) / r.height * 1.3, .9, 1.15);
});
const release = e => { if (drag?.id === e.pointerId) { drag = null; game.target = game.q; game.targetDepth = game.depth; } };
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, release);
window.addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's'].includes(e.key) && game.state === 'playing') { e.preventDefault(); keys.add(e.key); }
  if (e.key === 'Escape') { game.pause(); events(); }
});
window.addEventListener('keyup', e => keys.delete(e.key));
function suspend() { keys.clear(); drag = null; game.pause(); events(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); }); window.addEventListener('blur', suspend);
function line(x, y, x2, y2) { ctx.beginPath(); ctx.moveTo(Math.round(x), Math.round(y)); ctx.lineTo(Math.round(x2), Math.round(y2)); ctx.stroke(); }
function ellipse(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(.5, rx), Math.max(.5, ry), 0, 0, Math.PI * 2); }
function planet() {
  const progress = clamp(game.distance / game.length, 0, 1);
  const arriving = game.state === 'arriving' || game.state === 'won' || (game.state === 'paused' && game.pausedState === 'arriving');
  const t = arriving ? game.arrivalTime / 4 : 0;
  const eased = t * t * (3 - 2 * t);
  const radius = 6 + progress ** 2 * 61 + eased * 240, cx = 120, cy = 119 + eased * 500;
  ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = ink; ellipse(0, 0, radius, radius); ctx.fill(); ctx.clip();
  ctx.fillStyle = paper;
  for (let y = Math.ceil(Math.max(-radius, -cy)); y < Math.min(radius, 400-cy); y += 2) for (let x = Math.ceil(Math.max(-radius, -cx)); x < Math.min(radius, 240-cx); x += 2) {
    const wave = Math.sin(x * .09 + y * .08 + game.level * 1.3) + Math.cos(y * .14 - x * .06);
    if (wave > .5 && x * x + y * y < radius * radius && (x + y) % 4 === 0) ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore(); ctx.strokeStyle = ink;

}
function drawFuel(r, spin) {
  const ink = accents.fuel;
  ctx.rotate(spin * .4); const w = r * .62, h = r * 1.18;
  ctx.fillStyle = ink; ctx.fillRect(-w, -h * .65, w * 2, h * 1.3); ellipse(0, -h * .65, w, h * .32); ctx.fill(); ellipse(0, h * .65, w, h * .32); ctx.fill();
  ctx.fillRect(-w * .24, -h * 1.13, w * .48, h * .3);
  ctx.fillStyle = paper; ellipse(0, -h * .64, w * .7, h * .18); ctx.fill();
  const highlight = Math.sin(spin * 2) * w * .55;
  ctx.fillRect(Math.round(highlight - 1), -h * .4, Math.max(1, r * .18), h * .95);
  ctx.strokeStyle = paper; line(-w * .7, h * .55, w * .7, h * .55);
  // Lightning stays on the turning side of the cylinder, with a dark outline.
  const face = Math.cos(spin * 2);
  if (Math.abs(face) > .2) {
    ctx.save(); ctx.translate(Math.sin(spin * 2) * w * .35, -h * .04); ctx.scale(Math.abs(face),1);
    ctx.beginPath();ctx.moveTo(r*.12,-h*.43);ctx.lineTo(-r*.27,h*.04);ctx.lineTo(-r*.02,h*.04);ctx.lineTo(-r*.15,h*.4);ctx.lineTo(r*.3,-h*.12);ctx.lineTo(r*.07,-h*.12);ctx.closePath();
    ctx.strokeStyle=paper;ctx.lineWidth=Math.max(1,r*.14);ctx.stroke();ctx.fillStyle=ink;ctx.fill();ctx.restore();
  }
}
function drawShield(r, spin) {
  r *= .82;
  const angle = spin, tilt = .35;
  const vertices = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(([x,y,z]) => {
    const xx = x*Math.cos(angle)+z*Math.sin(angle), zz = z*Math.cos(angle)-x*Math.sin(angle);
    return {x:xx*r*.8, y:(y*Math.cos(tilt)-zz*Math.sin(tilt))*r*.8, z:y*Math.sin(tilt)+zz*Math.cos(tilt)};
  });
  const faces = [[0,1,2,3],[4,7,6,5],[0,4,5,1],[3,2,6,7],[0,3,7,4],[1,5,6,2]].map((ids,i) => ({ids,i,z:ids.reduce((sum,id)=>sum+vertices[id].z,0)/4})).sort((a,b)=>a.z-b.z);
  for (const face of faces) {
    ctx.fillStyle = ['#24708c','#349ec7',accents.shield][face.i%3]; ctx.strokeStyle = accents.shield; ctx.lineWidth = Math.max(1,r*.09);
    ctx.beginPath(); face.ids.forEach((id,i)=>{const v=vertices[id];i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y);}); ctx.closePath();ctx.fill();ctx.stroke();
  }
  // Bright power core on the nearest face, carried by its rotating plane.
  const near = faces[faces.length-1].ids.map(id=>vertices[id]);
  const center = near.reduce((c,v)=>({x:c.x+v.x/4,y:c.y+v.y/4}),{x:0,y:0});
  ctx.fillStyle = ink; ctx.beginPath(); near.forEach((v,i)=>{const x=center.x+(v.x-center.x)*.4,y=center.y+(v.y-center.y)*.4;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.fill();
}
function drawMagnet(r, spin) {
  ctx.rotate(Math.sin(spin)*.45);ctx.scale(.7+Math.abs(Math.cos(spin))*.3,1);
  ctx.strokeStyle = accents.magnet;ctx.lineWidth = Math.max(2,r*.68);ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(-r*.65,-r*.8);ctx.lineTo(-r*.65,r*.35);ctx.lineTo(-r*.3,r*.75);ctx.lineTo(r*.3,r*.75);ctx.lineTo(r*.65,r*.35);ctx.lineTo(r*.65,-r*.8);ctx.stroke();
  ctx.fillStyle=ink;ctx.fillRect(-r*.9,-r,r*.5,r*.4);ctx.fillRect(r*.4,-r,r*.5,r*.4);
}
function drawShip(x, y, scale, bank, shield = false, outlined = false) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(bank); ctx.scale(scale, scale);
  if (shield) { ctx.strokeStyle = accents.shield; ctx.setLineDash([3, 2]); ellipse(0, 0, 22, 25); ctx.stroke(); ctx.setLineDash([]); }
  // Compact space hull with detached engine pods: no aerodynamic wings.
  const flame = game.boost > 0 ? 20 : 10;
  for (const jet of [-11,11]) {
    const length = flame + Math.floor(visualTime*18 + (jet>0?1:0))%3;
    ctx.beginPath();ctx.moveTo(jet-2.5,17);ctx.lineTo(jet+2.5,17);ctx.lineTo(jet,17+length);ctx.closePath();
    if(outlined){ctx.strokeStyle=paper;ctx.lineWidth=2;ctx.stroke();}
    ctx.fillStyle=accents.shield;ctx.fill();
    ctx.beginPath();ctx.moveTo(jet-1,17);ctx.lineTo(jet+1,17);ctx.lineTo(jet,17+length*.6);ctx.closePath();ctx.fillStyle=ink;ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(-4,-17);ctx.lineTo(4,-17);ctx.lineTo(7,-11);ctx.lineTo(7,10);ctx.lineTo(4,15);ctx.lineTo(-4,15);ctx.lineTo(-7,10);ctx.lineTo(-7,-11);ctx.closePath();
  ctx.moveTo(-14,-7);ctx.lineTo(-9,-7);ctx.lineTo(-8,-2);ctx.lineTo(-8,15);ctx.lineTo(-10,19);ctx.lineTo(-14,19);ctx.lineTo(-16,14);ctx.lineTo(-16,-2);ctx.closePath();
  ctx.moveTo(9,-7);ctx.lineTo(14,-7);ctx.lineTo(16,-2);ctx.lineTo(16,14);ctx.lineTo(14,19);ctx.lineTo(10,19);ctx.lineTo(8,15);ctx.lineTo(8,-2);ctx.closePath();
  if (outlined) { ctx.strokeStyle=paper;ctx.lineWidth=5;ctx.lineJoin='round';ctx.stroke(); }
  ctx.fillStyle=ink;ctx.fill();
  ctx.fillRect(-10,4,20,3);
  ctx.fillStyle='#999999';ctx.fillRect(-16,0,3,13);ctx.fillRect(13,0,3,13);ctx.fillRect(4,-9,3,18);
  ctx.fillStyle=paper;ctx.fillRect(-3,-10,6,9);ctx.fillRect(-13,-3,3,7);ctx.fillRect(10,-3,3,7);ctx.fillRect(-2,4,4,5);
  ctx.fillStyle=ink;ctx.fillRect(-1,-9,2,3);ctx.fillRect(-9,-14,2,7);ctx.fillRect(7,-14,2,7);
  ctx.restore();
}
const pixelPalette = ['#1d1d1d','#f2f2f2','#565656','#999999',...Object.values(accents),'#24708c','#349ec7'].map(hex => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)));
const neutralPalette = pixelPalette.slice(0,4);
function crispPixels() {
  // Snap every raster edge to an authored palette; no blended or blurred pixels.
  const frame = ctx.getImageData(0, 0, 240, 400), d = frame.data;
  for (let i = 0; i < d.length; i += 4) {
    let best = pixelPalette[0], distance = Infinity;
    for (const color of (d[i] === d[i+1] && d[i+1] === d[i+2] ? neutralPalette : pixelPalette)) {
      const error = (d[i]-color[0])**2 + (d[i+1]-color[1])**2 + (d[i+2]-color[2])**2;
      if (error < distance) { distance = error; best = color; }
    }
    [d[i],d[i+1],d[i+2]] = best; d[i+3] = 255;
  }
  ctx.putImageData(frame, 0, 0);
}
function clouds(t, foreground = false) {
  if (t < .16 || t > .95) return;
  const eased = t*t*(3-2*t), radius = 67 + eased*240, cy = 119 + eased*500;
  const phase = clamp((t-.16)/.79,0,1), fade = Math.sin(phase*Math.PI);
  ctx.save(); ellipse(120,cy,radius,radius);ctx.clip();
  ctx.fillStyle = foreground ? paper : '#565656';
  for (let i=0;i<(foreground?9:16);i++) {
    const r=random(i*89+(foreground?112:411));
    // Cloud banks belong to the planet, with sideways wind. No wrap or fall from space.
    const x=120+(r()-.5)*radius*1.65+Math.sin(t*1.4+i)*8;
    const y=cy-radius*.78+r()*radius*.9;
    const w=(18+r()*36)*fade, h=5+r()*10;
    for(let row=0;row<h;row+=3){
      const span=w*Math.sin((row+1)/(h+2)*Math.PI);
      for(let col=-span;col<span;col+=4){
        if(foreground && (Math.floor(col/4)+row)%3===0)continue;
        ctx.fillRect(Math.round(x+col),Math.round(y+row),3,2);
      }
    }
  }
  ctx.restore();
}
function draw(alpha) {
  ctx.fillStyle = paper; ctx.fillRect(0, 0, 240, 400); ctx.save();
  if (!reduced && trauma > 0) ctx.translate(Math.round(Math.sin(visualTime * 70) * trauma * 2), Math.round(Math.cos(visualTime * 87) * trauma * 2));
  planet(); ctx.strokeStyle = ink; ctx.fillStyle = ink;
  const arrival = game.state === 'arriving' || game.state === 'won' || (game.state === 'paused' && game.pausedState === 'arriving');
  const travel = game.distance / 100;
  for (const s of stars) {
    const x = Math.round(s.x), y = Math.round((s.y + travel * 3 * s.drift) % 400);
    ctx.fillStyle = '#565656'; ctx.fillRect(x, y, 1, 1);
  }
  if (!arrival) for (const o of sideRocks) {
    const z = .6 + ((o.z - travel) % 8 + 8) % 8;
    const x = 120 + o.side * o.spread / z, y = 125 + o.y / z, size = o.radius / z;
    if (x + size < 0 || x - size > 240 || y + size < 75 || y - size > 400) continue;
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(o.spin + game.time * .25); ctx.drawImage(sprites[o.sprite], -size, -size, size * 2, size * 2); ctx.restore();
  }
  for (const o of game.objects.slice().sort((a, b) => b.z - a.z)) {
    const z = o.previousZ + (o.z - o.previousZ) * alpha, p = projection(o.q, z), size = o.radius * 90 * p.s;
    ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y));
    if (o.type === 'rock') { ctx.rotate(o.spin); ctx.drawImage(sprites[o.sprite], -size, -size, size * 2, size * 2); }
    else {
      ctx.fillStyle = paper; ctx.strokeStyle = accents[o.type]; ctx.lineWidth = Math.max(1, 2 * p.s); const r = Math.max(2, size);
      if (o.type === 'crystal') {
        ctx.fillStyle = accents.crystal; ctx.strokeStyle = paper;
        ctx.beginPath(); ctx.moveTo(0, -r * 1.25); ctx.lineTo(r * .95, 0); ctx.lineTo(0, r * 1.25); ctx.lineTo(-r * .95, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); line(0, -r * 1.25, 0, r * 1.25); line(-r * .95, 0, r * .95, 0);
      } else if (o.type === 'fuel') drawFuel(r, o.spin);
      else if (o.type === 'shield') drawShield(r, o.spin);
      else if (o.type === 'magnet') drawMagnet(r, o.spin);
    }
    ctx.restore();
  }
  if (arrival) {
    const t = clamp(game.arrivalTime / 4, 0, 1), eased = t * t * (3 - 2 * t);
    const start = projection(game.q, game.depth);
    clouds(t);
    drawShip(start.x * (1 - eased) + 120 * eased, start.y * (1 - eased) + 225 * eased, start.s * (1 - eased) + .85 * eased, Math.sin(t * Math.PI * 2) * .14, false, true);
    clouds(t, true);
  } else {
    const q = game.previousQ + (game.q - game.previousQ) * alpha, depth = game.previousDepth + (game.depth - game.previousDepth) * alpha, p = projection(q, depth);
    if (!(game.invulnerable > 0 && Math.floor(game.time * 12) % 2)) drawShip(p.x, p.y, p.s, clamp(game.velocity * .09, -.38, .38), game.shield > 0);
  }
  for (const p of particles) { ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); }
  ctx.restore(); crispPixels();
  $('score').textContent = String(game.score).padStart(5, '0'); $('sector').textContent = PLANETS[game.level - 1].toUpperCase();
  $('health').textContent = `КОРПУС ${game.hp} / 2`; $('minerals').textContent = `КРИСТАЛЛЫ ${game.crystals}${game.boost > 0 ? ' · ×2' : ''}`;
  $('speed').textContent = game.boost > 0 ? '1.5×' : '1.0×';
  $('power').textContent = arrival ? (game.arrivalTime < 3.5 ? 'ПРОЛЁТ НАД ПЛАНЕТОЙ' : 'ОРБИТА ДОСТИГНУТА') : game.shield > 0 ? `ЩИТ ${game.shield.toFixed(1)}с · ТАРАНЬ` : game.boost > 0 ? `РАЗГОН ${game.boost.toFixed(1)}с · ×2 ОЧКИ` : game.magnet > 0 ? `МАГНИТ ${game.magnet.toFixed(1)}с` : 'КУРС НА ПЛАНЕТУ';
  $('power').style.color = !arrival && game.shield > 0 ? accents.shield : !arrival && game.boost > 0 ? accents.fuel : !arrival && game.magnet > 0 ? accents.magnet : ink;
  $('zone').textContent = arrival ? `ПЛАНЕТА ${PLANETS[game.level - 1].toUpperCase()}` : zones[game.zone] + (game.magnet > 0 && (game.shield > 0 || game.boost > 0) ? ` · МАГНИТ ${game.magnet.toFixed(1)}с` : '');
  $('progress').style.width = `${clamp(game.distance / game.length * 100, 0, 100)}%`;
}
function frame(now) {
  const dt = Math.min((now - last) / 1000 || 0, .1); last = now;
  const running = game.state === 'playing' || game.state === 'arriving';
  if (running || game.state === 'ready') visualTime += dt;
  if (running) {
    accumulator += dt;
    while (accumulator >= 1 / 60) {
      if (game.state === 'playing' && keys.size) {
        const horizontal = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
        const vertical = (keys.has('ArrowUp') || keys.has('w') ? 1 : 0) - (keys.has('ArrowDown') || keys.has('s') ? 1 : 0);
        game.target = clamp(game.target + horizontal * 2.8 / 60, -1, 1);
        game.targetDepth = clamp(game.targetDepth + vertical * .45 / 60, .9, 1.15);
      }
      game.step(1 / 60); events(); accumulator -= 1 / 60;
    }
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    particles = particles.filter(p => p.life > 0); messageTimer -= dt;
    if (messageTimer <= 0) $('effect').textContent = ''; trauma = Math.max(0, trauma - dt * 3);
  } else accumulator = 0;
  draw(running ? accumulator * 60 : 1); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
