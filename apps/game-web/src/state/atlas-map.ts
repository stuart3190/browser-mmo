/** North-up map projection. Coordinates always belong to one simulation zone. */
export const MAP_WIDTH = 520;
export const MAP_HEIGHT = 320;
export type MapPoint = { x: number; z: number };
export function mapProject(point: MapPoint, centre: MapPoint, span: number) {
  const scale = MAP_WIDTH / span;
  return {
    x: MAP_WIDTH / 2 + (point.x - centre.x) * scale,
    y: MAP_HEIGHT / 2 - (point.z - centre.z) * scale,
  };
}
export function mapClusters<T extends { id: string; position: MapPoint }>(
  locations: T[],
  centre: MapPoint,
  span: number,
  width: number,
) {
  const spacing = (46 * MAP_WIDTH) / Math.max(240, width);
  const clusters: { x: number; y: number; places: T[] }[] = [];
  for (const place of locations) {
    const p = mapProject(place.position, centre, span);
    // Leave a full touch-target margin; off-map places remain in the atlas list.
    const margin = spacing / 2;
    if (p.x < margin || p.x > MAP_WIDTH - margin || p.y < margin || p.y > MAP_HEIGHT - margin)
      continue;
    const group = clusters.find((c) => Math.hypot(c.x - p.x, c.y - p.y) < spacing);
    if (group) group.places.push(place);
    else clusters.push({ ...p, places: [place] });
  }
  return clusters;
}
