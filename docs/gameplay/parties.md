# Greenvale parties and shared hunts

Open **Party** (P on desktop) to invite a player in view. Invite and accept while both living players
are connected within 20 m in the same zone. An invitation expires after 30 seconds; it is addressed
to one character and can be answered once. Only the leader invites or disbands. Maximum five members;
each inviter and recipient can have one pending invitation. Leaving transfers leadership to the next
member; fewer than two members dissolves the party. This is a zone-local adventuring group, not a guild.

The compact roster shows authoritative health and connection status. Party actions also work through
the responsive Party panel. A dropped connection keeps membership for two minutes but earns no new
group rewards while offline. Reconnecting restores the full roster. After the grace period the member
leaves automatically. Host recovery restores membership/loot order, initially marks everyone offline,
and requires authenticated reconnection. Unanswered invitations are cancelled on host recovery.

## Reward rules

- First damage tags the enemy and snapshots that character's party membership. Joining mid-fight
  never earns that fight's group rewards.
- At death, eligibility is the intersection of that snapshot and the tagger's current party, limited
  to living, connected members within 40 m of the creature. The zone decides all of this.
- If no group member is eligible, the death grants no group rewards.
- Each eligible member receives their level-adjusted solo XP divided by eligible member count, rounded
  down. No party XP bonus or per-member full XP multiplication. Two level-one members currently get
  25 XP each for a Grey Wolf, rather than 50 each.
- Each eligible member gets one kill toward already-active matching quests. Collection requirements
  still count the actual items that character owns; pelts are not duplicated or shared inventory.
- Exactly one normal loot-table roll (items and coins together) goes to the next eligible member in
  membership order. The cursor advances per rewarded death, even when a roll has no drops. It skips
  ineligible members. Reconnecting does not reset it. This is round-robin allocation, not a rarity guarantee.
- Solo kills retain existing first-tagger rules. If the tagged party no longer exists or the tagger has
  left it, the kill falls back to the original tagger; changing parties never transfers it to a new group.
- Reward recipients and loot owner are frozen in the durable death event. Later membership changes,
  disconnects or retries cannot redirect that event. All members' XP, quest credit, loot and the outbox
  completion commit in one transaction. A full recipient mailbox delays the entire group reward for retry.

## Boundaries

Party state is checkpointed by the existing exclusive zone owner; there is no new broker, database
party service, party chat, cross-zone travel, loot voting, trading or raid system. Invitations/actions
use authenticated realtime messages and existing sequence/rate controls. Leave/disband include the
party ID, so an old request cannot affect a newly formed party. Full snapshots reconcile membership;
health refreshes at most once a second. This is intentionally limited to the currently playable zone.

## Verification commands

- World tests cover invitation permissions/range/expiry, membership caps, replay, tag-time eligibility,
  loot rotation, disconnect grace and a real simulated death recovered from a checkpoint.
- PostgreSQL tests cover concurrent processors, split XP and quest credit, one recipient's loot,
  invalid recipient lists, zero eligible recipients and rollback/retry after a mid-group reward failure.
- Gateway tests cover sequence replay, invitation replay, stale party IDs, unauthorized disband,
  disconnect/reconnect and host restart.
- `scripts/e2e/party.cjs` drives real UI invitation, two kills, alternating loot, shared quest progress,
  re-login, leave/disband and phone-sized controls. Run on an isolated seeded development stack with
  `PLAYWRIGHT_PATH` and optional `WEB_URL`/`CHROME_PATH`. It creates fresh characters by default.
  `PARTY_RESUME=user1,user2` can resume an interrupted pre-hunt fixture with the sword equipped,
  quests accepted and both characters near Northwood. This is not a production login path.

## Deployment compatibility

Apply the additive kill-event migration with zone hosts stopped, then start the new build. Old solo
events with null recipients still use their original recipient. Simulation checkpoints now write
version 2 and accept legacy version 1; older binaries reject version 2 rather than silently dropping
party state. After group kills exist, roll forward with a fix instead of restarting a pre-party binary:
its reward processor does not understand group recipients. Do not delete checkpoints or pending kills.
