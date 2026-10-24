# Final combined browser qualification — 2026-10-24

Committed runtime candidatea973ae5 passes all78 assertions in one isolated run,vag71f:
rendering6,startup6,trade11,market8,three-player chat10,friends12,onboarding10,guilds15.
This run uses actual UI and services on its own database; no production changes. It is the browser
stage, not a repeated full backend run. The same runtime passed fullformat/types/lint,11 frontend
tests,four builds/all-chunk debug guard and release-preparation fixtures immediately beforehand.
Backend/domain/recovery code is unchanged from integrated35ee149's236unit/204integration checks,
20-table populated upgrade/restore and hosted CI. a973ae5 adds one frontend geometry test.

Rendering screenshots are reviewed and archived under gameplay/evidence/static-rendering-2026-10-24.
Earlier browser failures remain documented in integrated-guilds and startup/rendering evidence.
Production password/TLS profile with deferred-engine assertion and unprofiled five-player guild
workload are now running separately. These checks do not establish physical-phone or public capacity.
