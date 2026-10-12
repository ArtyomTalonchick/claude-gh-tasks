# Changelog

## Unreleased

- `triage` skill: rewrites untriaged issues by the body template, sets type, priority and size, closes duplicates
  and pointless issues after confirmation; `auto` writes without the gate.
- `plan-version` skill: picks and orders the open issues into one milestone by the description template, triaging
  untriaged candidates first; `auto` writes without the gate.
- `setup auto`: takes the proposed values without questions, applies labels and permissions, lists foreign labels
  instead of deleting them.
- `milestone.mjs list` and `show` print the release date of a closed milestone.

## 0.1.0 — 2026-10-12

- `setup` skill: config questions, labels, `rules.md` skeleton, `CLAUDE.md` note, permissions, first milestone.
- `scripts/config.mjs`: config schema with defaults and validation; `check --project <dir>` prints the effective
  config.
- `scripts/labels.mjs`: the fixed label set; `apply` with `--dry-run`, safe renames from older schemes,
  case-insensitive matching, deletion only of foreign labels named with `--delete`.
- `scripts/milestone.mjs`: `list`, `show`, `create`, `describe`, `close`, `next-version` (`patch` from milestone
  titles, or the project's `command`); the only door to `gh api`, limited to `repos/<repo>/milestones`.
- Requirements settled (`docs/requirements.md`, decisions Q1–Q37).
