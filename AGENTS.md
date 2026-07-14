# AGENTS.md — Codex / agent instructions

This is a TypeScript + Vite canvas game. UI is being migrated from canvas-drawn
panels to a **React DOM overlay** in a "full-dark Darkest Dungeon" style.
**Read `docs/ui-overlay-migration.md` first** — it has the architecture, the
per-panel migration recipe, and known gotchas.

## Conventions
- Design tokens live in `src/ui/theme/darksaber-ui.css` (scoped to `#ui-overlay`).
  Reuse existing classes (`.ds-panel`, `.ds-btn`, `.ds-bar`, …). Gold = accent,
  red = danger only.
- All user-facing text goes through `t('key')` (`src/i18n/LanguageManager.ts`).
  **A missing key returns the key string** — always add the key to BOTH the `ko`
  and `en` blocks.
- `SettingsManager` is a static class that uses `this`; never pass its methods as
  bare references — wrap them: `() => SettingsManager.setX(v)`.
- Run `npm run typecheck` before committing. It must pass.
- **One commit per task.** In the commit body, note which checklist item it
  completes (e.g. "Completes ui-tasks: i18n SettingsPanel").

## Marking work done
Work from **`docs/ui-tasks.md`**. When a task is finished and type-checks:
1. Tick its checkbox `- [x]` in `docs/ui-tasks.md`.
2. Commit that file together with the change.
That checklist + `git log` is the shared "done" record across machines/tools.

## GitHub Actions Cost Lock

- Do not add, enable, dispatch, rerun, or broaden GitHub Actions workflows without the user's explicit approval.
- Do not use a commit, push, or pull request merely to test remote CI. Run the repository's checks locally first.
- For private repositories, keep GitHub Actions disabled in repository settings. If it is explicitly re-enabled, workflows must remain manual-only (`workflow_dispatch`) unless the user approves otherwise.
- Existing automatic workflows in public repositories may remain only when they provide a real deployed service (for example Pages publishing or scheduled data refresh). Do not expand them without approval.
- Prefer an approved self-hosted runner when remote automation is explicitly required.
