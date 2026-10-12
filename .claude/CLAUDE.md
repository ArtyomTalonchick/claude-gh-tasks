# claude-gh-tasks

This repository is the Claude Code plugin `gh-tasks` (a task tracker workflow on GitHub Issues) and its own
marketplace (`.claude-plugin/marketplace.json`, entry `"source": "."`). This file lives in `.claude/` because a
`CLAUDE.md` at the plugin root makes `claude plugin validate` warn; it is for development sessions
only; the plugin does not load it.

`docs/requirements.md` is the single source of truth. Its decisions are settled — do not reopen them. A decision
the document does not cover: ask the user, then write the answer into the document.

## Layout

- `.claude-plugin/` — `plugin.json` (name, version) and `marketplace.json`.
- `skills/<name>/SKILL.md` — `setup`, `triage`, `plan-version`, `next-task`, `commit`.
- `scripts/` — `config.mjs`, `labels.mjs`, `milestone.mjs` + `milestoneCore.mjs`; tests in `scripts/test/`.
- `docs/` — `requirements.md`, `extension-points.md`.
- `.claude/gh-tasks/` — this repository's own tracker config (dogfooding).

## Commands

Run all three after every change:

```
npm test                    # node --test
npm run lint                # eslint .
claude plugin validate .
```

## Rules

- Chat with the user in Russian. Everything in the plugin — code, skills, docs — is in English, states rules
  without decision history, and keeps project specifics in `config.json` / `rules.md` (requirements 6, 7, 11).
- Plan first; write code only after the user approves the plan.
- Commits: one line, conventional commits (`chore|feat|fix|docs|test: subject`), no trailers, no AI mentions.
- Never touch the git remote (no push / fetch / pull); the user does that. `gh issue` and `gh label` are fine;
  `gh api` only through `scripts/milestone.mjs`.
- Code: Node 20+, ESM `.mjs`, `node:util parseArgs`, `execFileSync` with an argument array (never a shell
  string), `node --test`, ESLint clean. Pure functions are exported and tested; the CLI runs only when the file
  is executed directly.

## Tasks

Tasks live in GitHub Issues; the workflow is run by the gh-tasks plugin (`/gh-tasks:triage`,
`/gh-tasks:plan-version`, `/gh-tasks:next-task`) — this repository dogfoods itself. Config and project rules:
`.claude/gh-tasks/`. A task created from chat gets the `status:inbox` label.
