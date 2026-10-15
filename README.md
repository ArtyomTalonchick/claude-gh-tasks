# gh-tasks

A Claude Code plugin that runs a project's task tracker in GitHub Issues:
triage incoming issues → plan a release as a milestone → take the next task through to a commit → close it →
close the release.

Skills: `/gh-tasks:setup`, `/gh-tasks:triage`, `/gh-tasks:plan-version`, `/gh-tasks:next-task`, `/gh-tasks:commit`,
`/gh-tasks:close-version`.

Released versions and their changes: [`CHANGELOG.md`](CHANGELOG.md).

## Requirements

- [GitHub CLI](https://cli.github.com) 2.70 or newer, logged in (`gh auth login`).
- Node.js 20 or newer.
- A git repository whose `origin` points to GitHub (or `repo` set in the config).

## Install

```
/plugin marketplace add ArtyomTalonchick/claude-gh-tasks
/plugin install gh-tasks@gh-tasks      # choose the project scope
/gh-tasks:setup
```

The project scope writes the plugin into the project `.claude/settings.json`, so everyone who clones the
repository gets it. `/gh-tasks:setup` asks its questions in one message, each with a proposed answer — reply «ok»
or change single items. It then:

- writes `.claude/gh-tasks/config.json` and creates `.claude/gh-tasks/rules.md` with empty headings;
- with several gh accounts logged in, asks which one this project uses — proposing one that can see the
  repository when the active one cannot — and writes it to the git-ignored `.claude/gh-tasks/config.local.json`;
- merges the permissions below into `.claude/settings.json`, before its first write to GitHub;
- creates the labels `status:*`, `type:*`, `prio:*`, `size:*` and lists the labels it does not own; it deletes
  only the ones you name;
- adds a short gh-tasks note to the project `CLAUDE.md`;
- with milestones on, offers to create the first milestone.

`/gh-tasks:setup auto` takes every proposed value without questions and deletes nothing. Run `setup` again at any
time: it only adds or updates.

## The cycle

1. **Create issues** — on GitHub by hand, or ask Claude in chat; an issue created from chat gets `status:inbox`.
   Claude creates it through the plugin's `scripts/gh.mjs`, so it is written as the project's gh account.
   An open issue with `status:inbox`, or without a type, priority or size label, is untriaged.
2. **`/gh-tasks:triage [auto] [#N]`** — rewrites each untriaged issue by the body template (What, Where, Done
   when, Notes; the original text is kept in a collapsed block), sets type, priority and size, and proposes to
   close duplicates and pointless issues. It shows a table and waits for «ok»; `auto` writes the triaged issues
   without waiting. Closing always waits for your word. `prio:backlog` is set only by you.
3. **`/gh-tasks:plan-version [auto]`** — milestones only. Picks the open issues for the next release, orders them,
   writes the milestone description and assigns the issues after your «ok»; `auto` writes without waiting.
   Untriaged candidates are triaged first.
4. **`/gh-tasks:next-task [plan] [auto] [loop] [#N | bug | feature | ops | wish]`** — takes the next issue: the
   first open one in the milestone description, otherwise by priority, type and age. It marks the issue
   `status:in-progress`, plans, writes the change, runs the `checks`, shows the diff and the commit message and
   waits for «ok», then commits through `gh-tasks:commit` and closes the issue.
   - `plan` — also waits for «ok» on the plan (by default the plan is shown only when there are questions).
   - `auto` — no gates: commits once the checks pass. It needs `checks` in the config, stops on a dirty tree or a
     task left `status:in-progress`, skips `type:ops` tasks and tasks with open questions, and writes new
     questions into the issue instead of asking. An issue given as `#N` is taken anyway: its questions are asked
     in chat. `plan auto` keeps the plan gate only.
   - `loop` — goes on to the next task after each commit, until no task is left or you answer «ok, stop».
   - Checks still failing after 3 fix attempts → it stops and leaves the change uncommitted.
5. **`/gh-tasks:commit [#N]`** — commits the current change in the project's format, staging the task's files by
   explicit paths, only after you approve this exact commit. `next-task` commits only through it.
6. **`/gh-tasks:close-version`** — milestones only, run by you. Closes the open milestone: an issue still in
   progress stops it; each other open issue is removed from the milestone or closed, as you say. It runs the
   release steps of `rules.md → ## Close version` (version bump, changelog), shows the version, the closed issues,
   the diff and the commit message, and after your «ok» commits, runs the steps that need the commit (a tag) and
   closes the milestone. A project whose CI closes milestones does not need it.

No skill pushes, pulls or fetches: the remote is yours.

## Configuration

`.claude/gh-tasks/config.json` holds what a field can express:

| Field | Meaning | Default |
|---|---|---|
| `repo` | `owner/name` of the GitHub repository | parsed from `git remote get-url origin` |
| `language` | language of issues, milestones and comments; chat follows you | `en` |
| `milestones` | plan releases as milestones; `false` turns off `plan-version` and `next-task` orders by labels | `true` |
| `version` | `{ "scheme": "patch" }` (highest `vX.Y.Z` milestone + 1 on patch), `{ "scheme": "minor" }` (+ 1 on minor, patch 0) or `{ "scheme": "command", "command": "…" }` that prints the next version on its first stdout line | `patch` |
| `checks` | commands run before a change is shown, e.g. `["npm run lint", "npm test"]` | `[]` |
| `commit` | `format`, `example`, `types` and `trailers` of commit messages | `type(scope): subject`, no trailers |
| `issueTemplate.extraLines` | extra lines of the issue body template, e.g. «Who is affected» | `[]` |

`.claude/gh-tasks/config.local.json` is per user and git-ignored: `{ "account": "<login>" }` is the gh account the
plugin acts as in this project. Every GitHub call of the plugin goes through `scripts/gh.mjs`, which runs `gh` with
that account's stored token for its own process only — the active gh account stays as it is, so sessions in
different projects do not get in each other's way. No file or no `account` → the active account is used. Every
`gh.mjs` call runs against `config.repo`, so a project with several remotes works without `gh repo set-default`.

`.claude/gh-tasks/rules.md` holds what a field cannot express: prose rules under fixed headings (`## Pick`,
`## Plan`, `## Implement`, `## Verify`, `## Commit`, `## After commit`, `## Close`, `## Triage`,
`## Plan version`, `## Close version`), each read by a skill at a fixed moment, in any language. An empty heading is skipped. The
contract and an example for each heading: [`docs/extension-points.md`](docs/extension-points.md).

## Permissions

`setup` adds to the project `.claude/settings.json` (the `PowerShell(...)` twins only on Windows):

- **allow** — `gh issue *`, `gh label *`, `gh search issues *` and the plugin scripts `config.mjs`, `labels.mjs`,
  `milestone.mjs`, `gh.mjs`, so the cycle runs without a prompt on every call;
- **deny** — `gh api *`, `gh repo *`, `gh pr *`, `gh workflow *`, `gh secret *`, `gh variable *`, `gh auth *`.

`gh api` is denied because its token can do anything and a permission rule cannot narrow it to one endpoint.
Milestones go through `scripts/milestone.mjs` instead, which only reaches `repos/<repo>/milestones`. `gh.mjs` runs
only `gh issue` (except `delete` and `transfer`), `gh label` (except `delete`: labels are deleted only by
`labels.mjs apply --delete`) and `gh search issues`.

Commands your `rules.md` steps run (`npm version`, `git tag`, …) would ask for permission on every call. `setup`
lists an allow rule for each one and adds the ones you confirm; `setup auto` only lists them.

## Development

`claude plugin marketplace add ./claude-gh-tasks` from the parent folder loads the plugin in place;
`/reload-plugins` picks up edits. Run `npm test`, `npm run lint` and `claude plugin validate .` after a change.
CI (`.github/workflows/ci.yml`) runs the same checks, with `--strict` validation, on every push to `main` and pull
request.
