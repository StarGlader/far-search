export const MEDAL_TARGETS = [25, 40, 55];
export function normalizeCareer(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const unlocked = Math.max(1, Math.min(3, Math.floor(Number(source.unlocked) || 1)));
  return {unlocked, selected:Math.max(1,Math.min(unlocked,Math.floor(Number(source.selected)||1))),
    medals:Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>source.medals?.[i]?.[j] === true))};
}
export function awardFlight(career, flight) {
  const next = normalizeCareer(career);
  if (flight.state !== 'won') return next;
  const level = Math.max(1, Math.min(3, flight.level));
  const awards = [true, flight.crystals >= MEDAL_TARGETS[level-1], flight.hp === 2];
  next.medals[level-1] = awards.map((earned,i)=>earned || next.medals[level-1][i]);
  next.unlocked = Math.max(next.unlocked, Math.min(3,level+1));
  next.selected = Math.min(3,level+1);
  return next;
}
