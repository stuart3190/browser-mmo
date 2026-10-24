import { useEffect, useRef, useState } from 'react';
import type { WorldCatalog } from '@mmo/schemas';
import { MAP_HEIGHT, MAP_WIDTH, mapClusters, mapProject } from '../state/atlas-map';
import type { MapPoint } from '../state/atlas-map';
import { starterRoads } from '../game/starter-roads';
import { useGame } from './context';

type Place = WorldCatalog['locations'][number];
/** A chart of authored places, never an enemy radar or a travel command. */
export function AtlasMap({
  places,
  initialZone,
  guide,
}: {
  places: Place[];
  initialZone: string;
  guide: (id: string) => void;
}) {
  const { gameData, controls, state } = useGame();
  const [zoneId, setZone] = useState(initialZone);
  const origin = (zone: string): MapPoint => {
    const me = controls.zoneId() === zone ? controls.position() : null;
    return (
      me ??
      places.find((p) => p.zoneId === zone && p.kind === 'port')?.position ??
      places.find((p) => p.zoneId === zone)?.position ?? { x: 0, z: 0 }
    );
  };
  const [centre, setCentre] = useState(() => origin(initialZone));
  const [span, setSpan] = useState(360);
  const [selected, setSelected] = useState<string[]>([]);
  const selection = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected.length)
      selection.current?.querySelector('button')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);
  const surface = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const zones = [...new Set(places.map((p) => p.zoneId))];
  const local = places.filter((p) => p.zoneId === zoneId);
  const clusters = mapClusters(local, centre, span, width);
  const point = (p: MapPoint) => mapProject(p, centre, span);
  const me = controls.zoneId() === zoneId ? controls.position() : null;
  const player = me ? point(me) : null;
  const visiblePlayer =
    player &&
    player.x >= 8 &&
    player.x <= MAP_WIDTH - 8 &&
    player.y >= 8 &&
    player.y <= MAP_HEIGHT - 8;
  const roads =
    zoneId === 'zone.greenvale.meadows'
      ? starterRoads.map(([ax, az, bx, bz]) => [
          { x: ax, z: az },
          { x: bx, z: bz },
        ])
      : gameData.raw.worldCatalog!.roads.filter((r) => r.zoneId === zoneId).map((r) => r.points);
  const shift = (x: number, z: number) => {
    setCentre((c) => ({ x: c.x + (x * span) / 3, z: c.z + (z * span) / 3 }));
    setSelected([]);
  };
  return (
    <section className="atlas-chart" aria-label="Regional map">
      {zones.length > 1 && (
        <label>
          Map area{' '}
          <select
            aria-label="Map area"
            value={zoneId}
            onChange={(e) => {
              setZone(e.target.value);
              setCentre(origin(e.target.value));
              setSelected([]);
            }}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {gameData.zone(z).name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="atlas-chart-toolbar">
        <strong>{gameData.zone(zoneId).name}</strong>
        <button
          aria-label="Zoom map in"
          disabled={span <= 90}
          onClick={() => {
            setSpan((s) => s / 2);
            setSelected([]);
          }}
        >
          +
        </button>
        <button
          aria-label="Zoom map out"
          disabled={span >= 11520}
          onClick={() => {
            setSpan((s) => s * 2);
            setSelected([]);
          }}
        >
          −
        </button>
        <button
          onClick={() => {
            setCentre(origin(zoneId));
            setSpan(360);
            setSelected([]);
          }}
        >
          Recenter
        </button>
      </div>
      <div className="atlas-chart-surface" ref={surface} data-map-zone={zoneId}>
        <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} aria-hidden="true">
          <defs>
            <pattern id="atlas-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 H 0 V 40" fill="none" stroke="#c9b379" strokeOpacity=".09" />
            </pattern>
          </defs>
          <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#atlas-grid)" />
          {roads.map((road, i) => (
            <polyline
              key={i}
              points={road
                .map((p) => {
                  const q = point(p);
                  return `${q.x},${q.y}`;
                })
                .join(' ')}
              fill="none"
              stroke="#a79768"
              strokeWidth="3"
              strokeOpacity=".65"
            />
          ))}
        </svg>
        <span className="atlas-north" aria-hidden="true">
          N ↑
        </span>
        {clusters.map((cluster, i) => (
          <button
            key={cluster.places[0]!.id}
            className="atlas-pin"
            style={{
              left: `${(cluster.x / MAP_WIDTH) * 100}%`,
              top: `${(cluster.y / MAP_HEIGHT) * 100}%`,
            }}
            data-map-place={cluster.places.map((p) => p.id).join(' ')}
            aria-label={`Map: ${cluster.places.map((p) => p.name).join(', ')}`}
            aria-pressed={cluster.places.some((p) => selected.includes(p.id))}
            onClick={() => setSelected(cluster.places.map((p) => p.id))}
          >
            <span>
              {i + 1}
              {cluster.places.length > 1 ? '+' : ''}
            </span>
          </button>
        ))}
        {visiblePlayer && (
          <span
            className="atlas-player"
            data-testid="atlas-player"
            aria-label="Your position"
            style={{
              left: `${(player.x / MAP_WIDTH) * 100}%`,
              top: `${(player.y / MAP_HEIGHT) * 100}%`,
            }}
          />
        )}
        <span className="atlas-scale">{Math.round(span / 4)} m</span>
      </div>
      <div className="atlas-pan" aria-label="Move map">
        <button aria-label="Move map west" onClick={() => shift(-1, 0)}>
          ←
        </button>
        <button aria-label="Move map north" onClick={() => shift(0, 1)}>
          ↑
        </button>
        <button aria-label="Move map south" onClick={() => shift(0, -1)}>
          ↓
        </button>
        <button aria-label="Move map east" onClick={() => shift(1, 0)}>
          →
        </button>
        <small>North up · pale blue: you</small>
      </div>
      <div ref={selection} aria-live="polite">
        {local
          .filter((p) => selected.includes(p.id))
          .map((p) => (
            <div key={p.id} className="atlas-place-detail">
              <span>
                <strong>{p.name}</strong>
                <small>
                  {state.discoveries.includes(p.id) ? 'Discovered' : 'Unvisited'} ·{' '}
                  {p.kind.replace('_', ' ')}
                </small>
              </span>
              <button data-map-guide={p.id} onClick={() => guide(p.id)}>
                Guide here
              </button>
            </div>
          ))}
      </div>
      <p className="small">
        Select a numbered place for directions. A + groups nearby places; zoom in to separate them.
        Roads are bearings, not guaranteed clear paths.
      </p>
    </section>
  );
}
