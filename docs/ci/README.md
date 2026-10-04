# CI workflow (not yet enabled)

`github-actions-ci.yml` is the GitHub Actions workflow for this repo. It mirrors `pnpm verify`
(format check, lint, typecheck, unit tests, integration tests against a PostgreSQL 16 service,
asset check, build).

It lives here instead of `.github/workflows/` because the automation that created the repository
foundation could not push workflow files (missing GitHub `workflow` scope). To enable CI, a
maintainer copies it into place and pushes:

```bash
mkdir -p .github/workflows
git mv docs/ci/github-actions-ci.yml .github/workflows/ci.yml
git commit -m "Enable CI workflow" && git push
```

The workflow has never been executed on GitHub; expect to fix small issues on its first run.

Status (2026-10-04, world population milestone): re-attempted both through `git push` and through
the Claude GitHub App; both were refused for missing `workflow` scope. The exact CI sequence was
verified locally instead, without a `.env` file and with only the environment the workflow sets
(`NODE_ENV`, `DATABASE_URL`, `TEST_DATABASE_URL`): format check, lint, typecheck, unit tests,
integration tests (api 5, domain 38, realtime 25), asset check, build. It runs on pushes to `main`
and `claude/**` branches and on pull requests, uses only free GitHub-hosted runners and a
PostgreSQL service container (no paid infrastructure).
