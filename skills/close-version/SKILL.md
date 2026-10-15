---
name: close-version
description: Close the open release milestone — settle its open issues, run the project's release steps (version bump, changelog), commit them and close the milestone. Run by the user as /gh-tasks:close-version; needs milestones on in the gh-tasks config. Never pushes.
disable-model-invocation: true
allowed-tools: >-
  Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" *)
  Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/milestone.mjs" *)
  PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" *)
  PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/milestone.mjs" *)
  Bash(node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" *)
  PowerShell(node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" *)
  Bash(git status *) PowerShell(git status *)
  Bash(git diff *) PowerShell(git diff *)
  Bash(git log *) PowerShell(git log *)
---

# gh-tasks close-version

No arguments, and no `auto`: closing a release always waits for the user.

Run the plugin scripts exactly as written, quotes included:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/milestone.mjs" <command> --project "${CLAUDE_PROJECT_DIR}" …`. Talk to the user in
their language; everything written to GitHub is in `config.language`.

Every other GitHub call goes through `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}"`,
written exactly as below, never plain `gh`: the wrapper runs as the project's gh account.

## 1. Config

`node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" check --project "${CLAUDE_PROJECT_DIR}"`. Non-zero exit → show the
errors, say «Run `/gh-tasks:setup` first», stop. `milestones: false` → «Milestones are off in this project — there
is no release to close», stop. Keep `commit` from the printed config.

Read the `## Close version` section of `${CLAUDE_PROJECT_DIR}/.claude/gh-tasks/rules.md`. A missing file or heading
is skipped silently.

## 2. State

1. `milestone.mjs list`. No open milestone → «No open milestone to close — plan one with
   `/gh-tasks:plan-version`», stop. The version is its title without the leading `v`, always `X.Y.Z`: a `vX.Y` title is version `X.Y.0`.
2. `git status --short` is not empty → show it, say «Commit or stash these changes first: the release commit holds
   only the release steps», stop.

## 3. Open issues

`milestone.mjs show --title <title>` lists the milestone's issues.

- An open issue with `status:in-progress` → «#N is still in progress — finish it with `/gh-tasks:next-task` first»,
  stop.
- Other open issues → show them, one line each, and ask what to do with each: remove it from the milestone (it
  becomes free and `plan-version` takes it next time) or close it, with the reason the user gives (`completed` or
  `not planned`). Nothing is done without the user's word for that issue; an issue the user wants to keep in the
  release → «Finish #N first», stop.
  - Remove: `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}" issue edit N --remove-milestone`.
  - Close: `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}" issue close N --reason completed`,
    or `--reason "not planned"`.

## 4. Release steps

Follow `## Close version`. Its steps that change files (bump the version, move «Unreleased» in the changelog under
the version) run now; steps that need the release commit (create a tag) run in step 6. Every other rule applies
where it fits. A step that needs a value only the user knows (a release date other than today, a version other than
the milestone's) is asked, not guessed.

No `## Close version` steps, or none that change files → there is no release commit.

## 5. Gate

One message with:

- the version and the milestone link;
- the closed issues of the milestone, one line each, and what step 3 did with the others;
- the files (`git status --short`) and a short summary of the diff, or «no release commit»;
- the commit message, following `config.commit` and `## Close version`;
- the steps that run after the commit, if any.

Wait for the user's «ok». Anything else is feedback: apply it and show the gate again. Write nothing more before
the «ok».

## 6. Commit and close

1. A release commit → run the `gh-tasks:commit` skill without `#N`; the «ok» of step 5 is its approval.
2. The `## Close version` steps that need the commit.
3. `milestone.mjs close --title <title>`. It refuses while the milestone has open issues: GitHub lists issues by
   milestone with a delay of a few seconds, so after step 3 run it once more before reporting the failure.

## 7. Report

The release commit (`git log --oneline -1`) or «no release commit», the steps run after it, the closed milestone with
its link. Never push or touch the remote: say the release is ready to leave the machine — the push, and any tag the
steps created, are the user's. End with the next command: `/gh-tasks:plan-version`.
