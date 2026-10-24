/* eslint-disable */
const { walk } = require('./vertical-slice.cjs');
// Respond to the same replicated ground warning the renderer displays; only keyboard movement.
async function leaveGroundWarning(page, cue, collision) {
  if (!cue?.groundPosition) return false;
  const position = await page.evaluate(() => window.__mmo.position);
  const center = cue.groundPosition;
  if (Math.hypot(position.x - center.x, position.z - center.z) > cue.range + 0.5) return false;
  const radius = cue.range + 2;
  const angle = Math.atan2(position.z - center.z, position.x - center.x);
  const candidates = Array.from({ length: 8 }, (_, i) => ({
    x: center.x + Math.cos(angle + (i * Math.PI) / 4) * radius,
    z: center.z + Math.sin(angle + (i * Math.PI) / 4) * radius,
  })).filter((destination) => !collision.sweepBlocked(position, destination, 0.8));
  candidates.sort(
    (a, b) =>
      Math.hypot(a.x - position.x, a.z - position.z) -
      Math.hypot(b.x - position.x, b.z - position.z),
  );
  if (!candidates.length) throw Error('No clear player route out of the ground warning');
  console.log('DODGE', JSON.stringify({ center, range: cue.range, to: candidates[0] }));
  await walk(page, candidates[0].x, candidates[0].z, 1.5, 6000);
  return true;
}
// Flank an amber sector or leave a blue circle, preferring the arena over endless outward kiting.
async function leaveAttackWarning(page, cue, collision, arena) {
  if (!cue?.groundPosition) return false;
  const p = await page.evaluate(() => window.__mmo.position),
    c = cue.groundPosition;
  const inside = (v, slack = 0) => {
    if (Math.hypot(v.x - c.x, v.z - c.z) > cue.range + slack) return false;
    if (!cue.cleave) return true;
    const a = Math.atan2(v.x - c.x, v.z - c.z) - cue.cleave.heading;
    return (
      Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) <=
      cue.cleave.arc / 2 + slack / Math.max(1, cue.range)
    );
  };
  if (!inside(p, 0.4)) return false;
  const candidates = [];
  for (const radius of cue.cleave ? [3, 5, cue.range + 2] : [cue.range + 2])
    for (let n = 0; n < 16; n++) {
      const a = (n * Math.PI) / 8,
        v = { x: c.x + Math.sin(a) * radius, z: c.z + Math.cos(a) * radius };
      if (!inside(v, 1.5) && !collision.sweepBlocked(p, v, 0.8)) candidates.push(v);
    }
  const score = (v) =>
    Math.hypot(v.x - p.x, v.z - p.z) + 0.3 * Math.hypot(v.x - arena.x, v.z - arena.z);
  candidates.sort((a, b) => score(a) - score(b));
  if (!candidates.length) throw Error('No clear player escape route');
  await walk(page, candidates[0].x, candidates[0].z, 1.2, 6000);
  return true;
}
module.exports = { leaveGroundWarning, leaveAttackWarning };
