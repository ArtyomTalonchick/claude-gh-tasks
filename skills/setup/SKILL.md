---
name: setup
description: Initialise or update a project for the gh-tasks workflow — config, labels, rules skeleton, CLAUDE.md note and permissions. Run by the user as /gh-tasks:setup; other gh-tasks skills point here when the config is missing or invalid.
disable-model-invocation: true
argument-hint: "[auto]"
allowed-tools: >-
  Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" *)
  Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/labels.mjs" *)
  Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/milestone.mjs" *)
  PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" *)
  PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/labels.mjs" *)
  PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/milestone.mjs" *)
  Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" *)
  PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" *)
  Bash(gh label list *) PowerShell(gh label list *)
  Bash(git log *) PowerShell(git log *)
  Bash(git remote get-url *) PowerShell(git remote get-url *)
---

# gh-tasks setup

Prepares the project at `${CLAUDE_PROJECT_DIR}` for the gh-tasks workflow. Re-runnable: it only adds or updates,
and never removes anything without the user's explicit word.

Arguments: `$ARGUMENTS` — optional `auto`. With `auto` the skill asks nothing and takes every proposed value; it
still never deletes, never invents what only the user knows, and never touches the remote. The steps below say
what `auto` changes.

Run the plugin scripts exactly as written below, quotes included —
`node "${CLAUDE_PLUGIN_ROOT}/scripts/<name>.mjs" … --project "${CLAUDE_PROJECT_DIR}"` — so they match the allowed
tools and survive paths with spaces. Talk to the user in their language; files in GitHub use the project language
chosen in step 2.

## 1. Preconditions

1. `gh label list --limit 1` (not `gh auth status`: the permissions of step 5 deny `gh auth *`). No `gh` →
   «GitHub CLI is not installed: https://cli.github.com», stop. Not logged in → «Run `gh auth login` first», stop.
2. `git remote get-url origin` must point to GitHub. No remote → «Add a GitHub remote (`origin`) or set `repo` in
   `.claude/gh-tasks/config.json`», stop.
3. `.claude/gh-tasks/config.json` exists → **update mode**: run
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" check --project "${CLAUDE_PROJECT_DIR}"` and use its output as the
   current values. An invalid config is not a stop here: show the errors and fix them through the questions,
   and write the fixed `config.json` (step 4.1) before step 3 — `labels.mjs` refuses an invalid config.
   `auto`: fix each error with the proposed value of step 2 when it is unambiguous; otherwise show the errors and
   stop.

## 2. Questions — one message

Collect the facts first, then ask everything in one block, each question with a proposed answer (in update mode
the current value), so the user can reply «ok» or change single items:

- **Milestones** — plan releases as GitHub milestones? Default: yes.
- **Version scheme** (only with milestones) — `patch` (next version = highest `vX.Y.Z` milestone + 1 on patch) or
  a project command that prints the next version on its first stdout line. The command runs without a shell from
  the project root; on Windows it must start with an executable such as `node`, not `npm run`.
  Milestone titles are always `vX.Y.Z`.
- **Language** of issues, milestones and comments — propose the language of recent issues and commits.
- **Checks** — commands run before showing a change; propose them from `package.json` scripts (lint, type check,
  test). None found → propose an empty list; never invent commands.
- **Commit format** — read the last ~30 subjects (`git log -30 --format=%s`). A visible convention → propose it
  with a real example from the log and the types it uses; none → conventional commits `type(scope): subject`.
  Suggest improvements only if they are small and clear. Trailers stay off unless the user asks.
- **Project commit skill** — only if `.claude/skills/commit/` exists: absorb its format rules into
  `config.commit` and delete it, or keep it (gh-tasks still commits only through `gh-tasks:commit`).
- **Issue template extra lines** — only if the project obviously needs one (e.g. «who is affected»); else skip.
- **Account** — the gh account the plugin acts as in this project, for this user only. Run
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" accounts --project "${CLAUDE_PROJECT_DIR}"`: it lists the logged-in
  logins, marks the active one and prints the configured one. Ask only when more than one login is listed or one
  is configured; propose the configured login, else the active one. «none» → the active account is used.

`auto`: send no questions; take each proposed answer (in update mode the current value). A project commit skill
is kept; issue template extra lines are skipped.

## 3. Labels

1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/labels.mjs" apply --project "${CLAUDE_PROJECT_DIR}" --dry-run`
2. Show the plan: renames, creates, updates, conflicts, foreign labels. Ask which foreign labels to delete —
   all, some or none — and warn that deleting a label removes it from every issue that has it. A conflict
   (old and new name both exist) is resolved by the user: move the issues, then the old label may be deleted.
3. After «yes»: `node "${CLAUDE_PLUGIN_ROOT}/scripts/labels.mjs" apply --project "${CLAUDE_PROJECT_DIR}"` with one
   `--delete <name>` per label the user named (quote names with spaces). Never pass a name the user did not give.

`auto`: skip the dry run and the question; run `apply` without `--delete`. Foreign labels and conflicts go to the
report.

## 4. Project files

1. **`.claude/gh-tasks/config.json`** — write every field the user answered in step 2 explicitly (`language`,
   `milestones`, `version`, `checks`, `commit`), so the file documents the project's choices; add `repo` only if
   it differs from `origin` and `issueTemplate` only with extra lines. Plain JSON, two-space indent. In update
   mode keep fields the questions did not touch.
2. **`.claude/gh-tasks/config.local.json`** — only when the Account question was asked: `{ "account": "<login>" }`,
   or no `account` field for «none». Write it right after the answers, before step 3, so the labels are applied as
   that account. Make sure the project `.gitignore` (created if missing) has the line
   `.claude/gh-tasks/config.local.json`: the login is per user and is never committed.
3. **`.claude/gh-tasks/rules.md`** — create only if missing; never overwrite. Skeleton:

   ```markdown
   # gh-tasks rules

   Project additions to the gh-tasks skills. Each heading is read at a fixed moment; an empty or missing
   heading is skipped. Content may be in any language.

   ## Pick
   <!-- next-task, before taking a task: what to skip, locks, size limits -->

   ## Plan
   <!-- next-task, after reading the issue: where to look, notes to read -->

   ## Implement
   <!-- next-task, before coding: project rules, schema or migration conventions -->

   ## Verify
   <!-- next-task, after checks and before showing: manual checks, reviewers, local URLs -->

   ## Commit
   <!-- commit, before committing: anything beyond config.commit -->

   ## After commit
   <!-- next-task, after each commit: syncs, merges -->

   ## Close
   <!-- next-task, after closing: notes to update, knowledge to capture -->

   ## Triage
   <!-- triage, while rewriting a body: markers to keep, comment conventions, extra line semantics -->

   ## Plan version
   <!-- plan-version, while choosing scope: release size, themes, groups -->
   ```

   In update mode with an existing file: add any missing headings at the end, leave the rest untouched.
4. **Project `CLAUDE.md`** — this paragraph, once:
   «Tasks live in GitHub Issues; the workflow is run by the gh-tasks plugin (`/gh-tasks:triage`,
   `/gh-tasks:plan-version`, `/gh-tasks:next-task`). Config and project rules: `.claude/gh-tasks/`. A task
   created from chat gets the `status:inbox` label and is created through the `scripts/gh.mjs` of the installed
   gh-tasks plugin (under `~/.claude/plugins/cache/gh-tasks/`):
   `node <plugin>/scripts/gh.mjs --project <project root> issue create --label status:inbox …`, so it is written as
   the project's gh account.» Write it in the language the file already uses. A paragraph mentioning `gh-tasks` that
   already names `gh.mjs` → leave it; one that does not → replace that paragraph, never append a second one.
5. Validate: `node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" check --project "${CLAUDE_PROJECT_DIR}"`. An error is
   fixed now, not reported as done.

## 5. Permissions

Show this block, and after the user confirms merge it into the project `.claude/settings.json`: add missing
entries, never remove or reorder existing ones, keep the rest of the file as is. A missing entry goes right after
the existing entry that precedes it in the block; none exists → at the end of its list.

```json
{
  "permissions": {
    "allow": [
      "Bash(gh issue *)", "Bash(gh label *)", "Bash(gh search issues *)",
      "Bash(node *gh-tasks*/scripts/config.mjs*)", "Bash(node *gh-tasks*/scripts/labels.mjs*)",
      "Bash(node *gh-tasks*/scripts/milestone.mjs*)", "Bash(node *gh-tasks*/scripts/gh.mjs*)",
      "PowerShell(gh issue *)", "PowerShell(gh label *)", "PowerShell(gh search issues *)",
      "PowerShell(node *gh-tasks*/scripts/config.mjs*)", "PowerShell(node *gh-tasks*/scripts/labels.mjs*)",
      "PowerShell(node *gh-tasks*/scripts/milestone.mjs*)", "PowerShell(node *gh-tasks*/scripts/gh.mjs*)"
    ],
    "deny": [
      "Bash(gh api *)", "Bash(gh repo *)", "Bash(gh pr *)", "Bash(gh workflow *)",
      "Bash(gh secret *)", "Bash(gh variable *)", "Bash(gh auth *)",
      "PowerShell(gh api *)", "PowerShell(gh repo *)", "PowerShell(gh pr *)", "PowerShell(gh workflow *)",
      "PowerShell(gh secret *)", "PowerShell(gh variable *)", "PowerShell(gh auth *)"
    ]
  }
}
```

The `PowerShell(...)` entries are for Windows; on other systems offer only the `Bash(...)` ones. Explain the deny
of `gh api` in one line: its token can do anything and a rule cannot narrow it; milestones go through
`milestone.mjs`, which only reaches `repos/<repo>/milestones`. `gh.mjs` runs only `gh issue`, `gh label` and
`gh search issues`, as the configured account, so allowing it opens nothing the deny list closes.

Also check that `enabledPlugins` in the same file contains `"gh-tasks@gh-tasks": true`; if the plugin was installed
in another scope, offer to add it so the project carries the plugin for everyone who clones it.

`auto`: merge the block and add `enabledPlugins` without asking.

## 6. Report

Short list: what was created or changed (labels, files, settings), what the user should review (`config.json`,
`rules.md`), what was left as is.

With milestones on and no open milestone, offer to create the first one: run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/milestone.mjs" next-version --project "${CLAUDE_PROJECT_DIR}"`; exit code 2 means
no `vX.Y.Z` milestone exists yet — ask the user for the first version. After the user confirms the title, run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/milestone.mjs" create --project "${CLAUDE_PROJECT_DIR}" --title <vX.Y.Z>`.
This step is optional; skip it on «no».

`auto`: the report also lists every value taken in step 2 and the foreign labels and conflicts left in place, so
the user can correct them with another `/gh-tasks:setup`. The first milestone is created without asking, titled
by `next-version`; exit code 2 still asks the user for the first version.

End with the next command: `/gh-tasks:triage` when there are untriaged issues, otherwise `/gh-tasks:plan-version`
when milestones are on and none is open, otherwise `/gh-tasks:next-task`.
