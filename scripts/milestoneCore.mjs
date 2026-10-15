/*
 * Pure milestone mechanics for `milestone.mjs`. This is the only place that builds a `gh api` call: the path is
 * always `repos/<repo>/milestones[/<number>]` and the method one of GET / POST / PATCH, so the script can be
 * allowed while `gh api` itself stays denied.
 */
import { isRepo } from "./config.mjs";

// A milestone is named as the version it releases: vX.Y.Z, or vX.Y for vX.Y.0
export const MILESTONE_TITLE_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?$/;

export const isMilestoneTitle = (title) => typeof title === "string" && MILESTONE_TITLE_PATTERN.test(title);

/** "v1.2.3" → [1, 2, 3]; "v1.2" → [1, 2, 0]; anything else → null */
export const parseVersion = (title) => {
    const match = typeof title === "string" ? title.match(MILESTONE_TITLE_PATTERN) : null;
    return match ? match.slice(1).map((part) => Number(part ?? 0)) : null;
};

export const compareVersions = (a, b) => {
    const [left, right] = [parseVersion(a), parseVersion(b)];
    return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
};

/** The highest version among the titles (other titles are ignored); none → null */
export const getLatestVersion = (titles) => (titles ?? [])
    .filter(isMilestoneTitle)
    .sort(compareVersions)
    .at(-1) ?? null;

export const getNextPatch = (version) => {
    const [major, minor, patch] = parseVersion(version);
    return `v${major}.${minor}.${patch + 1}`;
};

// A minor release is titled vX.Y
export const getNextMinor = (version) => {
    const [major, minor] = parseVersion(version);
    return `v${major}.${minor + 1}`;
};

export const getMilestonePath = (repo, number) => {
    if (!isRepo(repo)) throw new Error(`the repository must be "owner/name", got ${JSON.stringify(repo)}`);
    if (number !== undefined && !(Number.isInteger(number) && number > 0)) {
        throw new Error(`a milestone number must be a positive integer, got ${JSON.stringify(number)}`);
    }
    return `repos/${repo}/milestones${number === undefined ? "" : `/${number}`}`;
};

export const API_METHODS = ["GET", "POST", "PATCH"];
export const PAGE_SIZE = 100;

/**
 * Arguments for `gh api`. A list (GET without a number) asks for one page of milestones in every state.
 * @param {"GET" | "POST" | "PATCH"} method
 * @param {string} repo
 * @param {{ number?: number, page?: number, hasPayload?: boolean }} [options] the payload goes to stdin
 */
export const buildApiArgs = (method, repo, { number, page = 1, hasPayload = false } = {}) => {
    if (!API_METHODS.includes(method)) throw new Error(`method ${method} is not allowed`);
    if (!(Number.isInteger(page) && page > 0)) throw new Error(`a page must be a positive integer, got ${page}`);
    const isList = method === "GET" && number === undefined;
    const query = isList ? `?state=all&per_page=${PAGE_SIZE}&page=${page}` : "";
    return [
        "api", `${getMilestonePath(repo, number)}${query}`,
        "--method", method,
        "-H", "Accept: application/vnd.github+json",
        ...(hasPayload ? ["--input", "-"] : []),
    ];
};

export const findMilestone = (milestones, title) => milestones.find((milestone) => milestone.title === title);

/** The release milestone of the same version in either form: v1.2 and v1.2.0 are one version */
export const findSameVersion = (milestones, title) => milestones.find((milestone) => (
    isMilestoneTitle(milestone.title) && compareVersions(milestone.title, title) === 0
));

// Open release milestones; a milestone not named vX.Y or vX.Y.Z belongs to someone else and is ignored
export const getOpenMilestones = (milestones) => milestones
    .filter((milestone) => milestone.state === "open" && isMilestoneTitle(milestone.title));

const pad = (number) => String(number).padStart(2, "0");

/**
 * An ISO time in the local time zone with its offset, e.g. 2026-10-13T01:41:07+03:00: the user's own date, and
 * still exact as a GitHub search qualifier (`closed:>=…`)
 */
export const formatLocalTime = (iso) => {
    const date = new Date(iso);
    const offset = -date.getTimezoneOffset();
    const sign = offset < 0 ? "-" : "+";
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
        + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
        + `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
};

export const getMilestoneStatus = (milestone) => {
    if (milestone.state !== "open") return `closed — released ${formatLocalTime(milestone.closed_at)}`;
    if (milestone.open_issues > 0) return "open — in progress";
    return milestone.closed_issues > 0 ? "open — waiting for a release" : "open — empty";
};

/** "2026-09-25" → the end of that day in UTC: GitHub shows a milestone overdue from the next day */
export const getDueOn = (date) => {
    if (date === undefined) return undefined;
    // Date.parse rolls 2026-02-30 over to March: compare the round trip instead
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
    const valid = parsed !== null && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
    if (!valid) throw new Error(`--due must be a date YYYY-MM-DD, got ${date}`);
    return `${date}T23:59:59Z`;
};

/**
 * Splits `version.command` into a program and its arguments without a shell. Double and single quotes group
 * words; there are no escapes, variables or operators.
 */
export const splitCommand = (command) => {
    const tokens = [];
    let current = null;
    let quote = null;
    for (const char of command ?? "") {
        if (quote) {
            if (char === quote) quote = null;
            else current += char;
        } else if (char === "\"" || char === "'") {
            quote = char;
            current ??= "";
        } else if (/\s/.test(char)) {
            if (current !== null) tokens.push(current);
            current = null;
        } else {
            current = (current ?? "") + char;
        }
    }
    if (quote) throw new Error(`unterminated ${quote} in version.command: ${command}`);
    if (current !== null) tokens.push(current);
    if (!tokens.length) throw new Error("version.command is empty");
    return tokens;
};

/** The first stdout line of `version.command` must be the version */
export const parseVersionOutput = (stdout) => {
    const line = (stdout ?? "").split(/\r?\n/)[0].trim();
    if (!isMilestoneTitle(line)) {
        throw new Error(`version.command must print vX.Y or vX.Y.Z on its first line, got ${JSON.stringify(line)}`);
    }
    return line;
};
