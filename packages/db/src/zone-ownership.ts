import type pg from 'pg';
import type { Database } from './client';
import { poolFor } from './client';

export interface CheckpointWrite {
  zoneId: string;
  payload: string;
  characters: {
    id: string;
    x: number;
    y: number;
    z: number;
    rotation: number;
    health: number;
    cooldowns: Record<string, number>;
  }[];
}

/** The same pinned PostgreSQL session owns the zones AND commits their recovery images.
 * Never reconnect this session: losing it fences this host until a fresh process recovers.
 */
export class ZoneOwnership {
  private client: pg.PoolClient | undefined;
  active = false;
  constructor(
    private readonly db: Database,
    private readonly lost: (error: unknown) => void,
  ) {}
  async acquire(zoneIds: string[]): Promise<Map<string, string>> {
    if (!zoneIds.length || new Set(zoneIds).size !== zoneIds.length)
      throw new Error('Invalid zone assignment');
    const client = await poolFor(this.db).connect();
    this.client = client;
    client.on('error', this.onLost);
    client.on('end', this.onLost);
    try {
      await client.query("set application_name = 'mmo-zone-owner'");
      await client.query("set statement_timeout = '3s'");
      await client.query("set lock_timeout = '2s'");
      await client.query('set synchronous_commit = on');
      const migration = await client.query<{ allowed: boolean }>(
        'select pg_try_advisory_lock_shared(717724, 1) as allowed',
      );
      if (!migration.rows[0]?.allowed)
        throw new Error('Migration in progress; zone startup refused');
      for (const id of [...zoneIds].sort()) {
        const result = await client.query<{ owned: boolean }>(
          'select pg_try_advisory_lock(717723, hashtext($1)) as owned',
          [id],
        );
        if (!result.rows[0]?.owned) throw new Error(`Zone already owned: ${id}`);
      }
      const rows = await client.query<{ zone_id: string; version: number; payload: string }>(
        'select zone_id, version, payload from zone_checkpoints where zone_id = any($1::text[])',
        [zoneIds],
      );
      if (rows.rows.some((r) => r.version !== 1)) throw new Error('Unsupported checkpoint version');
      await client.query('select pg_advisory_unlock_shared(717724, 1)');
      this.active = true;
      return new Map(rows.rows.map((r) => [r.zone_id, r.payload]));
    } catch (err) {
      await this.close();
      throw err;
    }
  }
  private onLost = (err?: unknown) => {
    if (!this.active) return;
    this.active = false;
    this.lost(err ?? new Error('Zone ownership connection ended'));
  };
  async commit(writes: CheckpointWrite[]): Promise<void> {
    const client = this.client;
    if (!this.active || !client) throw new Error('Zone ownership lost');
    try {
      // A data-modifying CTE is one atomic, WAL-flushed statement: no inter-query RTTs.
      await client.query(
        `with input as (
        select * from jsonb_to_recordset($1::jsonb) as w("zoneId" text, payload text, characters jsonb)
      ), saved as (
        insert into zone_checkpoints(zone_id,version,payload,updated_at)
        select "zoneId",1,payload,now() from input
        on conflict(zone_id) do update set payload=excluded.payload,version=1,updated_at=now()
        returning zone_id
      ), states as (
        select s.*,w."zoneId" as zone_id from input w cross join lateral jsonb_to_recordset(w.characters)
        as s(id uuid,x double precision,y double precision,z double precision,
             rotation double precision,health integer,cooldowns jsonb)
      ) update characters c set zone_id=s.zone_id,pos_x=s.x,pos_y=s.y,pos_z=s.z,rotation_y=s.rotation,
        current_health=s.health,ability_cooldowns=s.cooldowns,updated_at=now()
        from states s where c.id=s.id and (c.zone_id,c.pos_x,c.pos_y,c.pos_z,c.rotation_y,c.current_health,c.ability_cooldowns)
        is distinct from (s.zone_id,s.x,s.y,s.z,s.rotation,s.health,s.cooldowns)`,
        [JSON.stringify(writes)],
      );
      if (!this.active) throw new Error('Ownership lost during commit');
    } catch (err) {
      this.onLost(err); // Ambiguous writes are recovered by a new host, never published here.
      throw err;
    }
  }
  async close(): Promise<void> {
    this.active = false;
    const client = this.client;
    this.client = undefined;
    if (!client) return;
    // Keep the inactive error listener until destruction, including shutdown query failures.
    // Confirm release before allowing an immediate supervised replacement to start.
    // If the session is broken, destroying it leaves PostgreSQL to release its locks.
    try {
      await client.query('select pg_advisory_unlock_all()');
    } catch {
      /* already fenced */
    }
    // Never return an ownership session to the application pool.
    client.release(true);
  }
}
