---
name: release
description: Release the open milestone — settle its open issues, run the project's release steps, commit, tag, draft the GitHub Release, push the branch and the tag (release.push), run the project's ship steps, publish once the tag is on GitHub and close the milestone. Without release.push re-run after your push to continue. Run by the user as /gh-tasks:release [auto]; needs milestones on in the gh-tasks config.
disable-model-invocation: true
argument-hint: "[auto]"
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

# gh-tasks release

Arguments: `$ARGUMENTS` — optional `auto`. Without it the release waits for the user's «ok» at the gate (step 5).
With `auto` there is no gate: the run goes from the state to the report on its own. `auto` still asks what only the
user knows (what to do with an open issue, a value a project step needs), never deletes, and pushes only with
`release.push` (step 8), as the run without `auto` does.

Run the plugin scripts exactly as written, quotes included:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/<name>.mjs" <command> --project "${CLAUDE_PROJECT_DIR}" …`. Every other GitHub
call goes through `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}"`, never plain `gh`.
Talk to the user in their language; everything written to GitHub is in `config.language`.

A release is resumable: every run reads where the release stands (step 2) and goes on from there. The tag reaches
GitHub by `release.push`, a `## Ship` step or the user's push; without the first two a run ends at «push, then run
`/gh-tasks:release` again».

## 1. Config and rules

`node "${CLAUDE_PLUGIN_ROOT}/scripts/config.mjs" check --project "${CLAUDE_PROJECT_DIR}"`. Non-zero exit → show the
errors, say «Run `/gh-tasks:setup` first», stop. `milestones: false` → «Milestones are off in this project — there
is no release to make», stop. Keep `language`, `commit` and `release` (`tag`, `githubRelease`, `publishedBy`, `push`).

Read `${CLAUDE_PROJECT_DIR}/.claude/gh-tasks/rules.md`, headings `## Release`, `## Release notes`, `## Ship` and
`## After release`. A missing file or heading is skipped silently. A rule there wins over the default of the step it
names — e.g. «open issues stay in the milestone» replaces the question of step 3.

## 2. State

`node "${CLAUDE_PLUGIN_ROOT}/scripts/release.mjs" status --project "${CLAUDE_PROJECT_DIR}"` prints JSON: the
milestone (the open release milestone, else the highest closed one), `tag` (null: the config has no tag),
`localTag`, `tagAtHead`, `remoteTag` (the tag on GitHub), `remoteTagIsLocal`, and `release.state` (`none`, `draft`
or `published`; `release` is null without GitHub Releases). The version is the milestone title without the leading
`v`, always `X.Y.Z`: `v1.3` is `1.3.0`. Pick the stage:

- **Done** — the milestone is closed, and with `githubRelease` the release is published (or `publishedBy: "ci"`) →
  «vX.Y.Z is released» with the links, «nothing to do — plan the next one with `/gh-tasks:plan-version`», stop.
- **Prepare** — the milestone is open and the tag is not made yet (`localTag` and `remoteTag` null), or the config
  has no tag → step 3.
- **Ship** — the tag exists locally and is not on GitHub (`remoteTag` null) → step 8.
- **Publish** — the tag is on GitHub → step 9. `remoteTagIsLocal: false` → «The tag on GitHub is not the local
  one», show both, stop: only the user decides which one is the release. With `publishedBy: "ci"` and the
  milestone still open, the CI may still be at work: say so before step 10.

A local tag that is not at HEAD (`tagAtHead: false`) is not moved: say how many commits came after it
(`git log --oneline <tag>..HEAD`) — they are not in this release — and go on from the tag.

Before the prepare stage: `git status --short` is not empty → show it, «Commit or stash these changes first: the
release commit holds only the release steps», stop.

## 3. Open issues

`node "${CLAUDE_PLUGIN_ROOT}/scripts/milestone.mjs" show --project "${CLAUDE_PROJECT_DIR}" --title <title>` lists the
milestone's issues; a closed issue not completed shows its reason (`[closed: not planned]`).

- An open issue with `status:in-progress` → «#N is still in progress — finish it with `/gh-tasks:next-task`
  first», stop.
- Other open issues → show them, one line each, and ask what to do with each, `auto` included: remove it from the
  milestone (it becomes free and `plan-version` takes it next time) or close it with the reason the user gives
  (`completed` or `not planned`). Nothing is done without the user's word for that issue; an issue the user keeps in
  the release → «Finish #N first», stop.
  - Remove: `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}" issue edit N --remove-milestone`.
  - Close: `node "${CLAUDE_PLUGIN_ROOT}/scripts/gh.mjs" --project "${CLAUDE_PROJECT_DIR}" issue close N --reason completed`,
    or `--reason "not planned"`.

The issues of the release are the milestone's issues closed as completed.

## 4. Release steps and notes

1. Follow `## Release`. Its checks run first; a failed check stops the release with its reason. Its steps that
   change files (bump the version, move «Unreleased» in the changelog under the version) run now. A step that
   needs a value only the user knows (a release date other than today, a version other than the milestone's) is
   asked, not guessed. No steps that change files → there is no release commit.
2. With `githubRelease`, write the notes in `config.language` to a file in the scratchpad (`release-<tag>.md`),
   following `## Release notes`. Without it, the default:
   - one sentence: what the release brings;
   - the issues of the release grouped by type — new features, fixes, everything else — one line each: the result
     for the user, not the implementation, ending with ` (#N)`; an empty group is left out.

   Never put secrets, internal addresses or people's names in the notes.

## 5. Gate

One message with:

- the version, the tag (or «no tag») and the milestone link;
- the issues of the release, one line each, and what step 3 did with the others;
- the files (`git status --short`) and a short summary of the diff, or «no release commit»;
- the commit message, following `config.commit` and `## Release`;
- the notes, in full, with `githubRelease`;
- what follows: the tag, the draft, the push (`release.push`: the branch and the tag, to the repository), the
  `## Ship` steps or «push is yours», who publishes and closes the milestone.

Wait for the user's «ok». Anything else is feedback: apply it and show the gate again. Write nothing more before
the «ok». `auto` → no wait: the message becomes part of the report.

## 6. Commit and tag

1. A release commit → run the `gh-tasks:commit` skill without `#N`; the «ok» of step 5 is its approval (under
   `auto`, the run of the release is).
2. A tag in the config → `git tag -a <tag> -m "<tag>"` on HEAD.
3. The `## Release` steps that need the commit.

## 7. Draft

With `githubRelease`:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/release.mjs" draft --project "${CLAUDE_PROJECT_DIR}" --title <title> --file <notes>`.
It creates the draft, or rewrites the notes of an existing one; a draft needs no tag on GitHub.

## 8. Ship

1. `release.push` →
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/release.mjs" push --project "${CLAUDE_PROJECT_DIR}" --title <title>`. It pushes
   the current branch and the tag over HTTPS as the project's gh account, plain refs only. It refuses while HEAD is
   not on a branch, or the tag is missing, already on GitHub or not at HEAD: show its reason and stop. A rejected push
   (GitHub has commits the branch lacks) goes to the user: never force, pull or rebase to get it through.
2. Follow `## Ship`: the project's steps that take the release out of the machine (a push over its own channel, a
   deploy trigger). Its failure → show it, stop: the next run continues from the state.

Neither `release.push` nor `## Ship` steps → the push is the user's. Without a tag, go on to step 9. With a tag:
say «Push the release commit and the tag (`<tag>`), then run `/gh-tasks:release` again», and stop here with a short
report (the commit, the tag, the draft link). Never push in any other way than `release.mjs push`.

After the push and `## Ship`, with a tag, run `release.mjs status` again: the tag on GitHub → step 9; not yet → say
what the ship steps reported and stop.

## 9. Publish and close

- `publishedBy: "ci"` → the project's CI publishes the release and closes the milestone: do neither; say so and
  go on to step 10.
- With `githubRelease`:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/release.mjs" publish --project "${CLAUDE_PROJECT_DIR}" --title <title>`. It
  refuses while the tag is missing on GitHub or is not the local one; show its reason and stop. A missing draft
  (the release was prepared before GitHub Releases were turned on) → write the notes as in step 4.2, run
  `release.mjs draft`, then `publish`.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/milestone.mjs" close --project "${CLAUDE_PROJECT_DIR}" --title <title>`, unless
  it is closed already. It refuses while the milestone has open issues: GitHub lists issues by milestone with a delay
  of a few seconds, so after step 3 run it once more before reporting the failure.

The notes were approved at the gate of the prepare stage; a later run publishes without a new gate.

## 10. After release

Follow `## After release`. Then collect the open checklists the release left: for each issue of the release, the
`<!-- gh-tasks:after-release -->` section of its body (`gh.mjs … issue view N --json body`) with unchecked items.

## 11. Report

- The version, the release commit (`git log --oneline -1`) or «no release commit», the tag, the release link and
  its state, the milestone link and its state.
- The push (`release.push`), the `## Ship` and `## After release` steps run, with their results.
- The open after-release checklists, by issue: they are checked after the deploy.
- What is left to the user: the push (without `release.push` and ship steps, when the run stopped there),
  anything a project step left. End with the next command: `/gh-tasks:release` when the run stopped before publishing, otherwise
  `/gh-tasks:plan-version`.
