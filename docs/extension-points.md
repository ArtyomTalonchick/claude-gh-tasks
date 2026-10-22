# Extension points

A project adds its own rules to the gh-tasks skills in `.claude/gh-tasks/rules.md`. `/gh-tasks:setup` creates the
file with every heading and a one-line hint under each; after that the file belongs to the project and `setup` only
adds missing headings.

## Contract

- The headings below are the contract: level 2, in English, spelled exactly as here.
- The content under a heading is prose in any language. Each skill reads its heading at a fixed moment and follows
  it as part of its own rules.
- An empty or missing heading is skipped silently. A heading that is not in this list is never read.
- The HTML comment under each heading is a hint for the author, not a rule; skills ignore it.
- Machine-readable settings live in `config.json` (checks, commit format, language, version scheme, issue template
  lines, release tag and GitHub Release). Do not repeat them here; this file is for what a field cannot express.

| Heading | Read by | When |
|---|---|---|
| `## Pick` | next-task | before taking a task |
| `## Plan` | next-task | after reading the issue |
| `## Implement` | next-task | before coding |
| `## Verify` | next-task | after checks, before showing the change |
| `## Commit` | commit | before committing |
| `## After commit` | next-task | after each commit |
| `## Close` | next-task | after closing the issue |
| `## Triage` | triage | while rewriting an issue body |
| `## Plan version` | plan-version | while choosing the scope of a release |
| `## Release` | release | before the release gate |
| `## Release notes` | release | while writing the GitHub Release notes |
| `## Ship` | release | after the tag and the draft |
| `## After release` | release | once the release is out |

## Headings

### Pick

`<!-- next-task, before taking a task: what to skip, locks, size limits -->`

Which tasks a session may take and how it claims them: locks between parallel sessions, tasks to skip, limits on
size.

Two core steps of `next-task` follow it when it says so:

- Which `status:in-progress` issues are this session's. The others belong to parallel sessions: they are left out
  of the unfinished-work check, so the session neither offers them nor stops on them. Without the rule every
  in-progress issue counts as this session's.
- How a task is claimed, e.g. a lock before the `status:in-progress` label. A failed lock means another session
  has the task: the next candidate is claimed instead. Without the rule the label is set at once.

> Parallel slots: an in-progress issue is this session's only when the current branch is `task/N`. Claim a task by
> `git branch task/N main` first, then `git switch task/N`, and set the label only when the branch was created.
> Take a `size:l` task only when it is asked for by number. Skip a task whose files overlap with a task another
> session has in progress.

### Plan

`<!-- next-task, after reading the issue: where to look, notes to read -->`

Where to look before proposing a plan: notes, design documents, modules that are easy to miss.

> Read the notes for this task in `.claude/local/tasks.md` before planning.

### Implement

`<!-- next-task, before coding: project rules, schema or migration conventions -->`

How code is written in this project beyond what the code itself shows: rule files, schema and migration
conventions, generated files.

> A schema change goes into `db/schema.sql` plus a one-off script in `db-once/`. Follow the rule files in
> `.claude/rules/`.

### Verify

`<!-- next-task, after checks and before showing: manual checks, reviewers, local URLs -->`

What to check after `config.checks` pass and before the change is shown: manual checks, screenshots, review agents,
local URLs.

> For a UI change, open `http://localhost:3000` and compare before and after screenshots. Run the `rules-reviewer`
> agent on the diff.

### Commit

`<!-- commit, before committing: anything beyond config.commit -->`

Commit rules that `config.commit` cannot hold. The format, types and trailers belong in the config. Steps that
change files run before the commit gate — under `next-task`, before the diff is shown — so the approved file list
is the committed one; steps that need the commit itself, such as a tag, run after it.

> Never commit generated files under `dist/`.

> Bump the patch: `npm version patch --no-git-tag-version`; its files go into the commit. (`minor` version scheme)

### After commit

`<!-- next-task, after each commit: syncs, merges -->`

What follows each commit: syncing branches, merging into the main working copy.

> Rebase the task branch on `main`, then fast-forward `main` in the main folder.

### Close

`<!-- next-task, after closing: notes to update, knowledge to capture -->`

What follows closing an issue: notes to prune, knowledge to record, changelog lines.

> A user-visible change gets a line under «Unreleased» in `CHANGELOG.md`. Remove the task's notes from
> `.claude/local/tasks.md`.

### Triage

`<!-- triage, while rewriting a body: markers to keep, comment conventions, extra line semantics -->`

How to read and rewrite issues: what foreign markers mean, whose comments carry the request, how to fill the
project's extra template lines.

> Comments starting with 💬 are the reporter's words. «Who is affected» is «customers» when they see the problem in
> the shop, otherwise «staff».

### Plan version

`<!-- plan-version, while choosing scope: release size, themes, groups -->`

How big a release is and how it is shaped: size reference, themes, special groups.

> A release is about a week of work: two or three `size:m` tasks plus small ones. Tasks that wait for the owner's
> content go to «Waits for the user».

### Release

`<!-- release, before the gate: checks, version bump, changelog, steps after the commit -->`

What a release checks and changes in the repository. Checks run first and a failed one stops the release. Steps that
change files run before the gate and go into one release commit; steps that need the commit run after it. No steps
that change files → no release commit. The tag is not a step: `release.tag` in the config makes it. A rule here
may also replace a default of the skill, such as what happens to the issues left open in the milestone.

> `CHANGELOG.md`: add `## X.Y.Z — YYYY-MM-DD` right under «Unreleased», which stays empty. Run
> `npm version X.Y.Z --no-git-tag-version`. Commit message: `chore: release X.Y.Z`.

> Set the version: `npm version X.Y.0 --no-git-tag-version`. (`minor` version scheme)

> Run `node tools/release/check-env.mjs`: a variable missing in the deploy workflow stops the release. Open issues
> stay in the milestone; list them in the report.

### Release notes

`<!-- release, while writing the GitHub Release notes: format, sections, links -->`

The format of the notes when `release.githubRelease` is on. Without it the notes are one sentence and the issues
of the release grouped by type.

> First a sentence on what the release brings, then «⚠️ What to do» for the staff when they must act, then sections
> in this order: Catalog, Orders, Admin, Internal tools. A line is the result for the user, ending with `(#N)`. Last
> line: `Changes - https://github.com/<repo>/compare/<previous tag>...<tag>`.

### Ship

`<!-- release, after the tag and the draft: push, deploy trigger -->`

How the release leaves the machine. The plugin never pushes: without this heading the user pushes the release
commit and the tag, then runs `/gh-tasks:release` again, which publishes the draft once the tag is on GitHub.

> Run `node tools/release/ship.mjs --tag <tag>`: it pushes `main` and the tag over HTTPS, and the tag push starts the
> deploy.

### After release

`<!-- release, once the release is out: deploy checks, notes to prune, announcements -->`

What follows the release: with `publishedBy: "skill"` after the release is published and the milestone closed,
with `publishedBy: "ci"` after the ship steps. The skill also lists the open «After release» checklists of the
release's issues by itself.

> Wait until the release is published (the CI does it after the deploy), then check the production site for each
> issue of the release and tick its «After release» items. Remove the release's sections from
> `.claude/local/tasks.md`.

## Writing good rules

- One rule per line or short paragraph; say the condition with the rule («for a UI change, …»).
- Name files, commands and agents exactly; a skill cannot guess them.
- Keep the file short: every line is read on every run of the skill.
