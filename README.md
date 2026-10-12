# gh-tasks

A Claude Code plugin that runs a project's task tracker in GitHub Issues:
triage incoming issues → plan a release as a milestone → take the next task through to a commit → close it.

Skills: `/gh-tasks:setup`, `/gh-tasks:triage`, `/gh-tasks:plan-version`, `/gh-tasks:next-task`, `/gh-tasks:commit`.

Status: v0.1.0 — `setup` and the scripts behind it (`config`, `labels`, `milestone`); the other skills follow in
v0.2.0–v0.3.0, see `docs/requirements.md` section 12.

## Install (planned)

```
/plugin marketplace add ArtyomTalonchick/claude-gh-tasks
/plugin install gh-tasks@gh-tasks      # choose the project scope
/gh-tasks:setup
```

Development: `claude plugin marketplace add ./claude-gh-tasks` from the parent folder loads the plugin in place;
`/reload-plugins` picks up edits. `claude plugin validate .` checks the manifest.
