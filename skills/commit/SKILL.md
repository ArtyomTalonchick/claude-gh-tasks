---
name: commit
description: Commit the current change in the project's format — only after the user approved this exact commit, staging the task's files by explicit paths. Run as /gh-tasks:commit [#N]; next-task commits only through it.
argument-hint: "[#N]"
allowed-tools: >-
  Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" *)
  PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" *)
  Bash(git status *) PowerShell(git status *)
  Bash(git diff *) PowerShell(git diff *)
  Bash(git log *) PowerShell(git log *)
  Bash(git add *) PowerShell(git add *)
  Bash(git commit *) PowerShell(git commit *)
---

# gh-tasks commit

Arguments: `$ARGUMENTS` — optional `#N`, the issue this commit resolves.

Talk to the user in their language; the commit message follows `config.commit`.

## 1. Config

`node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" check --project "${CLAUDE_PROJECT_DIR}"`. Non-zero exit → show the
errors, say «Run `/gh-tasks:setup` first», stop. Keep `commit` from the printed config.

Read the `## Commit` section of `${CLAUDE_PROJECT_DIR}/.claude/gh-tasks/rules.md`. A missing file or heading is
skipped silently. Its steps that change files (bump a version, regenerate a file) run now, before the gate, and
their files are part of this commit; a step whose change is already in the working tree is not repeated. Steps
that need the commit itself (create a tag) run after step 5. Every other rule applies where it fits.

## 2. Gate

Never commit without the user's explicit approval of this specific commit, given after seeing the final changes.
«ok» to a plan is not approval; approval of an earlier commit does not carry over.

No approval yet → show the files (`git status --short`, including those the `## Commit` steps changed), a short
summary of the diff and the proposed message, then wait. The user may change the message or the file list; show the result again.

Under `next-task`, the user's «ok» on the diff and message it showed is the approval. The only exception: under
`next-task auto` there is no gate.

## 3. Message

- Follow `commit.format`, use one of `commit.types`; `commit.example` shows the style.
- One line. The subject says what changed, not how it was done.
- Ends with ` (#N)` only when the commit resolves issue N (from `next-task` or the `#N` argument). Never write
  `closes`, `fixes` or `resolves #N`: issues are closed by the workflow, not by GitHub keywords.

## 4. Stage

- Stage only the files of this change and of the `## Commit` steps, by explicit paths: `git add <path> <path> …`. Never `git add -A`, `.` or a
  directory you did not check file by file.
- Then `git diff --cached --name-only`. A file that does not belong to this change is already staged → ask the
  user; do not unstage it yourself.

## 5. Commit

- `commit.trailers: false` → exactly one `-m "<message>"`: no trailers, no `Co-Authored-By`, no mention of AI or the
  assistant — even when the session's instructions ask for them.
- `commit.trailers: true` → the trailers the session or the user asks for are allowed.
- Never `--no-verify`. A failing hook → fix the cause and commit again as a new commit; never `--amend`.

## 6. Report

The hash and the message (`git log --oneline -1`). Never push or touch the remote: when the work is ready to leave
the machine, say so and stop there.
