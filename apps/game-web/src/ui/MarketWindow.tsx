import { useEffect, useRef, useState } from 'react';
import { isCurrentlyTradeable, listingFee, saleFee } from '@mmo/game-data';
import type { Item, MarketplaceListing } from '@mmo/schemas';
import { formatCurrency } from '@mmo/ui';
import { useGame } from './context';
import { Window, Tabs } from './Window';
import { Wallet } from './InventoryWindow';
import { ItemTooltip } from './ItemTooltip';

type Tab = 'browse' | 'sell' | 'mine';
type Offer = { listing: MarketplaceListing; item: Item };

export function MarketWindow() {
  const { state } = useGame();
  return (
    <Window id="market" title="Marketplace">
      {state.open.has('market') && <MarketContents />}
    </Window>
  );
}

function MarketContents() {
  const { state, api, gameData } = useGame();
  const [tab, setTab] = useState<Tab>('browse');
  const [filter, setFilter] = useState('');
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const running = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const rules = gameData.raw.marketplaceRules;
  const currency = gameData.currencies.get(rules.currencyId)!;
  const money = (amount: number) => formatCurrency(currency, amount);
  const refresh = () => setReload((n) => n + 1);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const request = ++generation.current;
    setOffer(null);
    setListings([]);
    setHasMore(false);
    setError('');
    if (tab === 'sell') {
      setBusy(false);
      return;
    }
    setBusy(true);
    const work = tab === 'mine' ? api.myListings() : api.marketListings(filter);
    void work
      .then(({ listings: rows }) => {
        if (mounted.current && request === generation.current) {
          setListings(tab === 'mine' ? rows : rows.slice(0, 50));
          setHasMore(tab === 'browse' && rows.length > 50);
          setError('');
        }
      })
      .catch((e) => {
        if (mounted.current && request === generation.current) setError(e.message);
      })
      .finally(() => {
        if (mounted.current && request === generation.current) setBusy(false);
      });
  }, [api, tab, filter, reload]);
  async function run(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'Marketplace request failed');
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function more() {
    const last = listings.at(-1);
    if (!last) return;
    const request = generation.current;
    await run(async () => {
      const result = await api.marketListings(filter, last);
      if (!mounted.current || request !== generation.current) return;
      setListings((old) => [...old, ...result.listings.slice(0, 50)]);
      setHasMore(result.listings.length > 50);
    });
  }
  return (
    <>
      <p className="small muted">
        Trade with adventurers across the world. Prices cover the whole stack; listed items leave
        your bags until sold or returned.
      </p>
      <Wallet />
      <Tabs
        value={tab}
        options={[
          { id: 'browse', label: 'Browse' },
          { id: 'sell', label: 'Sell an item' },
          { id: 'mine', label: 'My listings' },
        ]}
        onChange={(value) => {
          if (!running.current) {
            setTab(value);
            setNotice('');
          }
        }}
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="market-notice">
          {notice}
        </p>
      )}
      {tab === 'sell' ? (
        <SellForm
          busy={busy}
          onSell={async (item, price, durationHours) =>
            run(async () => {
              await api.createListing({
                characterId: state.character.id,
                itemInstanceId: item.instance.id,
                expectedVersion: item.instance.version,
                price,
                durationHours,
              });
              if (!mounted.current) return;
              setNotice('Listing created. Your item is now on the marketplace.');
              setTab('mine');
              refresh();
            })
          }
        />
      ) : (
        <>
          <div className="market-tools">
            {tab === 'browse' && (
              <select
                aria-label="Filter marketplace items"
                value={filter}
                disabled={running.current}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">All items</option>
                {[...gameData.itemTemplates.values()]
                  .filter((t) => t.marketplaceAllowed)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            )}
            <button disabled={busy} onClick={refresh}>
              Refresh listings
            </button>
          </div>
          {busy && <p role="status">Updating marketplace…</p>}
          {!busy && !listings.length && (
            <p>
              {tab === 'mine' ? 'You have no listings yet.' : 'No matching items are for sale.'}
            </p>
          )}
          {offer ? (
            <section className="market-review" aria-label="Review purchase">
              <button onClick={() => setOffer(null)} disabled={busy}>
                Back to listings
              </button>
              <ItemTooltip item={offer.item} />
              <p>
                Total price: <strong>{money(offer.listing.price)}</strong> for{' '}
                {offer.listing.quantity} item(s).
              </p>
              <button
                disabled={busy || state.connection !== 'open'}
                onClick={() =>
                  void run(async () => {
                    await api.buyListing(state.character.id, offer.listing.id, offer.listing.price);
                    if (!mounted.current) return;
                    setNotice(`Purchased ${offer.item.template.name}. Check your bag.`);
                    setOffer(null);
                    refresh();
                  })
                }
              >
                Buy for {money(offer.listing.price)}
              </button>
            </section>
          ) : (
            <div className="market-listings">
              {listings.map((listing) => (
                <article key={listing.id} data-listing={listing.id}>
                  <div>
                    <strong>
                      {gameData.template(listing.templateId).name} ×{listing.quantity}
                    </strong>
                    <span>
                      {gameData.rarities.get(listing.rarityId)?.name} · {money(listing.price)}
                    </span>
                    <span className="small muted">
                      {listing.status === 'active'
                        ? new Date(listing.expiresAt).getTime() <= Date.now() + state.serverOffsetMs
                          ? 'Expired · free a bag slot to reclaim'
                          : `Ends ${new Date(listing.expiresAt).toLocaleString()}`
                        : listing.status}
                    </span>
                  </div>
                  {listing.status === 'active' &&
                    (listing.sellerAccountId === state.character.accountId ? (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api.cancelListing(listing.id);
                            if (!mounted.current) return;
                            setNotice(
                              'Listing cancelled. Item returned; the listing fee is not refunded.',
                            );
                            refresh();
                          })
                        }
                      >
                        Cancel listing
                      </button>
                    ) : (
                      <button
                        aria-label={`Inspect ${gameData.template(listing.templateId).name}`}
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const result = await api.marketOffer(listing.id);
                            if (mounted.current) setOffer(result);
                          })
                        }
                      >
                        Inspect
                      </button>
                    ))}
                </article>
              ))}
              {hasMore && (
                <button disabled={busy} onClick={() => void more()}>
                  More listings
                </button>
              )}
            </div>
          )}
          {tab === 'mine' && (
            <p className="small muted">
              Your active listings and 50 most recent closed listings. Expired items return
              automatically when the seller has room; Cancel can reclaim them now.
            </p>
          )}
        </>
      )}
    </>
  );
}

function SellForm({
  busy,
  onSell,
}: {
  busy: boolean;
  onSell: (item: Item, price: number, hours: number) => Promise<void>;
}) {
  const { state, gameData } = useGame();
  const rules = gameData.raw.marketplaceRules;
  const [id, setId] = useState('');
  const [price, setPrice] = useState('100');
  const [hours, setHours] = useState(rules.listingDurationsHours[0]!);
  const items = state.items
    .all()
    .filter(
      (i) =>
        i.instance.location.kind === 'container' &&
        ['backpack', 'material_pouch'].includes(i.instance.location.containerKind) &&
        !i.instance.flags.locked &&
        i.template.marketplaceAllowed &&
        isCurrentlyTradeable(i.template, i.instance.binding),
    );
  const item = items.find((i) => i.instance.id === id);
  const amount = Number(price);
  const valid =
    Number.isSafeInteger(amount) &&
    amount >= Math.max(1, rules.minPrice) &&
    amount <= gameData.currencies.get(rules.currencyId)!.maxBalance;
  const fee = valid ? listingFee(rules, amount) : 0;
  const available = state.balances.find((b) => b.currencyId === rules.currencyId)?.amount ?? 0;
  return (
    <form
      className="market-sell"
      onSubmit={(e) => {
        e.preventDefault();
        if (item && valid && fee <= available && !busy) void onSell(item, amount, hours);
      }}
    >
      <label>
        Item from your bags
        <select
          aria-label="Item to list"
          value={id}
          onChange={(e) => setId(e.target.value)}
          disabled={busy}
          required
        >
          <option value="">Choose an item</option>
          {items.map((i) => (
            <option key={i.instance.id} value={i.instance.id}>
              {i.template.name} ×{i.instance.quantity}
            </option>
          ))}
        </select>
      </label>
      {!items.length && (
        <p>No unlocked, tradeable items in your bags. Bound and equipped items cannot be listed.</p>
      )}
      {item && <ItemTooltip item={item} />}
      <label>
        Total price in copper
        <input
          aria-label="Listing price in copper"
          type="number"
          min="1"
          step="1"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          disabled={busy}
          required
        />
      </label>
      <label>
        Duration
        <select
          aria-label="Listing duration"
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          disabled={busy}
        >
          {rules.listingDurationsHours.map((h) => (
            <option key={h} value={h}>
              {h} hours
            </option>
          ))}
        </select>
      </label>
      {valid && (
        <p>
          Pay {fee} copper now (not refunded). If sold, receive {amount - saleFee(rules, amount)}{' '}
          copper after the sale fee.
        </p>
      )}
      {valid && fee > available && (
        <p className="error">You need {fee} copper for the listing fee.</p>
      )}
      <button disabled={busy || !item || !valid || fee > available || state.connection !== 'open'}>
        Create listing
      </button>
    </form>
  );
}
