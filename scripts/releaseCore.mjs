/*
 * Pure release mechanics for `release.mjs`. This is the only place that builds a `gh api` call for releases and tags:
 * the paths are `repos/<repo>/releases[/<id>]` and `repos/<repo>/git/matching-refs/tags/<tag>`, each with a fixed
 * method, so the script can be allowed while `gh api` itself stays denied. There is no delete on purpose. The push of
 * the release is built here too: the branch and the tag, plain refs over HTTPS.
 */
import { isRepo } from "./config.mjs";
import { compareVersions, getOpenMilestones, isMilestoneTitle, parseVersion } from "./milestoneCore.mjs";

// A tag name as the config can build it: no slashes, no "..", no leading dot or hyphen
const TAG_PATTERN = /^(?![.-])(?!.*\.\.)[A-Za-z0-9._-]+$/;

export const isTagName = (tag) => typeof tag === "string" && TAG_PATTERN.test(tag);

/** `release.tag` and a milestone title → the tag name: "v{version}" + "v1.3" → "v1.3.0"; no tag → null */
export const getTagName = (template, title) => {
    if (template === false) return null;
    const version = parseVersion(title);
    if (!version) throw new Error(`a milestone is named vX.Y or vX.Y.Z, got ${title}`);
    return template.replace("{version}", version.join("."));
};

export const PAGE_SIZE = 100;

// action → method and path; the payload of create and update goes to stdin
const ACTIONS = {
    list: { method: "GET", path: (repo, { page }) => `repos/${repo}/releases?per_page=${PAGE_SIZE}&page=${page}` },
    create: { method: "POST", path: (repo) => `repos/${repo}/releases` },
    update: { method: "PATCH", path: (repo, { id }) => `repos/${repo}/releases/${id}` },
    tag: { method: "GET", path: (repo, { tag }) => `repos/${repo}/git/matching-refs/tags/${tag}` },
};

/**
 * Arguments for `gh api`.
 * @param {"list" | "create" | "update" | "tag"} action
 * @param {string} repo
 * @param {{ id?: number, page?: number, tag?: string, hasPayload?: boolean }} [options]
 */
export const buildReleaseApiArgs = (action, repo, { id, page = 1, tag, hasPayload = false } = {}) => {
    const spec = Object.hasOwn(ACTIONS, action) ? ACTIONS[action] : null;
    if (!spec) throw new Error(`release action ${action} is not allowed`);
    if (!isRepo(repo)) throw new Error(`the repository must be "owner/name", got ${JSON.stringify(repo)}`);
    if (action === "list" && !(Number.isInteger(page) && page > 0)) {
        throw new Error(`a page must be a positive integer, got ${page}`);
    }
    if (action === "update" && !(Number.isInteger(id) && id > 0)) {
        throw new Error(`a release id must be a positive integer, got ${JSON.stringify(id)}`);
    }
    if (action === "tag" && !isTagName(tag)) throw new Error(`not a tag name: ${JSON.stringify(tag)}`);
    return [
        "api", spec.path(repo, { id, page, tag }),
        "--method", spec.method,
        "-H", "Accept: application/vnd.github+json",
        ...(hasPayload ? ["--input", "-"] : []),
    ];
};

/** The release of a tag, a draft included; none → null */
export const findRelease = (releases, tag) => releases.find((release) => release.tag_name === tag) ?? null;

export const getReleaseState = (release) => {
    if (!release) return "none";
    return release.draft ? "draft" : "published";
};

/** `matching-refs` output → the object the tag points to on GitHub; the API matches by prefix, so v1.2 ≠ v1.2.0 */
export const findRemoteTag = (refs, tag) => refs.find((ref) => ref.ref === `refs/tags/${tag}`)?.object?.sha ?? null;

/**
 * The milestone a release run works on: the open release milestone, else the highest closed one (a release that
 * was not finished yet); none → null
 */
export const pickReleaseMilestone = (milestones) => {
    const [open] = getOpenMilestones(milestones);
    if (open) return open;
    return milestones
        .filter((milestone) => milestone.state === "closed" && isMilestoneTitle(milestone.title))
        .sort((a, b) => compareVersions(a.title, b.title))
        .at(-1) ?? null;
};

// A branch name as `git push` takes it: segments of ref-safe characters, no leading dot or hyphen, no ".."
const BRANCH_PATTERN = /^(?![.-])(?!.*\.\.)(?!.*\/[.-])[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

export const isBranchName = (branch) => typeof branch === "string" && BRANCH_PATTERN.test(branch)
    && !branch.endsWith(".");

/** The variable the push token travels in: the environment of one git call, never its arguments */
export const PUSH_TOKEN_VARIABLE = "GH_TASKS_PUSH_TOKEN";

// The empty helper first drops the helpers of the user's git config for this call; the second answers `get` only
const PUSH_CREDENTIAL_HELPER = "!f() { test \"$1\" = get && echo username=x-access-token"
    + ` && echo "password=$${PUSH_TOKEN_VARIABLE}"; }; f`;

/**
 * Arguments for `git push` of the release over HTTPS: plain refs only — no force, no deletes, no refspecs — so a push
 * can only fast-forward what GitHub already has.
 * @param {string} repo
 * @param {{ branch: string, tag: string | null }} refs
 */
export const buildPushArgs = (repo, { branch, tag }) => {
    if (!isRepo(repo)) throw new Error(`the repository must be "owner/name", got ${JSON.stringify(repo)}`);
    if (!isBranchName(branch)) throw new Error(`not a branch name: ${JSON.stringify(branch)}`);
    if (tag !== null && !isTagName(tag)) throw new Error(`not a tag name: ${JSON.stringify(tag)}`);
    return [
        "-c", "credential.helper=", "-c", `credential.helper=${PUSH_CREDENTIAL_HELPER}`,
        "push", `https://github.com/${repo}.git`, branch, ...(tag ? [tag] : []),
    ];
};

/**
 * Why the release cannot be pushed, or null. The branch goes out with the tag, so the tag must be at HEAD: commits
 * after it would leave with the release without being in it.
 * @param {{ branch: string | null, tag: string | null, localTag: string | null, tagAtHead: boolean | null,
 *   remoteTag: string | null }} state
 */
export const getPushRefusal = ({ branch, tag, localTag, tagAtHead, remoteTag }) => {
    if (!branch) return "HEAD is not on a branch: check out the release branch, then push";
    if (!tag) return null;
    if (!localTag) return `no local tag ${tag}: make the release commit and the tag first`;
    if (remoteTag) return `the tag ${tag} is on GitHub already: nothing to push for it`;
    if (!tagAtHead) return `the tag ${tag} is not at HEAD: commits after it would be pushed with the release`;
    return null;
};

/** The stderr of a failed push → one line for the user; a rejection is never forced */
export const explainPushFailure = (stderr, branch) => {
    const text = String(stderr ?? "").trim();
    if (/\[rejected\]|non-fast-forward|fetch first/.test(text)) {
        return `GitHub has commits that ${branch} lacks, the push was rejected: `
            + "never force or rebase — the user decides";
    }
    return `git push failed: ${text || "no output"}`;
};

/**
 * Why a draft cannot be published yet, or null. A draft is published only when its tag is on GitHub — and is the
 * local tag, when there is one: publishing a draft whose tag is missing makes GitHub create the tag on the default
 * branch, on a commit that may not be the release.
 * @param {{ tag: string, release: object | null, localTag: string | null, remoteTag: string | null }} state
 */
export const getPublishRefusal = ({ tag, release, localTag, remoteTag }) => {
    if (!release) return `no draft release for ${tag}: create it with release.mjs draft`;
    if (!release.draft) return `the release ${tag} is already published: ${release.html_url}`;
    if (!remoteTag) return `the tag ${tag} is not on GitHub yet: push it, then publish`;
    if (localTag && localTag !== remoteTag) {
        return `the tag ${tag} on GitHub (${remoteTag.slice(0, 7)}) is not the local one (${localTag.slice(0, 7)})`;
    }
    return null;
};
