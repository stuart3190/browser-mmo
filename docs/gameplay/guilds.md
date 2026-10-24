# Persistent guilds

A character can belong to one guild with up to 50 members. Guilds persist independently of zone
hosts and party membership. Open Guild (G) to found a company, review invitations, read the roster
or use guild chat. Names are 3–32 characters; tags are 2–5 letters/numbers, displayed uppercase.
Live names and tags are case-insensitively unique. Creation is free.

The leader invites, promotes/demotes officers, removes members, transfers leadership and disbands.
Officers invite and edit the 500-character notice. Members chat and leave. A leader transfers
leadership or explicitly disbands before leaving. Removal, transfer, leave and disband have a
review step in the UI. Removing/demoting an officer, leaving or transferring leadership withdraws
that character's outstanding invitations. Invitations expire after seven days, require acceptance,
and respect existing account blocks when sent. Each recipient has at most ten active invitations;
each guild has at most fifty outstanding invitations. Membership capacity is checked under the
same guild lock as acceptance, so concurrent joins cannot take the same final place.

Guild chat is durable plain text, limited to 500 characters and eight new messages per account per
ten seconds across alts. A UUID makes retries idempotent; different text cannot reuse it. Only
current members may read or send. The UI shows the latest 100 messages in chronological order and
polls while open every three seconds. Roster, notice and chat survive zone travel and relog.
Every scoped HTTP action carries the guild UUID displayed in the UI; stale clients cannot send a
private message, change ranks or disband a different guild after their membership changes.

Membership and chat use database transactions. Lock order is sorted accounts, sorted characters,
then the guild row; this shares the friends/block ordering. The guild row names its leader, and
member roles store only officer/member so there cannot be multiple independent leader flags.
The existing audit log records structural changes. Disband retains the guild/message tombstones
and releases memberships/invitations and the live name/tag. Guild vaults remain later work in the
master plan. Guild size is a membership bound, not a claim of concurrent-player capacity.

Migration 0024 is additive. Follow the existing stop-host/migrate/restore procedure before deploying;
older binaries do not expose this interface. Qualification must cover concurrency, ownership,
permission revocation, stale guild identities, backup/restore and actual desktop/phone UI.
