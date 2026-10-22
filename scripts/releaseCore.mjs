/*
 * Pure release mechanics for `release.mjs`. This is the only place that builds a `gh api` call for releases and tags:
 * the paths are `repos/<repo>/releases[/<id>]` and `repos/<repo>/git/matching-refs/tags/<tag>`, each with a fixed
 * method, so the script can be allowed while `gh api` itself stays denied. There is no delete on purpose.
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
