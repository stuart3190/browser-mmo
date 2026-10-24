# Earned class qualification — in progress, 2026-10-24

Fresh Warrior `finishwar_mvm9azse` and Mage `finishmage_mvm9ku7m` each completed twelve main quests
and five Marches side quests, reaching level five. Actions used actual movement, targeting,
abilities and visible UI against disposable local services. No progression grants, teleports or
synthetic XP. `story-database.json` independently confirms all seventeen completed/rewarded rows
for each class. This is staged qualification, not an uninterrupted first-pass playthrough.

Stage logs and four chapter screenshots are archived here. Full artifact directories remain local:

- Warrior `/tmp/bo-earned-warrior{,-resume,-resume2,-marches}`: first driver stalled at a tree, then
  attempted a ring before its required level. The corrected driver respects real requirements and
  uses bounded collision-aware routes. A later fixed 120-second route budget was too short for a
  kilometre journey; it now scales with distance. Earned state survived all resumes.
- Mage `/tmp/bo-earned-mage{,-resume,-marches,-recovery}`: died standing still at the Warden, then
  defeated it with keyboard movement out of visible ground warnings. Later died returning through
  a guardian; ordinary respawn retained quest objectives. No enemy balance changes were made.
- Warrior service continuation `/tmp/bo-earned-warrior-services`: an earlier process interruption
  left a paid Sword craft intact. Starting another was correctly disabled; the updated continuation
  `/tmp/bo-earned-warrior-services-resume` collects that original job through Skills.

Both actors collected their Sword output. The next NPC dialogue checks failed after the local
realtime development process exited; screenshots showed reconnecting. Its restart restored all
25 zones and the persisted actors. Both service continuations subsequently passed eight checks each: vendor sales/purchases,
exact-instance resale, banker UI, discoveries and crafted-equipment persistence across relog.
Their JSON reports and banker screenshots are archived here. Professions and solo/mixed-class
Vault proof are still pending.
The new all-stage orchestrator has not yet completed its full fresh-character route. This record
does not claim full-game, physical-device or public-release readiness.

Warrior solo Vault continuation passed: normal recovery of the failed attempt, both guardians,
Bell Keeper ground-warning movement, reconnect, deliberate death/threshold respawn, completion,
relog, exit, reset and fresh identity with zero objectives. Its original private UUID and earned
state were retained; no grants or instance reset bypassed a failed encounter. Raw report/log and
completion/death screenshots are archived. The report's second `users` entry is an unused legacy
helper default; only the Warrior logged in for this solo run. The driver now reports only actual
actors. Mage professions/staff/solo and mixed-class party remain in progress.

Mage professions and staff: five assertions each pass using earned materials, paid job timers,
relogin/collection and durable Fieldcraft gains. `mage-professions` and `mage-staff` reports/logs.
First Mage solo attempt defeated guardian one, reconnected to the same UUID and passed intentional
death/recovery; it then stopped on a 1.5-second browser click timeout for visible Firebolt while
alive. Failure summary/screenshot retained. Desktop driver now uses the action bar's visible digit
shortcut; touch still uses real taps with a bounded five-second wait. Continuation reuses the same
UUID `01a16de4-813b-741c-af96-3193a40c1723`; earlier death proof is separate and not repeated.

Mage continuation and mixed-class touch party both PASS. The Mage completed guardian two and
Bell Keeper with visible warning dodges, completion/relogin, exit/reset/new clean instance. Prior
first-guardian and death/recovery proof is retained separately. Party UUID
`01a16de9-5e7a-7897-a43f-6abf27c017db` admitted both earned actors together, defeated all three
encounters, reconnected, persisted completion and reset only after both exited. Phone UI uses real
taps; screenshots reviewed. No grants, teleports, injected kills or progression were used.
Read-only independent DB evidence confirms completed timestamps and joined/rewarded markers for
all three original runs and both party members. Their expired statuses result from the verified
explicit resets, with completion tombstones retained. Reports/logs: `mage-solo-vault`,
`mixed-class-party-vault`, `dungeon-members-db.json`. Fresh uninterrupted orchestrator run and
physical-device performance are not claimed.
