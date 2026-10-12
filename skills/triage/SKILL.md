---
name: triage
description: Turn raw GitHub issues into triaged ones — rewrite the body by the template, set type, priority and size labels, close duplicates and pointless issues. Run as /gh-tasks:triage [auto] [#N]; plan-version and next-task call it for untriaged issues.
argument-hint: "[auto] [#N]"
allowed-tools: >-
  Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" *)
  PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" *)
  Bash(gh issue *) PowerShell(gh issue *)
  Bash(gh search issues *) PowerShell(gh search issues *)
---

# gh-tasks triage

Arguments: `$ARGUMENTS` — optional `auto`, optional `#N`.

Talk to the user in their language; everything written to GitHub (titles, bodies, comments) is in
`config.language`.

## 1. Config

`node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" check --project "${CLAUDE_PROJECT_DIR}"`. Non-zero exit → show the
errors, say «Run `/gh-tasks:setup` first», stop. Otherwise keep the printed config: `language`,
`issueTemplate.extraLines` and `repo` are used below.

Read the `## Triage` section of `${CLAUDE_PROJECT_DIR}/.claude/gh-tasks/rules.md` and follow it while rewriting
bodies. A missing file or heading is skipped silently.

## 2. Select issues

- `#N` given → that issue only, whatever its labels. A closed issue → say so, stop.
- Otherwise: `gh issue list --state open --limit 200 --json number,title,labels`. Untriaged = has
  `status:inbox`, or lacks any `type:*`, `prio:*` or `size:*` label. Skip `status:in-progress`. Oldest first.
  Nothing untriaged → «No untriaged issues», stop.

## 3. Study each issue

1. `gh issue view N --comments`. Comments are part of the request.
2. Find the place in the code: files, modules, screens. For a search wider than a few files, use an Explore agent
   and keep only its conclusion.
3. Look for duplicates: `gh search issues --repo <repo> --state open "<key words>"`, and among the issues of this
   run.

## 4. Choose one outcome

- **Triaged** — the issue stays open:
  - Title: imperative, specific, at most 70 characters.
  - Body by the template `${CLAUDE_PLUGIN_ROOT}/skills/triage/templates/issue-body.md` (section 5).
  - Exactly one label of each group; a label of the same group already on the issue is replaced:
    - type: `type:bug` something is broken; `type:feature` new functionality or an improvement; `type:wish` an
      idea without commitment; `type:ops` not code — settings, external services, content.
    - priority: `prio:critical` blocks users or the main flow; `prio:major` wanted in the next release;
      `prio:normal` the regular queue; `prio:minor` small, when there is time. Never set `prio:backlog` — only the
      user sets it; keep it if it is already there.
    - size: `size:s` under an hour; `size:m` up to half a day; `size:l` a day or more.
  - `status:inbox` removed. Never assign a milestone.
- **Duplicate of #M** — comment in #M with a link to #N and anything #N adds; close #N with
  `--reason "not planned"` and a comment «Duplicate of #M».
- **Not doing** — only when the issue is pointless or already done: close with `--reason "not planned"` and a
  comment with the reason.

## 5. Body

Fill the template; translate its headings and the summary line to `config.language`. Rules:

- One line per `issueTemplate.extraLines` entry under **What**, filled in; none configured → no extra lines.
- **Done when** — checkboxes with observable results.
- Open questions go under **Notes** below `<!-- gh-tasks:open-questions -->`, one line each. No questions → drop
  the marker and the list.
- The original body goes into the `<!-- gh-tasks:original -->` block untouched. If the body already has that
  block, carry it over as is instead of wrapping it again.
- Keep every foreign HTML comment (e.g. `<!-- tg-issue … -->`) verbatim, at the top of the new body.

## 6. Gate

Without `auto`: show one message with a table — #, new title, labels, outcome, open questions — and write nothing
until the user says «ok». The user may change single rows. When `plan-version` runs triage, this table is part of
its own gate and is not asked separately.

With `auto`: write triaged issues right away. Closing is never automatic: list the proposed duplicates and «not
doing» issues in one message at the end and close only those the user confirms.

## 7. Write

Per triaged issue:

1. Write the body to a temporary file outside the project (the session scratch directory or the OS temp
   directory) with the Write tool, not a shell heredoc.
2. `gh issue edit N --title "<title>" --body-file <file> --add-label <labels> --remove-label <labels>` —
   `--remove-label` gets `status:inbox` and any replaced label; omit it when there is nothing to remove.
3. Delete the temporary file.

Closing: `gh issue comment N --body "<comment>"`, then `gh issue close N --reason "not planned"`.

Ask each open question in chat, one line per question, after the write.

## 8. Report

The final table: #, title, labels, outcome. Then the open questions, if any. When run on its own, end with the
next command: `/gh-tasks:plan-version` with milestones on, otherwise `/gh-tasks:next-task`.
