# AGENTS.md

Instructions for every coding agent or model working in this repository (Claude, Astra, Codex, Sol, or any future model).

This project is **one persistent browser-first MMORPG intended to grow for years**. Many different agents will work on it over time. These rules exist so that context is never lost and completed work is never repeated or destroyed.

## Project memory files

| File                  | Purpose                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `docs/MASTER_PLAN.md` | Authoritative long-term specification for the game                                       |
| `docs/PROGRESS.md`    | Authoritative checklist of what is genuinely done, current work, known issues, next task |
| `docs/DECISIONS.md`   | Architecture decision log                                                                |

## Hard rules

> **NEVER mark work complete simply because code exists.**
> It must actually be implemented and verified.

> **NEVER silently delete or replace working systems built by another agent simply because you prefer a different implementation.**

## BEFORE making changes

1. Read `docs/MASTER_PLAN.md`.
2. Read `docs/PROGRESS.md`.
3. Read `docs/DECISIONS.md`.
4. Inspect the current repository and the existing implementation.
5. Continue existing work rather than rebuilding systems that already exist.
6. Verify any checklist item before marking it complete.
7. Do not replace another agent's completed architecture without a strong reason.
8. Record meaningful architectural changes in `docs/DECISIONS.md`.

## AFTER substantial work

1. Run the relevant tests.
2. Run typechecking.
3. Run lint and build where appropriate.
4. Update `docs/PROGRESS.md`.
5. Tick only genuinely completed and verified items.
6. Add proof notes where useful (verified date, agent/model, proof/test, commit SHA).
7. Record known issues.
8. Update the next recommended task.
9. Add important architecture decisions to `docs/DECISIONS.md`.
10. State clearly what is working, what is partial, and what remains placeholder.

## Notes on applying these rules

- If the repository and `docs/PROGRESS.md` disagree, trust what you can verify in the repository, then correct `docs/PROGRESS.md` and say that you did so.
- If a ticked item turns out not to work, untick it and add it to Known Issues rather than leaving it ticked.
- If you do have a strong reason to replace another agent's architecture, record the decision, the reason, and the alternatives in `docs/DECISIONS.md` as part of the same change.
- If a decision in `docs/DECISIONS.md` needs to be reversed, add a new entry that supersedes it. Do not edit or delete the old entry.
- Changes to the game's direction belong in `docs/MASTER_PLAN.md` and should come from the project owner, not from an agent's preference.
- Report honestly. Do not exaggerate what was built or verified.
