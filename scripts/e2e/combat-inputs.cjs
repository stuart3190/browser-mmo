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
module.exports = { leaveGroundWarning };
