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

The workflow has never been executed; expect to fix small issues on its first run.
