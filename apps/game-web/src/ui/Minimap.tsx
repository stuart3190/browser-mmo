import { useEffect, useRef, useState } from 'react';
import { useGame } from './context';
import { questBearing, questDestination } from '../state/quest-navigation';
import { starterRoads } from '../game/starter-roads';

/** Metres from the player to the minimap edge. */
const RANGE = 60;
const COLORS: Record<string, string> = {
  enemy: '#e0544a',
  npc: '#f2d16b',
  pickup: '#5fd3e8',
  player: '#5fe07a',
};

/**
 * North-up minimap centred on the player: safe zones, landmarks and the entities the server has
 * replicated to us (so it reveals nothing the client was not already sent). Drawn on a canvas at
 * ~10 Hz, independent of React renders.
 */
export function Minimap() {
  const { controls, gameData, state } = useGame();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState<string | null>(null);

  const [guide, setGuide] = useState<{
    name: string;
    label: string;
    detail: string;
    radians: number | null;
  } | null>(null);

  useEffect(() => {
    const draw = () => {
      const c = canvas.current;
      const zoneId = controls.zoneId();
      const me = controls.position();
      if (!c || !zoneId || !me) return;
      const zone = gameData.zone(zoneId);
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const size = c.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(size * dpr)) {
        c.width = Math.round(size * dpr);
        c.height = Math.round(size * dpr);
      }
      const half = size / 2;
      const k = half / RANGE;
      const sx = (x: number) => half + (x - me.x) * k;
      const sy = (z: number) => half - (z - me.z) * k;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(half, half, half - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(18, 26, 18, 0.85)';
      ctx.fillRect(0, 0, size, size);
      // zone edge
      const b = zone.bounds;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.strokeRect(
        sx(b.minCx * zone.chunkSize),
        sy((b.maxCz + 1) * zone.chunkSize),
        (b.maxCx - b.minCx + 1) * zone.chunkSize * k,
        (b.maxCz - b.minCz + 1) * zone.chunkSize * k,
      );
      for (const sz of zone.safeZones) {
        ctx.strokeStyle = 'rgba(201, 180, 106, 0.8)';
        ctx.beginPath();
        ctx.arc(sx(sz.center.x), sy(sz.center.z), sz.radius * k, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = '#a99972';
      for (const [ax, az, bx, bz, width] of starterRoads) {
        ctx.lineWidth = Math.max(1, width * k);
        ctx.beginPath();
        ctx.moveTo(sx(ax), sy(az));
        ctx.lineTo(sx(bx), sy(bz));
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (const l of zone.landmarks) {
        const x = sx(l.position.x);
        const y = sy(l.position.z);
        ctx.fillStyle = '#d9c27a';
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x + 4, y);
        ctx.lineTo(x, y + 4);
        ctx.lineTo(x - 4, y);
        ctx.fill();
        // Nearest landmark is named below the map; avoid clipped/overlapping in-map labels.
      }
      for (const m of controls.markers()) {
        ctx.fillStyle = m.dead ? '#777' : (COLORS[m.kind] ?? '#fff');
        ctx.beginPath();
        ctx.arc(sx(m.x), sy(m.z), m.kind === 'enemy' ? 3 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      const destination = questDestination(
        gameData,
        state.quests,
        state.trackedQuestId,
        zoneId,
        me,
        controls.markers().map((m) => ({ ...m, refId: state.world.get(m.id)?.refId })),
      );
      const bearing =
        destination?.position && destination.zoneId === zoneId
          ? questBearing(me, destination.position)
          : null;
      const next = destination
        ? {
            name: destination.questName,
            label: destination.label,
            detail: bearing
              ? `${bearing.compass} · ${bearing.distance} m`
              : destination.zoneId
                ? gameData.zone(destination.zoneId).name
                : 'See quest log',
            radians: bearing?.radians ?? null,
          }
        : null;
      setGuide((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      if (bearing) {
        const radius = Math.min(half - 9, bearing.distance * k);
        const x = half + Math.sin(bearing.radians) * radius,
          y = half - Math.cos(bearing.radians) * radius;
        ctx.fillStyle = '#ffe39a';
        ctx.strokeStyle = '#342815';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x + 5, y);
        ctx.lineTo(x, y + 6);
        ctx.lineTo(x - 5, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // me: heading arrow (rotationY 0 = +z = up)
      const hx = Math.sin(me.rotationY);
      const hy = -Math.cos(me.rotationY);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(half + hx * 7, half + hy * 7);
      ctx.lineTo(half - hx * 4 + hy * 4, half - hy * 4 - hx * 4);
      ctx.lineTo(half - hx * 4 - hy * 4, half - hy * 4 + hx * 4);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(half, half, half - 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('N', half, 10);

      let best: { name: string; d: number } | null = null;
      for (const l of zone.landmarks) {
        const d = Math.hypot(l.position.x - me.x, l.position.z - me.z);
        if (d < 45 && (!best || d < best.d)) best = { name: l.name, d };
      }
      setNear(best?.name ?? zone.name);
    };
    const t = setInterval(draw, 100);
    return () => clearInterval(t);
  }, [controls, gameData, state]);

  return (
    <>
      {guide && (
        <button
          className="quest-guide"
          data-testid="quest-guide"
          title={`${guide.name}: ${guide.label} (${guide.detail})`}
          onClick={() => state.toggle('quests')}
          aria-label={`Quest guidance: ${guide.name}. ${guide.label}. ${guide.detail}. Open quest log`}
        >
          <span
            className="guide-arrow"
            aria-hidden="true"
            style={{ transform: `rotate(${guide.radians ?? 0}rad)` }}
          >
            {guide.radians === null ? '◇' : '↑'}
          </span>
          <span className="guide-copy">
            <strong>{guide.name}</strong>
            <span>{guide.label}</span>
          </span>
          <span className="guide-distance" data-testid="quest-distance">
            {guide.detail}
          </span>
        </button>
      )}
      <div className="minimap" data-testid="minimap">
        <canvas ref={canvas} aria-label="Minimap" />
        <div className="minimap-label" data-testid="minimap-area">
          {near}
        </div>
      </div>
    </>
  );
}
