import type { ServiceOffer as Offer, StatKey } from '@mmo/schemas';
import { craftDuration } from '@mmo/game-data';
import { STAT_LABELS } from '@mmo/ui';
import { serviceStatus } from '../state/service-state';
import { useGame } from './context';

/** Catalog recipe cards explain unlocks, carried costs and the result before committing materials. */
export function ServiceOffer({ offer: o }: { offer: Offer }) {
  const { state, quests, gameData } = useGame();
  const status = serviceStatus(state, o);
  const output = o.output ? gameData.template(o.output.itemTemplateId) : null;
  const gear = output?.equipment;
  const rarity = output ? gameData.rarities.get(output.rarityId) : null;
  const scaled = (n: number) => Math.round(n * (rarity?.statMultiplier ?? 1));
  const required = o.requiresQuestId ? gameData.quest(o.requiresQuestId) : null;
  return (
    <section className="dialogue-quest service-offer" data-offer={o.id}>
      <strong>{o.name}</strong>
      {required && (
        <p className="small" data-testid="service-unlock">
          {status.questLocked ? 'Unlock: complete ' : 'Unlocked by '}
          {required.name}
        </p>
      )}
      {output && (
        <p className="small">
          {o.output!.quantity > 1 ? `${o.output!.quantity} × ` : ''}
          {output.name}
          {gear &&
            ` · Level ${output.requiredLevel} · ${output.allowedClassIds.length ? output.allowedClassIds.map((id) => gameData.characterClass(id).name).join(' / ') : 'All classes'}`}
        </p>
      )}
      {gear && (
        <p className="small service-preview" data-testid="service-output">
          {gear.weapon &&
            `${gear.weapon.minDamage}–${gear.weapon.maxDamage} weapon damage · ${(gear.weapon.attackSpeedMs / 1000).toFixed(1)}s · `}
          {Object.entries(gear.baseStats)
            .map(
              ([id, r]) =>
                `${STAT_LABELS[id as StatKey] ?? id} +${scaled(r.min)}${r.max === r.min ? '' : `–${scaled(r.max)}`}`,
            )
            .join(' · ')}
          {gear.maxDurability && ` · ${gear.maxDurability} condition`}
          {rarity && rarity.modifierCount.max > 0 && ` · Bonus attributes roll on creation`}
        </p>
      )}
      {status.materials.length > 0 && (
        <ul className="service-materials small">
          {status.materials.map((i) => (
            <li key={i.itemTemplateId} className={i.owned < i.quantity ? 'missing' : ''}>
              {gameData.template(i.itemTemplateId).name}{' '}
              <span>
                {i.owned} / {i.quantity} carried
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="small">
        {o.copper < 0
          ? `${-o.copper} copper · ${status.copper} carried`
          : o.copper > 0
            ? `Receive ${o.copper} copper`
            : 'No copper cost'}
        {craftDuration(o) ? ` · ${craftDuration(o) / 1000}s · Fieldcraft +20 XP` : ''}
      </p>
      <button
        data-service={o.id}
        disabled={status.reason !== null}
        title={status.reason ?? undefined}
        onClick={() => quests.service(o.id)}
      >
        {status.reason ?? (o.kind === 'buy' ? 'Buy' : o.kind === 'sell' ? 'Sell one' : 'Craft')}
      </button>
      {o.kind === 'craft' && (
        <p className="small muted">
          Collect in Skills when ready. Materials stay reserved if you leave.
        </p>
      )}
    </section>
  );
}
