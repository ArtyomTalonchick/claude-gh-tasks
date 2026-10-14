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
  lines). Do not repeat them here; this file is for what a field cannot express.

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

## Headings

### Pick

`<!-- next-task, before taking a task: what to skip, locks, size limits -->`

Which tasks a session may take and how it claims them: locks between parallel sessions, tasks to skip, limits on
size.

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

## Writing good rules

- One rule per line or short paragraph; say the condition with the rule («for a UI change, …»).
- Name files, commands and agents exactly; a skill cannot guess them.
- Keep the file short: every line is read on every run of the skill.
