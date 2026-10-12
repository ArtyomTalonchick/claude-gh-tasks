# gh-tasks rules

Project additions to the gh-tasks skills. Each heading is read at a fixed moment; an empty or missing
heading is skipped. Content may be in any language.

## Pick
<!-- next-task, before taking a task: what to skip, locks, size limits -->

## Plan
<!-- next-task, after reading the issue: where to look, notes to read -->
Without `auto`, always show the plan and wait for «ok», as with the `plan` flag.

## Implement
<!-- next-task, before coding: project rules, schema or migration conventions -->
`docs/requirements.md` is the source of truth: a change that contradicts it needs the user's decision first, and
a new decision is written into its table. Plugin texts state rules without decision history.

## Verify
<!-- next-task, after checks and before showing: manual checks, reviewers, local URLs -->

## Commit
<!-- commit, before committing: anything beyond config.commit -->

## After commit
<!-- next-task, after each commit: syncs, merges -->

## Close
<!-- next-task, after closing: notes to update, knowledge to capture -->
A user-visible change gets a line under «Unreleased» in `CHANGELOG.md`.

## Triage
<!-- triage, while rewriting a body: markers to keep, comment conventions, extra line semantics -->

## Plan version
<!-- plan-version, while choosing scope: release size, themes, groups -->
