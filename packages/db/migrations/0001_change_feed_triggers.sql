-- Change feed: PostgreSQL LISTEN/NOTIFY on channel 'mmo_changes' (see docs/adr/0014-postgres-change-feed.md).
-- Notifications are transactional: they are delivered only if the writing transaction COMMITS, so
-- listeners never see changes that were rolled back. Payloads carry IDs only; listeners re-read the
-- authoritative rows. Triggers guarantee no write path (API, realtime, admin, jobs) can forget to notify.

CREATE OR REPLACE FUNCTION mmo_notify_item_change() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('mmo_changes', json_build_object(
    'k', 'item',
    'i', NEW.id,
    'a', NEW.owner_account_id,
    'pa', CASE WHEN TG_OP = 'UPDATE' AND OLD.owner_account_id IS DISTINCT FROM NEW.owner_account_id
               THEN OLD.owner_account_id END
  )::text);
  RETURN NULL;
END
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER item_instances_notify
  AFTER INSERT OR UPDATE ON item_instances
  FOR EACH ROW EXECUTE FUNCTION mmo_notify_item_change();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mmo_notify_wallet_change() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('mmo_changes', json_build_object('k', 'wallet', 'a', NEW.owner_account_id)::text);
  RETURN NULL;
END
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER currency_balances_notify
  AFTER INSERT OR UPDATE ON currency_balances
  FOR EACH ROW EXECUTE FUNCTION mmo_notify_wallet_change();
