---
name: next-task
description: Take the next GitHub issue through pick, plan, code, checks, commit and close — in the open milestone's order, or by priority, type and age; `auto loop` closes and releases the whole milestone on its own. Run as /gh-tasks:next-task [plan] [auto] [loop] [#N | bug | feature | ops | wish].
argument-hint: "[plan] [auto] [loop] [#N | bug | feature | ops | wish]"
allowed-tools: >-
  Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" *)
  Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/milestone.mjs" *)
  Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/release.mjs" *)
  PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" *)
  PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/milestone.mjs" *)
  PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/release.mjs" *)
  Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" *)
  PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" *)
  Bash(git status *) PowerShell(git status *)
  Bash(git diff *) PowerShell(git diff *)
  Bash(git log *) PowerShell(git log *)
  Bash(git tag *) PowerShell(git tag *)
---

# gh-tasks next-task

Arguments: `$ARGUMENTS` — any of `plan`, `auto`, `loop`, plus at most one of `#N` or a type word (`bug`,
`feature`, `ops`, `wish`).

Run the plugin scripts exactly as written, quotes included:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/milestone.mjs" <command> --project "${CLAUDE_PROJECT_DIR}" …`. Talk to the user in
their language; everything written to GitHub is in `config.language`.

Every other GitHub call goes through `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}"`,
written exactly as below, never plain `gh`: the wrapper runs as the project's gh account.

## Gates

| Run | Plan gate | Diff gate |
|---|---|---|
| default | only when there are questions | always |
| `plan` | always | always |
| `auto` | none | none |
| `plan auto` | always | none |

A gate means: show, then wait for the user's «ok»; write nothing the gate covers before it. `## Plan` in `rules.md`
may ask for the plan gate in more cases.

Under `auto`, the open questions of an issue given as `#N` are still asked in chat and waited for (step 3); the
gates stay off.

`auto` never deletes, never closes an issue other than the one it has just committed, never invents what only the
user knows and never touches the remote.

### `auto loop`

Both words together close the open milestone and release it without the user:

- **Subagents.** Each task's plan and code (steps 3–4.3) run in a general-purpose subagent, so the chat holds only
  short summaries. Its prompt: the issue number, `checks`, the `## Plan`, `## Implement` and `## Verify` rules,
  and what it must return — the files, a short diff summary, each check's result, the proposed commit message, the
  decisions it made on open questions, and the items only a deploy can verify (step 5.3). It never commits, never edits issues or labels and never touches the
  remote. A question it cannot decide → it writes no code and returns the question. Checks still failing after
  3 attempts → it returns the failure. The main thread does the rest: pick, claim, the questions in the body,
  `## Commit` steps, commit, close, report.
- **Open questions are decided, not skipped.** A body with `<!-- gh-tasks:open-questions -->` is taken (still
  last in the order). Each question gets the most reasonable answer the issue, comments and code support; the
  answers replace the open-questions list in the body under **Notes** as «Decided: …» lines, the marker removed,
  and go into the report. Only what the agent cannot know — a secret, a credential, an account, a payment, an
  access — still skips the task the `auto` way (step 3). `type:ops` is still skipped.
- **Release.** The loop has ended with «No tasks left», `milestones` is on, and `milestone.mjs show` lists no open
  issue in the open milestone → follow `${CLAUDE_PLUGIN_ROOT}/skills/release/SKILL.md` with `auto`, in the same
  turn. Any issue left open (skipped, failing checks) → no release; the report says which ones and why.

`auto` without `loop`, an issue given as `#N`, and `loop` without `auto` keep the rules above.

## 1. Config

`node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" check --project "${CLAUDE_PROJECT_DIR}"`. Non-zero exit → show the
errors, say «Run `/gh-tasks:setup` first», stop. Keep `milestones`, `checks` and `language` from the printed config.

`auto` with no `checks` → «`auto` commits without review only after checks pass, and none are configured», stop.

Read `${CLAUDE_PROJECT_DIR}/.claude/gh-tasks/rules.md` once; each step below follows its own heading. A missing file or
heading is skipped silently.

## 2. Pick

Follow `## Pick`.

1. **Unfinished work.**
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}" issue list --state open --label status:in-progress --json number,title`
   and `git status --short`. `## Pick` may say which in-progress issues are this session's (e.g. the issue of the
   current branch `task/N`): the others belong to parallel sessions and are left out. Either is non-empty → show it
   and ask: continue that task (go to step 3 with it) or start a new one. `auto` → say what was found and stop.
2. **`#N` given** → that issue. Closed → say so, stop. Untriaged (`status:inbox`, or missing a `type:*`, `prio:*`
   or `size:*` label) → run the `gh-tasks:triage` skill with `#N` (`auto #N` under `auto`) first; it was closed as a
   duplicate or «not doing» → stop.
3. **Otherwise**
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}" issue list --state open --limit 200 --json number,title,labels,milestone,body,createdAt`.
   Candidates: no `status:*` label, all of `type:*`, `prio:*`, `size:*`, not `prio:backlog`; a type word keeps only
   that `type:*`. Order:
   - `milestones: true`: `milestone.mjs list`. An open milestone → `milestone.mjs show --title <it>`: its
     description top-down, then its other open issues, then the rest by labels below. No open milestone → say so
     and offer `/gh-tasks:plan-version`; order by labels only on the user's word (`auto`: by labels, and say so).
   - `milestones: false`, or the rest: `prio:critical → major → normal → minor`, then
     `type:bug → feature → ops → wish`, then older first.
   - A body with `<!-- gh-tasks:open-questions -->` goes last; `auto` skips it (`auto loop` takes it).
   - `auto` skips `type:ops`: its work is done by the user (step 3).

   Nothing left → «No tasks left», stop.
4. **Claim.** `## Pick` may say how a task is claimed, e.g. a lock taken before the label (`git branch task/N main`).
   The lock fails → another session has the task: skip it and claim the next candidate (`#N` given → say so, stop).
   Then
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}" issue edit N --add-label status:in-progress`.
   Milestones on, an open milestone exists and the issue is not in it →
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}" issue edit N --milestone <it>` and say
   the scope of the release grew.
5. **Show** what was taken and why, and the next two candidates.

## 3. Plan

Follow `## Plan`.

1. `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}" issue view N --comments`;
   comments are part of the request. Read the code the issue points to; for a search wider than a few files, use an
   Explore agent and keep only its conclusion.
2. **Questions** — open questions in the body, or anything only the user can decide:
   - without `auto`, or an issue given as `#N` → ask them in chat, one line each, and wait; the label stays. Answers
     that change the scope go into the body (rewrite as in step 7 of `${CLAUDE_PLUGIN_ROOT}/skills/triage/SKILL.md`,
     the open-questions list shortened to what is still open). Under `auto` the rest of the run keeps its gates;
   - `auto loop` → decide them (see `auto loop`); what only the user can know goes on as below;
   - `auto`, an issue not given by number → write them into the body under `<!-- gh-tasks:open-questions -->`, then
     `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}" issue edit N --remove-label status:in-progress`,
     note the issue as skipped and go back to step 2.
3. **`type:ops`** — the work is not code: write a checklist of the steps into the body under **Done when**, show it,
   and leave the issue open for the user; skip steps 4–5 and report «#N left open — the checklist is for you».
4. **Plan gate** (see Gates) → show the plan: files, what changes in each, how it is checked; wait for «ok». No gate
   → plan silently and go on.

## 4. Implement

Under `auto loop`, steps 3 and 4.1–4.3 run in the task's subagent (see `auto loop`).

1. Follow `## Implement`, then write the change.
2. **Checks.** Run each command of `checks` in the project root. None configured → say so. A failure → fix and
   rerun all checks. Still failing after 3 attempts → stop: show the failure, leave the change uncommitted and the
   issue `status:in-progress`, report «#N left open — checks fail», end `loop`.
3. Follow `## Verify`.
4. Run the steps of `rules.md → ## Commit` that change files, as the `gh-tasks:commit` skill describes, so the
   diff below includes their files.
5. **Show** the files (`git status --short`), a short summary of the diff, the result of each check and the
   proposed commit message.
6. **Diff gate** (see Gates) → wait:
   - «ok» → step 5, then `loop` goes on;
   - «ok, stop» → step 5, then `loop` ends;
   - anything else → feedback on the change: apply it, back to 2.

   No gate (`auto`) → go on; the show becomes part of the report.

## 5. Commit and close

1. Run the `gh-tasks:commit` skill with `#N`; the subject ends with ` (#N)`. Under `auto` its gate is off; otherwise
   the «ok» of step 4 is the approval. A task may need more than one commit; only the last one closes it.
2. Follow `## After commit`.
3. Items only a deploy can verify → put them in the body under `<!-- gh-tasks:after-release -->` as an «After
   release» checklist; they do not block closing.
4. `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}" issue edit N --remove-label status:in-progress`,
   then `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}" issue close N --reason completed`.
   No comment. Not closing → say «#N left open — reason».
5. Follow `## Close`.

## 6. Report

The commit (`git log --oneline -1`), the closed issue, anything left open with its reason. Never push: when the work
is ready to leave the machine, say so.

`loop` → back to step 2 in the same turn, until no task is left, «ok, stop», or a stop above. `auto loop` → then
the release (see `auto loop`).

Under `auto` the final report lists every commit with its diff summary and checks, every closed issue and every
skipped one with its questions; `auto loop` adds every decision taken on open questions and the release report, or
why there was no release.
