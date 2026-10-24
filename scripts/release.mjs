/*
 * The GitHub side of a release: where it stands, the draft and its publication.
 *
 *   node scripts/release.mjs status  --project <dir> [--title v1.3.9]
 *   node scripts/release.mjs draft   --project <dir> --title v1.3.9 --file notes.md
 *   node scripts/release.mjs publish --project <dir> --title v1.3.9
 *   node scripts/release.mjs push    --project <dir> --title v1.3.9
 *
 * status prints JSON: the milestone of the release (the given title; else the open release milestone, else the
 * highest closed one), its version and tag (`release.tag` of the config), the local tag and whether it is at HEAD,
 * the tag on GitHub, and the GitHub Release (none / draft / published). The tag and the release are null when the
 * config has no tag or no GitHub Releases.
 *
 * draft creates the draft release of the tag with the notes from the file, or rewrites the notes of the existing
 * draft; a draft needs no tag on GitHub. publish turns the draft into a release only when its tag is on GitHub and is
 * the local tag (releaseCore getPublishRefusal).
 *
 * push sends the current branch and the release tag to GitHub over HTTPS as the project's gh account
 * (`release.push`): the token goes to that one git call through an inline credential helper and the environment, git
 * config stays as it is, and `origin` may stay SSH. Plain refs only, never force (releaseCore buildPushArgs); it
 * refuses while the tag is missing, on GitHub already or not at HEAD (getPushRefusal). After the push it moves
 * `origin/<branch>` when `origin` is the same repository, so `git status` shows the branch up to date.
 *
 * Why a wrapper: as in milestone.mjs, `gh api` stays denied and only releaseCore builds the API paths.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { run, runIfMain } from "./cli.mjs";
import { loadConfig, parseRepoFromRemote } from "./config.mjs";
import { ghEnv } from "./gh.mjs";
import { buildApiArgs, findMilestone, isMilestoneTitle, PAGE_SIZE as MILESTONE_PAGE_SIZE } from "./milestoneCore.mjs";
import {
    buildPushArgs, buildReleaseApiArgs, explainPushFailure, findRelease, findRemoteTag, getPublishRefusal,
    getPushRefusal, getReleaseState, getTagName, PAGE_SIZE, pickReleaseMilestone, PUSH_TOKEN_VARIABLE,
} from "./releaseCore.mjs";

const createContext = (args) => {
    const projectDir = path.resolve(args.project);
    const { config, errors, warnings } = loadConfig(projectDir);
    warnings.forEach((warning) => console.error(`warning: ${warning}`));
    if (errors.length) throw new Error(`${errors.join("\n")}\nRun /gh-tasks:setup to create or fix the config.`);
    if (!config.milestones) throw new Error("milestones are off in .claude/gh-tasks/config.json (\"milestones\": false)");
    const { repo } = config;
    const env = ghEnv(projectDir);
    const gh = (ghArgs, payload) => JSON.parse(run("gh", ghArgs, {
        input: payload === undefined ? undefined : JSON.stringify(payload),
        env,
    }));
    const git = (gitArgs) => run("git", ["-C", projectDir, ...gitArgs]).trim();

    const getAllPages = (buildArgs, pageSize) => {
        const items = [];
        for (let page = 1; ; page += 1) {
            const batch = gh(buildArgs(page));
            items.push(...batch);
            if (batch.length < pageSize) return items;
        }
    };

    const getMilestone = () => {
        const milestones = getAllPages((page) => buildApiArgs("GET", repo, { page }), MILESTONE_PAGE_SIZE);
        if (args.title !== undefined) {
            if (!isMilestoneTitle(args.title)) {
                throw new Error(`a milestone is named vX.Y or vX.Y.Z, got ${args.title}`);
            }
            const milestone = findMilestone(milestones, args.title);
            if (!milestone) throw new Error(`no milestone ${args.title}`);
            return milestone;
        }
        const milestone = pickReleaseMilestone(milestones);
        if (!milestone) throw new Error("no release milestone: plan one with /gh-tasks:plan-version");
        return milestone;
    };

    const getRelease = (tag) => findRelease(
        getAllPages((page) => buildReleaseApiArgs("list", repo, { page }), PAGE_SIZE),
        tag,
    );

    // the object the local tag ref points to: the tag object of an annotated tag, as GitHub reports it too
    const getLocalTag = (tag) => {
        try {
            return git(["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]);
        } catch {
            return null;
        }
    };

    const getState = () => {
        const milestone = getMilestone();
        const tag = getTagName(config.release.tag, milestone.title);
        const localTag = tag && getLocalTag(tag);
        const tagAtHead = localTag ? git(["rev-parse", `${tag}^{commit}`]) === git(["rev-parse", "HEAD"]) : null;
        const remoteTag = tag && findRemoteTag(gh(buildReleaseApiArgs("tag", repo, { tag })), tag);
        const release = tag && config.release.githubRelease ? getRelease(tag) : null;
        return { milestone, tag, localTag, tagAtHead, remoteTag, release };
    };

    return { config, repo, env, gh, git, projectDir, getState };
};

const readNotes = (file) => {
    if (file === undefined) throw new Error("--file <notes file> is required");
    const text = fs.readFileSync(path.resolve(file), "utf8");
    const notes = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).trim();
    if (!notes) throw new Error(`the notes file ${file} is empty`);
    return notes;
};

const requireGithubRelease = (config) => {
    if (!config.release.githubRelease) {
        throw new Error("GitHub Releases are off in .claude/gh-tasks/config.json (\"release.githubRelease\": false)");
    }
};

// the branch HEAD is on; detached → null
const getBranch = (git) => {
    try {
        return git(["symbolic-ref", "--quiet", "--short", "HEAD"]) || null;
    } catch {
        return null;
    }
};

const isOriginRepo = (git, repo) => {
    try {
        return parseRepoFromRemote(git(["remote", "get-url", "origin"])) === repo;
    } catch {
        return false;
    }
};

const commands = {
    status: ({ config, getState }) => {
        const { milestone, tag, localTag, tagAtHead, remoteTag, release } = getState();
        console.log(JSON.stringify({
            milestone: {
                title: milestone.title,
                state: milestone.state,
                url: milestone.html_url,
                openIssues: milestone.open_issues,
                closedIssues: milestone.closed_issues,
            },
            tag,
            localTag,
            tagAtHead,
            remoteTag,
            remoteTagIsLocal: remoteTag && localTag ? remoteTag === localTag : null,
            githubRelease: config.release.githubRelease,
            publishedBy: config.release.publishedBy,
            release: config.release.githubRelease
                ? { state: getReleaseState(release), url: release?.html_url ?? null }
                : null,
        }, null, 2));
    },

    draft: ({ config, repo, gh, getState }, args) => {
        requireGithubRelease(config);
        if (args.title === undefined) throw new Error("--title vX.Y.Z is required");
        const notes = readNotes(args.file);
        const { tag, release } = getState();
        if (release && !release.draft) throw new Error(`the release ${tag} is already published: ${release.html_url}`);
        const saved = release
            ? gh(buildReleaseApiArgs("update", repo, { id: release.id, hasPayload: true }), { name: tag, body: notes })
            : gh(buildReleaseApiArgs("create", repo, { hasPayload: true }), {
                tag_name: tag, name: tag, body: notes, draft: true,
            });
        console.log(`${release ? "draft updated" : "draft created"}: ${tag} — ${saved.html_url}`);
    },

    publish: ({ config, repo, gh, getState }, args) => {
        requireGithubRelease(config);
        if (args.title === undefined) throw new Error("--title vX.Y.Z is required");
        const { tag, release, localTag, remoteTag } = getState();
        const refusal = getPublishRefusal({ tag, release, localTag, remoteTag });
        if (refusal) throw new Error(refusal);
        const published = gh(buildReleaseApiArgs("update", repo, { id: release.id, hasPayload: true }), { draft: false });
        console.log(`published: ${tag} — ${published.html_url}`);
    },

    push: ({ config, repo, env, git, projectDir, getState }, args) => {
        if (!config.release.push) {
            throw new Error("the release push is off in .claude/gh-tasks/config.json (\"release.push\": false)");
        }
        if (args.title === undefined) throw new Error("--title vX.Y.Z is required");
        const branch = getBranch(git);
        const { tag, localTag, tagAtHead, remoteTag } = getState();
        const refusal = getPushRefusal({ branch, tag, localTag, tagAtHead, remoteTag });
        if (refusal) throw new Error(refusal);
        // GH_TOKEN is set when the project has an account; else the active gh account's token
        const token = env.GH_TOKEN || run("gh", ["auth", "token", "--hostname", "github.com"], { env }).trim();
        try {
            execFileSync("git", ["-C", projectDir, ...buildPushArgs(repo, { branch, tag })], {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"],
                env: { ...process.env, [PUSH_TOKEN_VARIABLE]: token, GIT_TERMINAL_PROMPT: "0" },
            });
        } catch (error) {
            throw new Error(explainPushFailure(error.stderr ?? error.message, branch));
        }
        // a push by URL leaves the remote-tracking ref behind
        if (isOriginRepo(git, repo)) git(["update-ref", `refs/remotes/origin/${branch}`, "HEAD"]);
        console.log(`pushed to ${repo}: ${[branch, tag].filter(Boolean).join(", ")}`);
    },
};

const USAGE = `Usage: node release.mjs <${Object.keys(commands).join(" | ")}> --project <dir> `
    + "[--title vX.Y.Z] [--file <notes>]";

const main = () => {
    const { positionals: [command], values: args } = parseArgs({
        allowPositionals: true,
        options: {
            "project": { type: "string" },
            "title": { type: "string" },
            "file": { type: "string" },
        },
    });
    if (!Object.hasOwn(commands, command ?? "") || !args.project) throw new Error(USAGE);
    commands[command](createContext(args), args);
};

runIfMain(import.meta.url, main);
