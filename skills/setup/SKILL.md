---
name: setup
description: Initialise or update a project for the gh-tasks workflow — config, permissions, labels, rules skeleton and CLAUDE.md note. Run by the user as /gh-tasks:setup; other gh-tasks skills point here when the config is missing or invalid.
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
  Bash(git log *) PowerShell(git log *)
  Bash(git tag --list *) PowerShell(git tag --list *)
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

1. `git remote get-url origin` must point to GitHub. No remote → «Add a GitHub remote (`origin`) or set `repo` in
   `.claude/gh-tasks/config.json`», stop.
2. `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" accounts --project "${CLAUDE_PROJECT_DIR}"` — it lists the
   logged-in logins, marks the active one, says whether each can see the repository and prints the configured
   login. `gh not found` → «GitHub CLI is not installed: https://cli.github.com», stop. No account → «Run
   `gh auth login` first», stop. The account in use is the configured login, else the active one. It cannot see the
   repository:
   - another listed login can → that login is the proposed answer to the Account question of step 2; say that the
     account in use cannot see the repository;
   - no login can → «No logged-in gh account can see <repo>: check the remote (or `repo` in the config), or run
     `gh auth login` with an account that has access», stop.
3. `.claude/gh-tasks/config.json` exists → **update mode**: run
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" check --project "${CLAUDE_PROJECT_DIR}"` and use its output as the
   current values. An invalid config is not a stop here: show the errors and fix them through the questions,
   and write the fixed `config.json` (step 5.1) before step 4 — `labels.mjs` refuses an invalid config.
   `auto`: fix each error with the proposed value of step 2 when it is unambiguous; otherwise show the errors and
   stop.

## 2. Questions — one message

Collect the facts first, then ask everything in one block, each question with a proposed answer (in update mode
the current value), so the user can reply «ok» or change single items:

- **Milestones** — plan releases as GitHub milestones? Default: yes.
- **Version scheme** (only with milestones) — `patch` (next version = highest release milestone + 1 on patch,
  titled `vX.Y.Z`), `minor` (+ 1 on minor, titled `vX.Y`) or a project command that prints the next version on its
  first stdout line. The command runs without a shell from the project root; on Windows it must start with an
  executable such as `node`, not `npm run`. Milestone titles are `vX.Y.Z` or `vX.Y` (= `vX.Y.0`). Propose `minor` when
  `package.json` has a `version` or `git tag --list "v*.*.0"` shows release tags, else `patch`.
  With `minor`, the manifest version and the tag are project steps, proposed with the question and written to
  `rules.md` in step 5: under `## Commit` «Bump the patch: `npm version patch --no-git-tag-version`; its files go
  into the commit», under `## Close version` «Set the version: `npm version X.Y.0 --no-git-tag-version`. After the
  commit: `git tag vX.Y.0`». No `package.json` → the same steps without a command; the user names it or drops
  the step. A heading that already holds a version step keeps it and gets nothing.
- **Language** of issues, milestones and comments — propose the language of recent issues and commits.
- **Checks** — commands run before showing a change; propose them from `package.json` scripts (lint, type check,
  test). None found → propose an empty list; never invent commands. Run each proposed check once in the project
  root and show its time and result with the question: a failure (missing dependencies, a broken script) is
  named before anything is written. A heavy check — a full build, a full test run that takes long — is flagged
  with a cheaper variant the project's tools offer: `tsc --noEmit` or `tsc -b` instead of a build,
  `vitest run --changed`, `jest --onlyChanged`.
- **Commit format** — read the last ~30 subjects (`git log -30 --format=%s`). A visible convention → propose it
  with a real example from the log and the types it uses; none → conventional commits `type(scope): subject`.
  Suggest improvements only if they are small and clear. Trailers stay off unless the user asks.
- **Project commit skill** — only if `.claude/skills/commit/` exists: absorb it and delete it, or keep it (gh-tasks
  still commits only through `gh-tasks:commit`). Absorbing splits it: the format goes to `config.commit`, every
  other step (bump a version, create a tag, files never committed…) goes to `rules.md → ## Commit`. With the
  question, show each step of the skill and where it goes; nothing of the skill is dropped.
- **Issue template extra lines** — only if the project obviously needs one (e.g. «who is affected»); else skip.
- **Account** — the gh account the plugin acts as in this project, for this user only, from the `accounts` output
  of step 1. Ask only when more than one login is listed or one is configured; propose the login step 1 chose
  when the account in use cannot see the repository, else the configured login, else the active one. «none» → the
  active account is used.

`auto`: send no questions; take each proposed answer (in update mode the current value); the checks still run
once, and their times, failures and cheaper variants go to the report. A project commit skill is kept; issue
template extra lines are skipped.

## 3. Permissions

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

**Rule commands.** The steps under the headings of `rules.md` (the existing file plus the steps of a project commit
skill being absorbed, and the version steps of a `minor` scheme) may run shell commands — `npm version patch`, `git tag v1.2.3`, the release steps under
`## Close version` — and every such call asks for permission. List one rule per command and subcommand, `Bash(npm version *)`, `Bash(git tag *)` (and the
`PowerShell(...)` twins on Windows), each with the heading it comes from. Leave out a command already allowed, one
the deny list above matches, and one that reaches the git remote (`git push`, `fetch`, `pull`). The user confirms
the list or drops items; the rest is merged into `allow` by the same rules as the block above. No commands → say
nothing.

`auto`: merge the block and add `enabledPlugins` without asking; the rule commands are not merged, only listed in
the report.

## 4. Labels

1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}" label list --limit 1` — gh reaches
   the repository as the chosen account. A failure → show gh's error, stop.
2. `node "${CLAUDE_PLUGIN_ROOT}/scripts/labels.mjs" apply --project "${CLAUDE_PROJECT_DIR}" --dry-run`
3. Show the plan: renames, creates, updates, conflicts, foreign labels. Ask which foreign labels to delete —
   all, some or none — and warn that deleting a label removes it from every issue that has it. A conflict
   (old and new name both exist) is resolved by the user: move the issues, then the old label may be deleted.
4. After «yes»: `node "${CLAUDE_PLUGIN_ROOT}/scripts/labels.mjs" apply --project "${CLAUDE_PROJECT_DIR}"` with one
   `--delete <name>` per label the user named (quote names with spaces). Never pass a name the user did not give.

`auto`: run the check of item 1, skip the dry run and the question; run `apply` without `--delete`. Foreign labels
and conflicts go to the report.

## 5. Project files

1. **`.claude/gh-tasks/config.json`** — write every field the user answered in step 2 explicitly (`language`,
   `milestones`, `version`, `checks`, `commit`), so the file documents the project's choices; add `repo` only if
   it differs from `origin` and `issueTemplate` only with extra lines. Plain JSON, two-space indent. In update
   mode keep fields the questions did not touch.
2. **`.claude/gh-tasks/config.local.json`** — only when the Account question was asked: `{ "account": "<login>" }`,
   or no `account` field for «none». Write it right after the answers, before step 4, so the labels are applied as
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

   ## Close version
   <!-- close-version, before the release commit: version bump, changelog, steps after the commit -->
   ```

   In update mode with an existing file: add any missing headings at the end, leave the rest untouched.
   The version steps of a `minor` scheme the user accepted in step 2: append each under its heading.
   An absorbed commit skill: append its non-format steps under `## Commit`, after what is already there. Delete
   the skill only after `config.json` and `rules.md` hold what it held.
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

## 6. Report

Short list: what was created or changed (labels, files, settings), what the user should review (`config.json`,
`rules.md`), what was left as is.

With milestones on and no open milestone, offer to create the first one: run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/milestone.mjs" next-version --project "${CLAUDE_PROJECT_DIR}"`; exit code 2 means
no release milestone exists yet — ask the user for the first version. After the user confirms the title, run
`node "${CLAUDE_PLUGIN_ROOT}/scripts/milestone.mjs" create --project "${CLAUDE_PROJECT_DIR}" --title <title>`.
This step is optional; skip it on «no».

`auto`: the report also lists every value taken in step 2, the foreign labels and conflicts left in place and the
rule-command permissions not merged, so the user can correct them with another `/gh-tasks:setup`. The first milestone is created without asking, titled
by `next-version`; exit code 2 still asks the user for the first version.

End with the next command: `/gh-tasks:triage` when there are untriaged issues, otherwise `/gh-tasks:plan-version`
when milestones are on and none is open, otherwise `/gh-tasks:next-task`.
