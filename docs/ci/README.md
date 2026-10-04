# CI

The workflow source is `docs/ci/github-actions-ci.yml`. It covers main, Claude and Codex branches,
and pull requests, with a read-only GitHub token and per-ref cancellation. The job installs the
locked dependency tree, checks formatting/lint/types, runs all unit/integration tests with a real
PostgreSQL 16 service, performs an isolated backup/restore exercise, checks assets and builds.

Local validation uses actionlint 1.7.7 plus the same commands. Local success does not mean GitHub
Actions ran. Workflow push/run status and the exact reviewed commit are recorded in PROGRESS and
the hardening evidence report.

If credentials refuse workflow-file changes, the sole CI-enablement owner action is to copy this
exact file to `.github/workflows/ci.yml` and commit/push it on `codex/pre-alpha-hardening` using a
credential allowed to update workflows. This action also triggers the branch's first hosted run.
Do not merge until that hosted run is green. No cloud secret is needed by this test workflow.

Installed successfully on GitHub on 2026-10-04 in `cf3bc1e182b5ef3debfe6774052f9bda6f4e3d9b`. The previous workflow-scope block no longer applies to this branch. The Actions connector returned Unknown tool when queried, so hosted execution/result is unverified. The owner action is to check the latest branch run in Actions before merging; copying the template is not currently necessary.
