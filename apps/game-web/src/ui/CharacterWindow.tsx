import { STAT_LABELS, STAT_ORDER } from '@mmo/ui';
import { useGame } from './context';
import { ItemSlot } from './ItemSlot';
import { Window } from './Window';

const LEFT = ['head', 'necklace', 'shoulders', 'cloak', 'chest', 'hands'];
const RIGHT = ['waist', 'legs', 'feet', 'ring_1', 'ring_2', 'trinket_1', 'trinket_2'];
const BOTTOM = ['main_hand', 'off_hand', 'ranged'];

/** Equipment paper-doll (slot list from game data) + authoritative effective stats. */
export function CharacterWindow() {
  const { state, gameData } = useGame();
  const equipped = state.items.equipped();
  const known = new Set([...LEFT, ...RIGHT, ...BOTTOM]);
  // Slots added to game data later still show up (appended to the right column).
  const extra = gameData.raw.equipmentSlots.map((s) => s.id).filter((id) => !known.has(id));
  const slot = (id: string) => (
    <div key={id} className="equip-slot">
      <ItemSlot
        item={equipped.get(id) ?? null}
        label={gameData.equipmentSlots.get(id)?.name ?? id}
        testId={`equip-${id}`}
      />
      <span className="equip-name">
        {equipped.get(id)?.template.name ?? gameData.equipmentSlots.get(id)?.name}
      </span>
    </div>
  );
  const cls = gameData.characterClass(state.character.classId);
  return (
    <Window
      id="character"
      title={`${state.character.name} — level ${state.character.level} ${cls.name}`}
    >
      <div className="paperdoll">
        <div className="equip-col">{LEFT.map(slot)}</div>
        <div className="equip-col">{[...RIGHT, ...extra].map(slot)}</div>
      </div>
      <div className="equip-row">{BOTTOM.map(slot)}</div>
      <StatsTable />
    </Window>
  );
}

function StatsTable() {
  const { state } = useGame();
  const stats = state.stats;
  if (!stats) return <p className="muted">Loading stats…</p>;
  const prev = state.previousStats?.total ?? {};
  return (
    <table className="stats" data-testid="stats">
      <tbody>
        {STAT_ORDER.filter((k) => stats.total[k] !== undefined).map((k) => {
          const total = stats.total[k]!;
          const gear = stats.fromEquipment[k] ?? 0;
          const before = prev[k];
          const changed = state.previousStats !== null && before !== total;
          return (
            <tr
              key={k}
              data-stat={k}
              data-value={total}
              className={changed ? (total > (before ?? 0) ? 'stat-up' : 'stat-down') : ''}
            >
              <th>{STAT_LABELS[k]}</th>
              <td>{Math.round(total * 10) / 10}</td>
              <td className="muted">{gear ? `(${gear > 0 ? '+' : ''}${gear} gear)` : ''}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
