---
phase: quick-6
plan: 01
type: execute
wave: 1
---

# Quick Task 6: Delete old/inaccurate/unused md files

## Objective

Clean up root-level markdown files that are outdated, redundant, or superseded by `.planning/` docs and `CLAUDE.md`.

## Task 1: Delete obsolete md files

**Keep:** `CLAUDE.md` (active project instructions), `README.md` (project intro)

**Delete (tracked):**
- `# DESIGN_DOC.md` — duplicate with bad filename
- `DOCKER_SETUP_COMPLETE.md` — one-time status doc
- `DOCKER_TEST_NOTES.md` — one-time test notes
- `DOCKER.md` — redundant
- `GETTING_STARTED.md` — redundant
- `MIGRATIONS.md` — schema self-documents in migrations dir
- `PROJECT_STRUCTURE.md` — outdated structure references
- `QUICK_START_DOCKER.md` — consolidating docker docs
- `RAILWAY_DEPLOYMENT_GUIDE.md` — outdated deployment guide
- `ROADMAP.md` — superseded by .planning/ROADMAP.md
- `SLACK.md` — unimplemented spec

**Delete (untracked):**
- `DESIGN_DOC.md` — superseded by CLAUDE.md + .planning
- `DEPLOYMENT.md` — generic/outdated

**Also clean up untracked debug files:**
- `tmp_debug.cjs`, `tmp_debug2.cjs`, `tmp_debug3.cjs`
