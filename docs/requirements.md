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

- Skills: `setup`, `triage`, `plan-version`, `next-task`, `commit`, `release` (`close-version` until 2.0, Q47).
- Scripts: `labels.mjs`, `milestone.mjs` (+ `milestoneCore.mjs`), `release.mjs` (+ `releaseCore.mjs`), `config.mjs`,
  `gh.mjs`, `cli.mjs`.
- Project files: `.claude/gh-tasks/config.json`, `.claude/gh-tasks/rules.md`, the git-ignored
  `.claude/gh-tasks/config.local.json`.
- Docs: `README.md`, `docs/requirements.md`, `docs/extension-points.md`, `CHANGELOG.md`.

**Out of v1** (later plugins or later versions)

- Deploy verification and release notifications as plugin code: they are project steps under `## Ship` and
  `## After release` of the `release` skill (Q47). The only push in plugin code is the release's (Q51).
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
| Q6 | Milestone version scheme | Chosen at setup: `patch` (default), `minor`, or a project `command` that prints the next version (prosportcards seasons). `minor` is proposed when `package.json` has a `version` or `vX.Y.0` tags exist. The manifest bump (a patch per commit, `X.Y.0` at release) is not plugin code: with `minor`, `setup` proposes it as `## Commit` / `## Release` steps of `rules.md`, with their permissions (Q45). The tag is `release.tag` (Q47) |
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
| Q19 | Extension points | Thirteen fixed headings in `rules.md` (section 7). A missing heading is an empty point, skipped silently |
| Q20 | Language of artefacts | Everything in GitHub is in the project language; machine-relevant places are marked with language-independent HTML comments `<!-- gh-tasks:… -->`; foreign HTML comments (e.g. `tg-issue`) are preserved untouched |
| Q21 | Triage | Separate skill `triage`; `plan-version` calls it for untriaged candidates, `next-task #N` for an untriaged task taken by number |
| Q22 | Flags | `next-task` takes `plan`, `auto` and `loop` (next task after closing) in v1; the gates they set are Q40, the `auto loop` combination is Q50 |
| Q23 | Issue body template | What / Where / Done when / Notes / Original message. Project-specific required lines (prosportcards «Who is affected») via `issueTemplate.extraLines` |
| Q24 | Labels | Fixed set `status:* / type:* / prio:* / size:*`, same colours as prosportcards; descriptions in English, fixed in `labels.mjs` (labels are tooling metadata; only issues, milestones and chat follow the project language). `setup` never deletes foreign labels on its own: creates/updates ours, proposes renames, lists extras and asks which to delete; deletion only on the user's explicit word |
| Q25 | Commit trailers | `commit.trailers: false` by default (one line, no trailers, no AI mentions). The approval gate is not configurable; only `next-task auto` (Q40) and `release auto` (Q47) run without it |
| Q26 | `setup` | Section 9 |
| Q27 | Hooks | None in v1; the config check is the first step of every skill |
| Q28 | Documents | This file, `README.md`, `docs/extension-points.md`; chat summaries may be in any language |
| Q29 | Next version for `scheme: "patch"` and `"minor"` | From GitHub milestones: highest release title (open or closed) + 1 on patch as `vX.Y.Z`, or + 1 on minor as `vX.Y`; no milestones yet → ask the user for the first version. Git tags are not read for the version (`setup` looks at them only to propose `minor`); a project whose version lives elsewhere uses `scheme: "command"` |
| Q30 | Issue creation skill | None. Issues are created on GitHub by hand or by asking in chat; an open issue without type, priority and size is untriaged. A chat issue goes through `gh.mjs … issue create --label status:inbox`, so it is written as the project's account (Q42). The `CLAUDE.md` paragraph names the wrapper by its role — the `scripts/gh.mjs` of the installed gh-tasks plugin, under `~/.claude/plugins/cache/gh-tasks/` — not by a path or a glob: the cache path changes with every version, and a glob is not runnable. `setup` replaces an older gh-tasks paragraph that does not name `gh.mjs` |
| Q31 | Project `commit` skill | The plugin ships `commit`. `setup` detects a project `.claude/skills/commit` and asks: absorb it and delete it — the format into `config.commit`, every other step into `rules.md → ## Commit`, each step shown with where it goes before the skill is deleted — or leave it (then `next-task` still commits only through `gh-tasks:commit`) |
| Q32 | Install scope | Project scope (`enabledPlugins` in the project `.claude/settings.json`, committed). Not user scope: that would inject `/next-task` into projects with their own, e.g. prosportcards |
| Q33 | Label renames: propose or apply | Both: `setup` runs `labels.mjs apply --dry-run`, shows the plan (renames, conflicts, creates, updates, foreign labels), and runs `apply` after the user's «yes» |
| Q34 | Rename map and foreign labels | Map: `inbox`, `in-progress`, `bug`, `feature`, `wish`, `ops` → their prefixed names; `p1/p2/p3` → `prio:critical/normal/minor`; `size-s/m/l` → `size:s/m/l`. GitHub's `enhancement` is not renamed (broader meaning) and stays foreign. `setup` lists all foreign labels (GitHub defaults included) and asks: delete all, some or none — deleting a label removes it from its issues |
| Q35 | Milestone title | `vX.Y.Z` or `vX.Y`, accepted with any version scheme; `vX.Y` is version `X.Y.0`. `next-version` titles a `patch` release `vX.Y.Z` and a `minor` release `vX.Y`. One version has one milestone: `create` refuses `v1.2.0` when `v1.2` exists, and the other way round; `show`, `describe` and `close` match the exact title. The manifest version is always `X.Y.Z`, and so is `{version}` in `release.tag`. The first stdout line of `version.command` is checked against the same pattern |
| Q36 | Running `version.command` | Without a shell: split into arguments (simple quotes supported), `execFileSync` in the project root. On Windows the command starts with an executable (`node …`): `npm run …` needs a shell and is not run |
| Q37 | One open milestone | Enforced by `milestone.mjs create` itself (refuses while another milestone is open), not only by `plan-version` |
| Q38 | Triage gate | `triage` shows all proposed outcomes in one table and writes to GitHub only after «ok»; under `plan-version` the table is part of its gate. `triage auto` writes triaged issues without the gate (`next-task auto` calls it this way), but closing an issue always needs the user's confirmation |
| Q39 | `auto` across skills | `setup`, `triage`, `plan-version` and `next-task` take `auto`: it skips the confirmation gates but never deletes or closes, never invents what only the user knows (`next-task auto loop` decides open questions itself, Q50), never touches the remote; `next-task auto` closes only the issue it has just committed. `setup auto`: proposed values, labels and permissions applied, foreign labels and rule-command permissions (Q45) only listed. `plan-version auto`: milestone written and issues assigned without the gate, version from `next-version` (no version yet → still asks), untriaged candidates through `triage auto`, the report shows every choice. `next-task auto`: Q40, with `loop`: Q50. `release auto`: no gate; open issues of the milestone are still settled on the user's word; it pushes only with `release.push`, as without `auto` (Q51). `commit` has no `auto`: its gate stays (Q25), `next-task auto` and `release auto` are the only exceptions |
| Q40 | `next-task` gates | Three levels. Default: the plan is shown only when there are questions, the final diff always waits for «ok». `plan`: the plan always waits for «ok». `auto`: no gates, commits without approval. `plan auto`: plan gate, then no diff gate. `auto` refuses to run without `checks`, stops on a dirty tree or a stuck `status:in-progress`, skips tasks with open questions and `type:ops` tasks, writes new questions into the issue instead of asking (an issue given as `#N` is taken anyway and its questions are asked in chat), commits only with green checks, and ends with a report of every commit and every closed or skipped issue. A project that always wants the plan gate says so under `## Plan`. `auto loop` changes the questions and adds the release: Q50 |
| Q41 | Failing checks and stopping `loop` | Checks still failing after 3 fix attempts → stop and show the failure, the task stays `status:in-progress`, `loop` ends: the uncommitted change blocks the next task. «ok, stop» on the shown diff commits, closes and ends `loop`; `loop` also ends when no task is left |
| Q42 | gh account | Per project, per user: `account` (a GitHub login) in the git-ignored `.claude/gh-tasks/config.local.json`, asked by `setup` when gh has more than one login. Not in `config.json`: collaborators use different accounts. Every GitHub call of the plugin goes through `scripts/gh.mjs`, which runs `gh` with `GH_TOKEN` read from the gh keyring (`gh auth token --user <login>`) for its own process only. `gh auth switch` is not used: the active account is global and would race between parallel sessions; stopping on a wrong active account is rejected for the same reason. `gh.mjs` allows only `gh issue` (not `delete` / `transfer`), `gh label` (not `delete`: only `labels.mjs apply --delete` deletes labels) and `gh search issues`, because a permission rule matches only the `node …` command line. Every `gh.mjs` call runs against `config.repo`: `--repo` is added unless the call carries `--repo` / `-R`. No `account` → the active account |
| Q43 | `## Commit` steps and the gate | The `## Commit` steps that change files (a version bump) run before the commit gate, and under `next-task` before the diff is shown, so the user approves the file list that is committed; a step already done in the working tree is not repeated. Steps that need the commit (a tag) run after it |
| Q44 | `setup` step order | Permissions are merged before the labels are applied: `labels.mjs apply` is the first write to GitHub, and under `auto` a call without a permission rule is blocked |
| Q45 | Permissions for `rules.md` commands | `setup` step 3 lists the shell commands the `rules.md` steps run (an absorbed commit skill's steps included) and proposes one allow rule per command and subcommand (`Bash(npm version *)`, `Bash(git tag *)`), skipping commands already allowed, denied, or reaching the git remote; merged after the user's confirmation by the same rules as the gh-tasks block. `setup auto` only lists them: they are project commands the plugin did not write. The `commit` skill's `allowed-tools` are not widened — the plugin cannot know a project's commands |
| Q46 | Parallel `next-task` sessions | `## Pick` may change two core steps of `next-task`: which `status:in-progress` issues are this session's (the others belong to parallel sessions and are left out of the unfinished-work check, so `auto` does not stop on them), and how a task is claimed (a lock before the label; a failed lock skips to the next candidate, or stops when the task was given by `#N`). Without such a rule every in-progress issue is this session's and the label is set at once |
| Q47 | Releasing a milestone | Skill `release [auto]` (replaces `close-version` in 2.0): one skeleton for projects that push by hand and for projects with release CI (prosportcards), the project's specifics in config and `rules.md`. Flow: state → open issues settled on the user's word (a `## Release` rule may replace this, e.g. «they stay in the milestone») → `## Release` checks and file changes → notes → **gate** (`auto`: none) → release commit through `commit` → tag by `release.tag` (`v{version}` by default, `false` = none) → draft GitHub Release with `release.githubRelease` → `## Ship` steps → publish once the tag is on GitHub and close the milestone, or neither with `release.publishedBy: "ci"` → `## After release` → report with the open after-release checklists. The plugin pushes only with `release.push` (Q51): without it and without `## Ship` the run stops at «push, then run `release` again», and the next run reads the state (local tag, tag on GitHub, draft, milestone) and goes on — the draft carries the approved notes between runs. Without a tag and without ship steps the milestone is closed in the same run. Requires `milestones: true` |
| Q48 | Behaviour tests of skills | No `claude plugin eval` suite. Each eval run starts in an empty workspace without the project, its config or a git repository, and with no network. The skills run shell commands (`config.mjs`, `gh.mjs`, `git`) against a real GitHub repository, so a meaningful case needs a fake project and a stand-in for `gh`. Shell tools in eval runs need the OS sandbox, which native Windows lacks (WSL2 only). Skills are checked by live runs on this repository; `claude plugin validate` checks their files |
| Q49 | GitHub Releases API | Through `scripts/release.mjs` only, the way milestones go through `milestone.mjs` (`gh api` stays denied): `releaseCore` builds `repos/<repo>/releases` (list, create, update) and `repos/<repo>/git/matching-refs/tags/<tag>` (read), no delete. `publish` refuses while the tag is not on GitHub or is not the local tag object: publishing a draft whose tag is missing makes GitHub create the tag on the default branch, possibly on a commit that is not the release. `gh release --generate-notes` is not used: it builds notes from pull requests, and projects that commit to `main` have none |
| Q50 | `next-task auto loop` | The combination closes the open milestone and releases it on its own. Each task runs in its own subagent (plan, code, checks, verify), which returns the files, a diff summary, the check results, the commit message and its decisions; the main thread picks, commits, closes and reports, so the chat holds only short summaries. Open questions are decided, not skipped: tasks with the open-questions marker are taken, the decision replaces the open-questions list in the body and goes into the report. Only what the agent cannot know — secrets, credentials, accounts, payments, access — still skips the task. `type:ops` is still skipped. When the loop ends with no task left, milestones on and every issue of the open milestone closed, the run goes on as `release auto`; any issue left open (skipped, failing checks) → no release, the report says why. `auto` without `loop`, an issue given as `#N`, and `loop` without `auto` keep Q40 |
| Q51 | Release push | `release.push` (default `false`; `setup` proposes `true`, or `false` when `## Ship` keeps a push of its own): in the ship stage, with or without `auto`, `release.mjs push` sends the current branch and the release tag to `https://github.com/<repo>.git` as the project's gh account — the token goes to that one git call through an inline credential helper and the environment, git config and an SSH `origin` stay as they are. Plain refs only, never force; it refuses on a detached HEAD and while the tag is missing, already on GitHub or not at HEAD. A rejected push goes to the user: never force, pull or rebase. After it `origin/<branch>` is moved when `origin` is the same repository. Then the `## Ship` steps run (a deploy). Task commits are never pushed; `next-task auto loop` pushes only through its `release auto` |
| Q52 | ` (#N)` on commits | Every commit of a task ends with ` (#N)`, so the history shows the task of each commit. The issue is closed by the workflow after the last commit, never by GitHub keywords. Release notes stay one line per issue: they are built from the milestone's issues, not from commits |

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
    release/SKILL.md
  scripts/
    config.mjs        schema, load + validate, defaults; `node scripts/config.mjs check --project <dir>`
    labels.mjs        create/update labels, rename map, list extras; never deletes without --delete
    milestone.mjs     list / show / create / describe / close / next-version
    milestoneCore.mjs the only place that builds the `repos/<repo>/milestones` API path
    release.mjs       status / draft / publish of the GitHub Release of a milestone
    releaseCore.mjs   the only place that builds the `repos/<repo>/releases` and tag-ref API paths
    gh.mjs            gh issue / label / search issues as the project's account; `accounts`: logins and repo access
    cli.mjs           shared entry: runs `main` only when executed directly, an error → one stderr line, exit 1
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
1. Pick: stuck `status:in-progress` of this session (Q46) or dirty tree → ask continue/new (`auto`: stop and
   say so). `#N` → take it (triage first if untriaged; `triage auto` under `auto`). With milestones: follow the
   open milestone description top-down, first open free task; tasks in the milestone but not in the description
   come after; outside the milestone only when it is exhausted; no open milestone → say so, offer
   `/gh-tasks:plan-version`, or order by labels on the user's word (`auto`: order by labels and say so). Without
   milestones: `prio:critical → major → normal → minor`, then `type:bug → feature → ops → wish`, older first.
   Without `auto` tasks with open questions last; `auto` skips them and `type:ops` (`auto loop` takes them last
   and still skips `type:ops`, Q50). Never `prio:backlog` unless
   taken by `#N`. Mark `status:in-progress` (after a lock when `## Pick` asks for one, Q46); no milestone → put
   into the open one and say the scope grew. Show what was taken, why, and the next two. Extension point:
   **Pick**.
2. Plan: read issue + comments, read code. Questions → ask in chat and wait (the label stays); `auto` →
   write them into the body under the open-questions marker, remove `status:in-progress`, go to step 1. An issue
   given as `#N` is taken under `auto` too: its questions are asked in chat, and the run keeps the `auto` gates.
   `auto loop` decides the questions itself and records the decisions (Q50); each task runs in a subagent.
   `type:ops` → checklist into the body instead of code. `plan` → propose the plan, wait; otherwise plan
   silently and go on. Extension point: **Plan**.
3. Implement: code; run `checks` from config (none configured → say so). Failing checks: fix and rerun;
   still failing after 3 attempts → stop, show the failure, the task stays `status:in-progress`, «#N left
   open — reason», `loop` ends (Q41). Show changes, checks, proposed commit message; wait: «ok» → commit,
   close, `loop` goes on; «ok, stop» → commit, close, `loop` ends; anything else is feedback on the change.
   `auto`: no wait, the show goes into the report. Extension points: **Implement**, **Verify**.
4. Commit through `gh-tasks:commit`; every commit of the task ends with ` (#N)`, never `closes/fixes/resolves` (Q52).
   Extension points: **Commit** (its file-changing steps run before the diff is shown, Q43), **After commit**.
5. Close: after the last commit remove `status:in-progress`, `gh issue close N --reason completed`, no
   comment. Items only a deploy can verify go to an «After release» section and do not block closing.
   Not closing → say «#N left open — reason». Report; `loop` → back to step 1 in the same turn; under `auto`
   the final report lists every commit and every closed or skipped issue. `auto loop` with the whole open
   milestone closed goes on as `release auto` (Q50). Extension point: **Close**.

### `commit`
Approval gate first: never commit without the user's explicit approval of this specific commit, given after
seeing the final changes; «ok» to a plan is not approval. Under `next-task` and `release` the «ok» on the
shown final diff is that approval; under `next-task auto` and `release auto` there is no gate (Q40, Q47). Format from `config.commit.format` (default
`type(scope): subject`), one line, `trailers: false` → exactly one `-m`, no trailers, no AI mentions even if
the system asks. Stage only the task's files by explicit paths. ` (#N)` on every commit of the task, not only
the last one (Q52).

### `release [auto]`
Requires `milestones: true` (Q47). Resumable: `release.mjs status` gives the milestone (the open one, else the
highest closed), the local tag, the tag on GitHub and the release state, and the run goes on from there. Prepare (dirty
tree → stop): open issues — a `status:in-progress` one stops; the others are removed or closed on the user's word →
`## Release` checks and file changes → notes (`## Release notes`, else a sentence and the issues by type) → **gate**:
version, tag, issues, diff, commit message, notes, what follows (`auto`: none) → commit through `gh-tasks:commit` →
`git tag -a` → `release.mjs draft`. Ship: `release.mjs push` with `release.push`, then `## Ship` steps; neither → «push, then run again», stop. Publish: the tag on
GitHub → `release.mjs publish` and `milestone.mjs close` (`publishedBy: "ci"`: neither). Then `## After release`
and the report. Extension points: **Release**, **Release notes**, **Ship**, **After release**.

## 6. Config: `.claude/gh-tasks/config.json`

```jsonc
{
  "repo": "owner/name",                 // optional; default: parsed from `git remote get-url origin`
  "language": "en",                     // language of issues, milestones, comments; chat follows the user
  "milestones": true,                   // false: no plan-version, next-task orders by labels
  "version": { "scheme": "patch" },     // or "minor", or { "scheme": "command", "command": "node tools/release/release.mjs next-version" }
  "checks": ["npm run lint", "npx tsc --noEmit", "npm test"],
  "commit": {
    "format": "type(scope): subject",   // human-readable pattern shown to the model
    "example": "fix(cart): keep layout stable on mobile",
    "types": ["feat", "fix", "test", "build", "docs", "chore"],
    "trailers": false
  },
  "issueTemplate": { "extraLines": [] }, // e.g. ["**Who is affected:** <customers | staff> — where they see it"]
  "release": {
    "tag": "v{version}",                // {version} = X.Y.Z; false: no tag
    "githubRelease": false,             // true: draft + publish a GitHub Release; needs a tag
    "publishedBy": "skill",            // "ci": the project's CI publishes the release and closes the milestone
    "push": false                      // true: release pushes the branch and the tag over HTTPS, never force
  }
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
| `## Release` | release | before the release gate | `release.mjs preflight` (secrets and env), open issues stay in the milestone |
| `## Release notes` | release | while writing the notes | the sections, «⚠️ What to do», the `Changes` link |
| `## Ship` | release | after the tag and the draft | `release.mjs ship`: push over HTTPS, the tag push deploys |
| `## After release` | release | once the release is out | wait for the deploy, production checks, `.claude/local/tasks.md` cleanup |

## 8. Labels, markers, lifecycle

Labels (names fixed, descriptions in English, colours as in prosportcards `labels.mjs`):
`status:inbox`, `status:in-progress`; `type:bug|feature|wish|ops`; `prio:critical|major|normal|minor|backlog`;
`size:s|m|l`. Exactly one status (or none for a triaged free task), one type, one priority, one size.
`prio:backlog` is set only by the user. Rename map for projects coming from older schemes (`bug → type:bug`
etc., Q34) is applied only when the target does not exist yet; both existing is a conflict for the user to resolve.

Lifecycle: `status:inbox` or no labels → triage → free → `next-task` sets `status:in-progress` → commit(s)
with `(#N)` → closed `completed` right after the last commit. Closed in an open milestone = waiting for a
release; a closed milestone = released. Only `release` closes a milestone, when the user runs it (Q47) or `next-task auto loop` goes on into it (Q50),
or the project's CI does with `publishedBy: "ci"`.

Markers (HTML comments, language-independent, preserved on every rewrite):
- `<!-- gh-tasks:open-questions -->` — the body has open questions for the user; `next-task` takes such tasks
  last, `next-task auto` skips them, `next-task auto loop` decides them and drops the marker.
- `<!-- gh-tasks:original -->` — wraps the untouched original body inside `<details>` after a rewrite.
- `<!-- gh-tasks:after-release -->` — the checklist that only a deploy can verify; the `release` report lists its
  unchecked items for the issues of the release.
- Any foreign HTML comment (e.g. `<!-- tg-issue … -->`) is kept verbatim.

Issue body template (headings translated to the project language): **What** (+ `extraLines`), **Where**,
**Done when** (checkboxes), **Notes** (hypothesis, risks, open questions), **Original message** (details).
Title: imperative, specific, ≤ 70 characters.

Milestone description template: theme in one sentence + agreed date; progress note; «order is top-down»
note; groups (Core → Quick → If time remains → Waits for the user) with one line per task saying what and
why here; then «Deliberately not in this release», «Next, by themes», «Hard dependencies».

## 9. `setup [auto]` flow

`auto`: Q39.

1. Repo from `git remote`; `gh.mjs accounts` — no `gh` or no login → stop; the account in use (configured, else
   active) cannot see the repo → another login that can is the proposed account, none can → stop with its own
   message; existing `.claude/gh-tasks/config.json` → update mode.
2. Questions, one block: milestones yes/no; version scheme (`patch`, `minor` or a command; `minor` brings its `rules.md` steps); language; checks
   (proposed from `package.json` scripts, each run once with its time and result shown; a heavy one is flagged
   with a cheaper variant such as `tsc --noEmit` or `vitest run --changed`); release (`release.tag`, `release.githubRelease`, `release.publishedBy`, `release.push` — proposed `true` unless `## Ship` keeps its own push; Q47, Q51); commit format (proposed from the last ~30 `git log` subjects:
   detected convention, or conventional commits if none, with suggested improvements); existing project
   `commit` skill → absorb and delete, or keep (Q31); gh account when `gh.mjs accounts` lists more than one login
   (Q42) — written to `config.local.json` before the labels, and the file is added to `.gitignore`.
3. Permissions: show the block and, after confirmation, merge into the project `.claude/settings.json`:
   allow `Bash(gh issue *)`, `Bash(gh label *)`, `Bash(gh search issues *)`, the plugin scripts (`gh.mjs` and
   `release.mjs` included); deny
   `Bash(gh api *)`, `gh repo *`, `gh pr *`, `gh workflow *`, `gh secret *`, `gh variable *`, `gh auth *`.
   Both `Bash(...)` and `PowerShell(...)` forms on Windows. Why deny `gh api`: the `gh auth` token can do
   anything through it, and a permission rule cannot narrow it; `milestone.mjs` and `release.mjs` are the only doors
   (Q49), with the path built as `repos/<repo>/milestones[/<n>]` and the method from `GET/POST/PATCH`. `${CLAUDE_PLUGIN_ROOT}` is
   not substituted in `settings.json` and the cache path changes with every version, so the script rules are
   patterns: `Bash(node *gh-tasks*/scripts/<name>.mjs*)`. Because `gh auth *` is denied, skills check `gh` through
   `gh.mjs` (`accounts`, `label list --limit 1`), not `gh auth status`. Then the permissions for the commands the
   `rules.md` steps run, after their own confirmation (Q45).
4. Labels: `gh.mjs label list --limit 1` as the chosen account (a failure stops); `labels.mjs apply --dry-run` → show the plan and ask which foreign labels to delete (all / some /
   none) → `labels.mjs apply [--delete <names>]`: renames where safe, create/update ours, delete only the names
   the user chose (Q33, Q34).
5. Write `config.json`, a `rules.md` skeleton with the thirteen headings (in update mode `## Close version` is
   renamed `## Release`) and one-line hints, and a short
   paragraph into the project `CLAUDE.md` («Tasks live in GitHub Issues, workflow by the gh-tasks plugin;
   config in `.claude/gh-tasks/`; a task created from chat gets `status:inbox` and is created through the plugin's
   `gh.mjs`», Q30).
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
| Slots: lock branch, skip neighbours, rebase + ff-merge, `slot.mjs info/sync` | `## Pick` (this session's in-progress issue: the current branch `task/N`; claim: `git branch task/N main` before the label — Q46), `## After commit` (later: a slots plugin) |
| `.claude/local/tasks.md` | `## Plan`, `## Close` |
| `curl localhost:3000`, playwright, `rules-reviewer`, slot port | `## Verify` |
| `db/schema.sql`, `db-once/` | `## Implement` |
| `capture-knowledge` | `## Close` |
| Release size reference, «waits for the owner» group | `## Plan version` |
| `/release`: preflight, notes format, `ship`, prod checks | `release` skill: `## Release`, `## Release notes`, `## Ship`, `## After release` |
| CI publishing the release and closing the milestone, Telegram release posts | `release.publishedBy: "ci"`; the CI stays in the project |
| Russian texts | `language: "ru"` |

Everything maps; the only core change the migration needs is Q46: `## Pick` decides which in-progress issues
are this session's and how a task is claimed.

## 12. Roadmap (milestones of this repository)

- **v0.1.0** — skeleton: manifest, marketplace, `package.json`, ESLint, `config.mjs` with schema and tests,
  `labels.mjs`, `milestone.mjs` (incl. `next-version`), `setup` skill. Dogfooding starts here: `setup` run on
  this repository, labels created, first milestone.
- **v0.2.0** — `triage` and `plan-version`, templates, `docs/extension-points.md`.
- **v0.3.0** — `next-task` with `plan`/`auto`/`loop`, `commit`.
- **v1.0.0** — README with install and usage, CHANGELOG, `claude plugin validate` clean, a full cycle
  (setup → triage → plan-version → next-task → commit → close) run on this repository from the GitHub
  marketplace.
- **v2.0.0** — `release` replaces `close-version`: tag, GitHub Release, ship and after-release extension points.
- Later: prosportcards migration (its own task in prosportcards), a `slots` plugin.

Definition of done for v1: a fresh repository with issues gets the full cycle working with only
`/plugin install gh-tasks@gh-tasks` and `/gh-tasks:setup`, with no edits to the plugin.
