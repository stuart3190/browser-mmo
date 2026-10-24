import { describe, expect, it } from 'vitest';
import { mapProject, mapClusters } from './atlas-map';
describe('north-up atlas', () => {
  it('preserves equal scale in both axes and keeps north above the player', () => {
    const centre = { x: 256, z: 4000 };
    expect(mapProject(centre, centre, 520)).toEqual({ x: 260, y: 160 });
    expect(mapProject({ x: 266, z: 4010 }, centre, 520)).toEqual({ x: 270, y: 150 });
  });
  it('groups nearby pins at touch size and separates them on zoom', () => {
    const places = [
      { id: 'port', position: { x: 0, z: 0 } },
      { id: 'well', position: { x: 40, z: 0 } },
    ];
    expect(mapClusters(places, { x: 0, z: 0 }, 360, 280)).toHaveLength(1);
    expect(mapClusters(places, { x: 0, z: 0 }, 180, 280)).toHaveLength(2);
  });
  it('keeps off-map places out of the interactive chart', () => {
    const places = [
      { id: 'far', position: { x: 1000, z: 0 } },
      { id: 'edge', position: { x: 175, z: 0 } },
      { id: 'near', position: { x: 0, z: 0 } },
    ];
    expect(
      mapClusters(places, { x: 0, z: 0 }, 360, 320).flatMap((c) => c.places.map((p) => p.id)),
    ).toEqual(['near']);
  });
});
