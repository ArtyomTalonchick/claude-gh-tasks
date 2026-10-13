---
name: plan-version
description: Plan the next release as a GitHub milestone — pick and order the open issues, write the milestone description, assign the issues. Run as /gh-tasks:plan-version [auto]; needs milestones on in the gh-tasks config.
argument-hint: "[auto]"
allowed-tools: >-
  Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" *)
  Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/milestone.mjs" *)
  PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" *)
  PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/milestone.mjs" *)
  Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" *)
  PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" *)
---

# gh-tasks plan-version

Arguments: `$ARGUMENTS` — optional `auto`.

Run the plugin scripts exactly as written, quotes included:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/milestone.mjs" <command> --project "${CLAUDE_PROJECT_DIR}" …`. Talk to the user in
their language; the milestone description, titles and comments are in `config.language`.

Every other GitHub call goes through `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}"`,
written exactly as below, never plain `gh`: the wrapper runs as the project's gh account.

## 1. Config

`node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" check --project "${CLAUDE_PROJECT_DIR}"`. Non-zero exit → show the
errors, say «Run `/gh-tasks:setup` first», stop. `milestones: false` → «Milestones are off in this project — use
`/gh-tasks:next-task`», stop.

Read the `## Plan version` section of `${CLAUDE_PROJECT_DIR}/.claude/gh-tasks/rules.md` and follow it while choosing
the scope. A missing file or heading is skipped silently.

## 2. State

`milestone.mjs list`.

- An open milestone → **replan** it: `milestone.mjs show --title <it>` gives its description and issues; the
  version stays.
- No open milestone → the version is the first stdout line of `milestone.mjs next-version`. Exit code 2 → no
  `vX.Y.Z` milestone exists yet: ask the user for the first version, also under `auto`. The user may change the
  version at the gate; it must match `vX.Y.Z` and not exist yet.

## 3. Candidates

`node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}" issue list --state open --limit 200 --json number,title,labels,milestone,body`.
Candidates: open issues with no milestone, plus the issues of the open milestone.

- Untriaged candidates (`status:inbox`, or missing a `type:*`, `prio:*` or `size:*` label) go through steps 2–5 of
  `${CLAUDE_PLUGIN_ROOT}/skills/triage/SKILL.md` first. Without `auto` nothing is written yet: their triage table is
  part of the gate in step 6. With `auto` they are triaged as `triage auto` does.
- Issues closed as completed with no milestone since the previous milestone was closed ship in this release:
  assign them too and list them in the gate under «Already done». Find them with
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}" issue list --state closed --search "no:milestone reason:completed closed:>=<its release time>"`,
  the time as `milestone.mjs list` prints it.
- Always in: `status:in-progress`, `prio:critical`. Always out: `prio:backlog`, issues whose triage outcome is
  «duplicate» or «not doing».

## 4. Carry-over

The most recently closed `vX.Y.Z` milestone: `milestone.mjs show --title <it>`. Its sections «Deliberately not in
this release», «Next, by themes» and «Hard dependencies» are input for the theme and the order. Issues named there
and still open are candidates like any other.

## 5. Scope and order

- One coherent theme, plus small items close to it in code. A release the user can finish; `## Plan version` may
  set the size.
- Batch issues that touch the same code next to each other.
- Dependencies are explicit: a task goes below everything it depends on, and each pair is listed under «Hard
  dependencies».
- Groups, top-down: **Core** (the theme), **Quick** (small items near it), **If time remains**, **Waits for the
  user** (needs an action or an answer only the user can give) last.
- Every candidate left out goes under «Deliberately not in this release» with the reason; themes for later go under
  «Next, by themes».

## 6. Gate

Without `auto`: one message with

- version, theme in one sentence, the agreed date if the user gave one;
- the groups in order, one line per issue: what and why here;
- what is left out and why;
- the triage table of step 3 (#, new title, labels, outcome), if any;
- open questions, one line each.

Write nothing until the user says «yes». The user may change single items; show only what changed and ask again.

With `auto`: no gate; go to step 7. Closing issues proposed by triage is never automatic: ask about them in the
report.

## 7. Write

1. Triaged issues of step 3: write them as step 7 of the triage skill.
2. The description: fill `${CLAUDE_PLUGIN_ROOT}/skills/plan-version/templates/milestone.md`, headings and fixed
   lines translated to `config.language`; drop empty groups and sections. Write it to a temporary file outside the
   project (the session scratch directory or the OS temp directory) with the Write tool, not a shell heredoc.
3. New milestone: `milestone.mjs create --title <vX.Y.Z> --file <file>`, plus `--due <YYYY-MM-DD>` with an agreed
   date. Replan: `milestone.mjs describe --title <vX.Y.Z> --file <file>`.
4. Delete the temporary file.
5. Each issue in the groups:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}" issue edit N --milestone <vX.Y.Z>`.
   Each issue of the open milestone now left out:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}" issue edit N --remove-milestone`.
6. Verify: `milestone.mjs show --title <vX.Y.Z>` lists exactly the issues of the description. GitHub lists issues
   by milestone with a delay of a few seconds: on a mismatch run `show` once more, and only then fix it, not report
   it.

## 8. Report

The milestone link, the number of issues per group, what was left out. Under `auto` also the version, the theme and
every issue with its group, so the user can correct any choice; then the proposed closings, if any, as one question.
End with the next command: `/gh-tasks:next-task`.
