# gh-tasks — requirements

A reusable Claude Code plugin that runs a project's task tracker in GitHub Issues: triage incoming issues,
plan a release as a milestone, take the next task through to a commit, close it. Extracted from the
`prosportcards` project; the Telegram bot, the release CI and the worktree slots stay there.

Status: requirements settled on 2026-10-12 (grilling interview, three rounds); released versions and changes are
in `CHANGELOG.md`.
This file is the single source of truth until the plugin exists; later the skills carry the rules and this
file keeps the decisions and their reasons.

## 1. Scope

**In v1**

- Skills: `setup`, `triage`, `plan-version`, `next-task`, `commit`.
- Scripts: `labels.mjs`, `milestone.mjs` (+ `milestoneCore.mjs`), `config.mjs`, `gh.mjs`.
- Project files: `.claude/gh-tasks/config.json`, `.claude/gh-tasks/rules.md`, the git-ignored
  `.claude/gh-tasks/config.local.json`.
- Docs: `README.md`, `docs/requirements.md`, `docs/extension-points.md`, `CHANGELOG.md`.

**Out of v1** (later plugins or later versions)

- `release` (tag, push, GitHub Release, deploy verification) — bound to the prosportcards CI.
- Worktree slots (`task/N` lock branches, merge into `main`, `SessionStart` sync hook).
- Telegram: issue intake from a bot, `tg-issue` markers, release notifications.
- Hooks of any kind.
- A skill that creates issues from chat (Q30): the user creates them on GitHub or asks in chat; an issue
  without labels is untriaged.

## 2. Decisions

| # | Decision | Answer |
|---|---|---|
| Q1 | Plugin name | `gh-tasks`; skills are `/gh-tasks:<skill>`, bare `/<skill>` works while free |
| Q2 | Distribution | Claude Code plugin from a marketplace hosted in a GitHub repository; local-path marketplace while developing |
| Q3 | Audience | One user today, designed so anyone can install it: no absolute paths, secrets or personal settings inside; `gh` permissions live in settings, not in the plugin |
| Q4 | v1 scope | See section 1 |
| Q5 | Milestones | Optional per project (`milestones: true/false`); without them `next-task` orders by labels and `plan-version` is unavailable |
| Q6 | Milestone version scheme | Chosen at setup: `patch` (default) or a project `command` that prints the next version (prosportcards seasons) |
| Q7 | Language | Plugin, skills and docs in English. Working language of issues, milestone text and chat is configurable per project, any language |
| Q8 | Commit format | Default conventional commits `type(scope): subject`; `setup` studies `git log` and proposes the project's own convention, possibly improved |
| Q9 | Project customisation | JSON config for machine-readable fields + a prose Markdown addendum read at fixed extension points |
| Q10 | prosportcards constraint | Every project-specific place in the current prosportcards skills must map onto a config field or an extension point (section 11). Migration itself is a later task |
| Q11 | Checks | `checks` command list in config; empty means «no checks configured», never invented |
| Q12 | Code style | Node 20+, ESM `.mjs`, `node:util parseArgs`, `execFileSync` to `gh`, `node --test`, ESLint; same style as prosportcards `tools/` |
| Q13 | Repository layout | Repository `claude-gh-tasks` (the `claude-` prefix is allowed for a repository, forbidden for a plugin name and risky for a marketplace name — verified with `claude plugin validate` 2026-10-12). The repository **is** the plugin and its own marketplace: `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` with the entry `"source": "."`. Other Claude tools (`claude-tg-notify`) stay in their own repositories |
| Q14 | Plugin version | semver in `plugin.json` + `CHANGELOG.md`; users get an update when the version is bumped |
| Q15 | Test ground | Dogfooding: the plugin repository is tracked with `gh-tasks` itself (issues, labels, milestones = plugin versions). No sandbox repository unless a destructive experiment needs one |
| Q16 | License | Public repository, MIT |
| Q17 | Project files | `.claude/gh-tasks/config.json` and `.claude/gh-tasks/rules.md`; the schema is shipped in `scripts/config.mjs` and validated at the start of every skill |
| Q18 | Config fields | Section 6 |
| Q19 | Extension points | Nine fixed headings in `rules.md` (section 7). A missing heading is an empty point, skipped silently |
| Q20 | Language of artefacts | Everything in GitHub is in the project language; machine-relevant places are marked with language-independent HTML comments `<!-- gh-tasks:… -->`; foreign HTML comments (e.g. `tg-issue`) are preserved untouched |
| Q21 | Triage | Separate skill `triage`; `plan-version` calls it for untriaged candidates, `next-task #N` for an untriaged task taken by number |
| Q22 | Flags | `next-task` takes `plan`, `auto` and `loop` (next task after closing) in v1; the gates they set are Q40 |
| Q23 | Issue body template | What / Where / Done when / Notes / Original message. Project-specific required lines (prosportcards «Who is affected») via `issueTemplate.extraLines` |
| Q24 | Labels | Fixed set `status:* / type:* / prio:* / size:*`, same colours as prosportcards; descriptions in English, fixed in `labels.mjs` (labels are tooling metadata; only issues, milestones and chat follow the project language). `setup` never deletes foreign labels on its own: creates/updates ours, proposes renames, lists extras and asks which to delete; deletion only on the user's explicit word |
| Q25 | Commit trailers | `commit.trailers: false` by default (one line, no trailers, no AI mentions). The approval gate is not configurable; only `next-task auto` runs without it (Q40) |
| Q26 | `setup` | Section 9 |
| Q27 | Hooks | None in v1; the config check is the first step of every skill |
| Q28 | Documents | This file, `README.md`, `docs/extension-points.md`; chat summaries may be in any language |
| Q29 | Next version for `scheme: "patch"` | From GitHub milestones: highest `vX.Y.Z` title (open or closed) + 1 on patch; no milestones yet → ask the user for the first version. Git tags are not read; a project that tags uses `scheme: "command"` |
| Q30 | Issue creation skill | None. Issues are created on GitHub by hand or by asking in chat (`gh issue create --label status:inbox`); an open issue without type, priority and size is untriaged |
| Q31 | Project `commit` skill | The plugin ships `commit`. `setup` detects a project `.claude/skills/commit` and asks: absorb its format rules into `config.commit` and delete it, or leave it (then `next-task` still commits only through `gh-tasks:commit`) |
| Q32 | Install scope | Project scope (`enabledPlugins` in the project `.claude/settings.json`, committed). Not user scope: that would inject `/next-task` into projects with their own, e.g. prosportcards |
| Q33 | Label renames: propose or apply | Both: `setup` runs `labels.mjs apply --dry-run`, shows the plan (renames, conflicts, creates, updates, foreign labels), and runs `apply` after the user's «yes» |
| Q34 | Rename map and foreign labels | Map: `inbox`, `in-progress`, `bug`, `feature`, `wish`, `ops` → their prefixed names; `p1/p2/p3` → `prio:critical/normal/minor`; `size-s/m/l` → `size:s/m/l`. GitHub's `enhancement` is not renamed (broader meaning) and stays foreign. `setup` lists all foreign labels (GitHub defaults included) and asks: delete all, some or none — deleting a label removes it from its issues |
| Q35 | Milestone title | Always `vX.Y.Z`, with either version scheme; the first stdout line of `version.command` is checked against the same pattern |
| Q36 | Running `version.command` | Without a shell: split into arguments (simple quotes supported), `execFileSync` in the project root. On Windows the command starts with an executable (`node …`): `npm run …` needs a shell and is not run |
| Q37 | One open milestone | Enforced by `milestone.mjs create` itself (refuses while another milestone is open), not only by `plan-version` |
| Q38 | Triage gate | `triage` shows all proposed outcomes in one table and writes to GitHub only after «ok»; under `plan-version` the table is part of its gate. `triage auto` writes triaged issues without the gate (`next-task auto` calls it this way), but closing an issue always needs the user's confirmation |
| Q39 | `auto` across skills | `setup`, `triage`, `plan-version` and `next-task` take `auto`: it skips the confirmation gates but never deletes or closes, never invents what only the user knows, never touches the remote; `next-task auto` closes only the issue it has just committed. `setup auto`: proposed values, labels and permissions applied, foreign labels only listed. `plan-version auto`: milestone written and issues assigned without the gate, version from `next-version` (no version yet → still asks), untriaged candidates through `triage auto`, the report shows every choice. `next-task auto`: Q40. `commit` has no `auto`: its gate stays (Q25), `next-task auto` is the only exception |
| Q40 | `next-task` gates | Three levels. Default: the plan is shown only when there are questions, the final diff always waits for «ok». `plan`: the plan always waits for «ok». `auto`: no gates, commits without approval. `plan auto`: plan gate, then no diff gate. `auto` refuses to run without `checks`, stops on a dirty tree or a stuck `status:in-progress`, skips tasks with open questions and `type:ops` tasks, writes new questions into the issue instead of asking, commits only with green checks, and ends with a report of every commit and every closed or skipped issue. A project that always wants the plan gate says so under `## Plan` |
| Q41 | Failing checks and stopping `loop` | Checks still failing after 3 fix attempts → stop and show the failure, the task stays `status:in-progress`, `loop` ends: the uncommitted change blocks the next task. «ok, stop» on the shown diff commits, closes and ends `loop`; `loop` also ends when no task is left |
| Q42 | gh account | Per project, per user: `account` (a GitHub login) in the git-ignored `.claude/gh-tasks/config.local.json`, asked by `setup` when gh has more than one login. Not in `config.json`: collaborators use different accounts. Every GitHub call of the plugin goes through `scripts/gh.mjs`, which runs `gh` with `GH_TOKEN` read from the gh keyring (`gh auth token --user <login>`) for its own process only. `gh auth switch` is not used: the active account is global and would race between parallel sessions; stopping on a wrong active account is rejected for the same reason. `gh.mjs` allows only `gh issue` (not `delete` / `transfer`), `gh label` and `gh search issues`, because a permission rule matches only the `node …` command line. Every `gh.mjs` call runs against `config.repo`: `--repo` is added unless the call carries `--repo` / `-R`. No `account` → the active account |

## 3. Facts from the Claude Code docs (verified 2026-10-12)

- Manifest `.claude-plugin/plugin.json` (`name` required; must not start with `claude-`). Everything else at
  the plugin root: `skills/<name>/SKILL.md`, `agents/`, `hooks/hooks.json`, own `scripts/`. A `CLAUDE.md` at
  the plugin root is not loaded.
- A marketplace entry `"source": "."` means the marketplace root itself → a single-plugin repository is its
  own marketplace. Entry `name` must equal the manifest `name`.
- `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PROJECT_DIR}` are substituted in the SKILL.md body and in
  `allowed-tools` Bash rules (PowerShell rules are not documented; the skills list both forms), with forward
  slashes on Windows, but are **not** in the environment of Bash commands: scripts get paths as arguments.
  `allowed-tools` applies only to the turn the skill runs in; deny rules still win over it.
- A plugin cannot ship permissions or `.claude/rules`. Options: `allowed-tools` in a skill's frontmatter for
  bundled scripts; `permissions` in the user or project `settings.json`.
- Local-path marketplace loads the plugin in place (`/reload-plugins`, no version bump). A git marketplace
  copies it into the cache; updates follow `plugin.json` `version`.
- Install: `/plugin marketplace add <owner>/<repo>`, `/plugin install gh-tasks@gh-tasks` (scope chosen in the
  panel, or `claude plugin install gh-tasks@gh-tasks --scope project`). Validate with `claude plugin validate .`.
- Skill frontmatter available: `name`, `description`, `argument-hint`, `allowed-tools`,
  `disable-model-invocation`, `user-invocable`, `context`, and others.

## 4. Repository layout

```
claude-gh-tasks/                    repository and folder; the plugin and the marketplace inside are `gh-tasks`
  .claude-plugin/plugin.json         name, version, description, license
  .claude-plugin/marketplace.json    one entry, source "."
  skills/
    setup/SKILL.md
    triage/SKILL.md  (+ templates/issue-body.md)
    plan-version/SKILL.md  (+ templates/milestone.md)
    next-task/SKILL.md
    commit/SKILL.md
  scripts/
    config.mjs        schema, load + validate, defaults; `node scripts/config.mjs check --project <dir>`
    labels.mjs        create/update labels, rename map, list extras; never deletes without --delete
    milestone.mjs     list / show / create / describe / close / next-version
    milestoneCore.mjs the only place that builds the `repos/<repo>/milestones` API path
    gh.mjs            gh issue / label / search issues as the project's account; `accounts` lists the logins
    test/*.test.mjs   node --test
  docs/
    requirements.md   this file
    extension-points.md
  README.md, CHANGELOG.md, LICENSE, package.json (type: module, scripts: test, lint), eslint config
  .claude/gh-tasks/config.json + rules.md   the plugin's own tracker (dogfooding)
```

Scripts are invoked from skills as `node "${CLAUDE_PLUGIN_ROOT}/scripts/<name>.mjs" … --project "${CLAUDE_PROJECT_DIR}"`
(quoted, for paths with spaces) and listed in the skill's `allowed-tools` with the same quoting so they run
without prompts. The repository is read from the
config or from `git remote` of the project; nothing is hard-coded.

## 5. Skills

Common first step of every skill: `node … config.mjs check --project …` → missing or invalid config →
say so and point to `/gh-tasks:setup`, stop.

### `setup`
Initialises or updates a project. Flow in section 9. Re-runnable: only adds or updates, never removes
without asking.

### `triage [auto] [#N]`
Turns raw issues into triaged ones. Untriaged = open, and has `status:inbox` **or** lacks any of type /
priority / size. Skips `status:in-progress`.
Per issue: read with comments → find the place in code (Explore agent for wide searches) → one outcome:
triaged (body by template, labels, `status:inbox` removed) / duplicate of #M (comment in #M, close
`not planned`) / not doing (close `not planned` with a reason, only if pointless or already done).
Open questions go into the body under the `open-questions` marker and are asked in chat, one line each.
Milestone is never assigned by triage. Gate and `auto`: Q38. Extension point: **Triage**.

### `plan-version [auto]`
Requires `milestones: true`. One open milestone at a time. Flow: state (open milestone? else next version
via `milestone.mjs next-version`, which implements `patch` or runs the configured `command`) → candidates
(triage all untriaged first; `status:in-progress` and `prio:critical` must be in; `prio:backlog` out) →
carry-over sections from the previous milestone → scope and order (one coherent theme + small items near
it; batch by code; dependencies explicit; «Waits for the user» group last) → **gate**: one message with
version, theme, groups, what is left out and why, the triage table, open questions → after «yes»: write the
description from the template, create/describe the milestone, assign issues, verify → report.
`auto`: Q39. Extension point: **Plan version**.

### `next-task [plan] [auto] [loop] [#N | bug | feature | ops | wish]`
Gates (Q40): default — plan gate only when there are questions, diff gate always; `plan` — plan gate always;
`auto` — no gates; `plan auto` — plan gate, then no diff gate. `auto` needs `checks`: none configured → stop
before the pick. A type word limits the pick to that `type:*`.
1. Pick: stuck `status:in-progress` or dirty tree → ask continue/new (`auto`: stop and say so). `#N` → take it
   (triage first if untriaged; `triage auto` under `auto`). With milestones: follow the open milestone
   description top-down, first open free task; tasks in the milestone but not in the description come after;
   outside the milestone only when it is exhausted; no open milestone → say so, offer `/gh-tasks:plan-version`,
   or order by labels on the user's word (`auto`: order by labels and say so). Without milestones:
   `prio:critical → major → normal → minor`, then `type:bug → feature → ops → wish`, older first. Without
   `auto` tasks with open questions last; `auto` skips them and `type:ops`. Never `prio:backlog` unless taken
   by `#N`. Mark `status:in-progress`; no milestone → put into the open one and say the scope grew. Show what
   was taken, why, and the next two. Extension point: **Pick**.
2. Plan: read issue + comments, read code. Questions → ask in chat and wait (the label stays); `auto` →
   write them into the body under the open-questions marker, remove `status:in-progress`, go to step 1.
   `type:ops` → checklist into the body instead of code. `plan` → propose the plan, wait; otherwise plan
   silently and go on. Extension point: **Plan**.
3. Implement: code; run `checks` from config (none configured → say so). Failing checks: fix and rerun;
   still failing after 3 attempts → stop, show the failure, the task stays `status:in-progress`, «#N left
   open — reason», `loop` ends (Q41). Show changes, checks, proposed commit message; wait: «ok» → commit,
   close, `loop` goes on; «ok, stop» → commit, close, `loop` ends; anything else is feedback on the change.
   `auto`: no wait, the show goes into the report. Extension points: **Implement**, **Verify**.
4. Commit through `gh-tasks:commit`; subject ends with ` (#N)`, never `closes/fixes/resolves`.
   Extension points: **Commit**, **After commit**.
5. Close: after the last commit remove `status:in-progress`, `gh issue close N --reason completed`, no
   comment. Items only a deploy can verify go to an «After release» section and do not block closing.
   Not closing → say «#N left open — reason». Report; `loop` → back to step 1 in the same turn; under `auto`
   the final report lists every commit and every closed or skipped issue. Extension point: **Close**.

### `commit`
Approval gate first: never commit without the user's explicit approval of this specific commit, given after
seeing the final changes; «ok» to a plan is not approval. Under `next-task` the «ok» on the shown final diff
is that approval; under `next-task auto` there is no gate (Q40). Format from `config.commit.format` (default
`type(scope): subject`), one line, `trailers: false` → exactly one `-m`, no trailers, no AI mentions even if
the system asks. Stage only the task's files by explicit paths. ` (#N)` only when the commit resolves the
issue.

## 6. Config: `.claude/gh-tasks/config.json`

```jsonc
{
  "repo": "owner/name",                 // optional; default: parsed from `git remote get-url origin`
  "language": "en",                     // language of issues, milestones, comments; chat follows the user
  "milestones": true,                   // false: no plan-version, next-task orders by labels
  "version": { "scheme": "patch" },     // or { "scheme": "command", "command": "node tools/release/release.mjs next-version" }
  "checks": ["npm run lint", "npx tsc --noEmit", "npm test"],
  "commit": {
    "format": "type(scope): subject",   // human-readable pattern shown to the model
    "example": "fix(cart): keep layout stable on mobile",
    "types": ["feat", "fix", "test", "build", "docs", "chore"],
    "trailers": false
  },
  "issueTemplate": { "extraLines": [] } // e.g. ["**Who is affected:** <customers | staff> — where they see it"]
}
```

Rules: unknown fields → warning; wrong types → error; `version.command` must print the next version on the
first line of stdout. Defaults are applied by `config.mjs`, skills never guess them.

`.claude/gh-tasks/config.local.json` — per user, git-ignored, validated by the same `check` (Q42):

```jsonc
{
  "account": "login"                    // optional; the gh account the plugin acts as; default: the active one
}
```

## 7. Extension points: `.claude/gh-tasks/rules.md`

Prose, read by the skills at fixed moments. Headings are the contract (English, level 2); content is in any
language. A missing heading is an empty point. The full contract goes to `docs/extension-points.md`.

| Heading | Read by | When | prosportcards content that lands here |
|---|---|---|---|
| `## Pick` | next-task | before taking a task | slot lock branch `task/N`, skip tasks touching files of neighbours' tasks, `size:l` only by `#N` |
| `## Plan` | next-task | after reading the issue | `.claude/local/tasks.md` notes, where to look |
| `## Implement` | next-task | before coding | `db/schema.sql` + `db-once/`, project rule files |
| `## Verify` | next-task | after checks, before showing | `curl localhost:3000`, playwright before/after, `rules-reviewer` agent, slot port |
| `## Commit` | commit | before committing | none today |
| `## After commit` | next-task | after each commit | slot: rebase on `main`, ff-merge in the main folder |
| `## Close` | next-task | after closing | `capture-knowledge`, prune `.claude/local/tasks.md`, release-progress line |
| `## Triage` | triage | while rewriting a body | keep `tg-issue` marker, `💬` comments are the author, «Who is affected» semantics |
| `## Plan version` | plan-version | while choosing scope | release size reference, season rule, themes, «waits for the owner» group |

## 8. Labels, markers, lifecycle

Labels (names fixed, descriptions in English, colours as in prosportcards `labels.mjs`):
`status:inbox`, `status:in-progress`; `type:bug|feature|wish|ops`; `prio:critical|major|normal|minor|backlog`;
`size:s|m|l`. Exactly one status (or none for a triaged free task), one type, one priority, one size.
`prio:backlog` is set only by the user. Rename map for projects coming from older schemes (`bug → type:bug`
etc., Q34) is applied only when the target does not exist yet; both existing is a conflict for the user to resolve.

Lifecycle: `status:inbox` or no labels → triage → free → `next-task` sets `status:in-progress` → commit(s)
with `(#N)` → closed `completed` right after the last commit. Closed in an open milestone = waiting for a
release; a closed milestone = released. Nothing in the plugin closes a milestone or touches issues
automatically (that is a CI concern and stays in the project).

Markers (HTML comments, language-independent, preserved on every rewrite):
- `<!-- gh-tasks:open-questions -->` — the body has open questions for the user; `next-task` takes such tasks
  last, `next-task auto` skips them.
- `<!-- gh-tasks:original -->` — wraps the untouched original body inside `<details>` after a rewrite.
- `<!-- gh-tasks:after-release -->` — the checklist that only a deploy can verify (kept for a future
  `release` plugin).
- Any foreign HTML comment (e.g. `<!-- tg-issue … -->`) is kept verbatim.

Issue body template (headings translated to the project language): **What** (+ `extraLines`), **Where**,
**Done when** (checkboxes), **Notes** (hypothesis, risks, open questions), **Original message** (details).
Title: imperative, specific, ≤ 70 characters.

Milestone description template: theme in one sentence + agreed date; progress note; «order is top-down»
note; groups (Core → Quick → If time remains → Waits for the user) with one line per task saying what and
why here; then «Deliberately not in this release», «Next, by themes», «Hard dependencies».

## 9. `setup [auto]` flow

`auto`: Q39.

1. `gh auth status`; repo from `git remote`; existing `.claude/gh-tasks/config.json` → update mode.
2. Questions, one block: milestones yes/no; version scheme (`patch` or a command); language; checks
   (proposed from `package.json` scripts); commit format (proposed from the last ~30 `git log` subjects:
   detected convention, or conventional commits if none, with suggested improvements); existing project
   `commit` skill → absorb and delete, or keep (Q31); gh account when `gh.mjs accounts` lists more than one login
   (Q42) — written to `config.local.json` before the labels, and the file is added to `.gitignore`.
3. Labels: `labels.mjs apply --dry-run` → show the plan and ask which foreign labels to delete (all / some /
   none) → `labels.mjs apply [--delete <names>]`: renames where safe, create/update ours, delete only the names
   the user chose (Q33, Q34).
4. Write `config.json`, a `rules.md` skeleton with the nine headings and one-line hints, and a short
   paragraph into the project `CLAUDE.md` («Tasks live in GitHub Issues, workflow by the gh-tasks plugin;
   config in `.claude/gh-tasks/`; a task created from chat gets `status:inbox`»).
5. Permissions: show the block and, after confirmation, merge into the project `.claude/settings.json`:
   allow `Bash(gh issue *)`, `Bash(gh label *)`, `Bash(gh search issues *)`, the plugin scripts (`gh.mjs`
   included); deny
   `Bash(gh api *)`, `gh repo *`, `gh pr *`, `gh workflow *`, `gh secret *`, `gh variable *`, `gh auth *`.
   Both `Bash(...)` and `PowerShell(...)` forms on Windows. Why deny `gh api`: the `gh auth` token can do
   anything through it, and a permission rule cannot narrow it; `milestone.mjs` is the only door, with the
   path built as `repos/<repo>/milestones[/<n>]` and the method from `GET/POST/PATCH`. `${CLAUDE_PLUGIN_ROOT}` is
   not substituted in `settings.json` and the cache path changes with every version, so the script rules are
   patterns: `Bash(node *gh-tasks*/scripts/<name>.mjs*)`. Because `gh auth *` is denied, skills check `gh` with
   `gh label list --limit 1`, not `gh auth status`.
6. Report: what was created, what to review, and the next command (`/gh-tasks:triage` or `/gh-tasks:plan-version`).

## 10. Non-functional requirements

- No project history inside the plugin: skills state rules, not «owner's decision 2026-09-18». The reasons
  live in this file and in `CHANGELOG.md`.
- The word for the person is «the user»; approval semantics are the same whoever runs the session.
- Scripts: tests for every pure function (`node --test`), ESLint clean, `claude plugin validate .` clean.
- Scripts never print secrets — the token `gh.mjs` reads stays in the child's environment; `gh` is called
  through `execFileSync` with argument arrays, never a shell string.
- Windows and POSIX: paths through `node:path`, no shell-specific syntax in skills' commands.
- A skill fails loudly: missing config, missing `gh`, no open milestone — one sentence and the next command.

## 11. prosportcards mapping (Q10 check)

| prosportcards specific | Where it goes |
|---|---|
| Repo `ArtyomTalonchick/prosportcards` hard-coded in `milestone.mjs` | `config.repo` / `git remote` |
| Seasons: minor = season, `release.mjs next-version` | `version: { scheme: "command", command: "node tools/release/release.mjs next-version" }` |
| `npm run lint`, `tsc`, `npm test` | `checks` |
| `type (scope): subject`, types list, one `-m`, no Claude | `commit` |
| «Who is affected: customers / staff» | `issueTemplate.extraLines` + `## Triage` |
| Telegram: `tg-issue` marker, `💬` comments, bot writes only «✅ #N» | foreign markers preserved by core; semantics in `## Triage` |
| Slots: lock branch, skip neighbours, rebase + ff-merge, `slot.mjs info/sync` | `## Pick`, `## After commit` (later: a slots plugin) |
| `.claude/local/tasks.md` | `## Plan`, `## Close` |
| `curl localhost:3000`, playwright, `rules-reviewer`, slot port | `## Verify` |
| `db/schema.sql`, `db-once/` | `## Implement` |
| `capture-knowledge` | `## Close` |
| Release size reference, «waits for the owner» group | `## Plan version` |
| `/release`, CI closing the milestone, Telegram release posts | out of scope, stays in the project |
| Russian texts | `language: "ru"` |

Everything maps; no core change is needed for the migration.

## 12. Roadmap (milestones of this repository)

- **v0.1.0** — skeleton: manifest, marketplace, `package.json`, ESLint, `config.mjs` with schema and tests,
  `labels.mjs`, `milestone.mjs` (incl. `next-version`), `setup` skill. Dogfooding starts here: `setup` run on
  this repository, labels created, first milestone.
- **v0.2.0** — `triage` and `plan-version`, templates, `docs/extension-points.md`.
- **v0.3.0** — `next-task` with `plan`/`auto`/`loop`, `commit`.
- **v1.0.0** — README with install and usage, CHANGELOG, `claude plugin validate` clean, a full cycle
  (setup → triage → plan-version → next-task → commit → close) run on this repository from the GitHub
  marketplace.
- Later: prosportcards migration (its own task in prosportcards), `release` and `slots` plugins.

Definition of done for v1: a fresh repository with issues gets the full cycle working with only
`/plugin install gh-tasks@gh-tasks` and `/gh-tasks:setup`, with no edits to the plugin.
