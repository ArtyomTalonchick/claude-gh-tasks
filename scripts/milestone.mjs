/*
 * Milestones of the project tracker; a milestone is a release named vX.Y.Z. The order of tasks inside it lives in
 * the milestone description, which `plan-version` writes.
 *
 *   node scripts/milestone.mjs list         --project <dir>
 *   node scripts/milestone.mjs show         --project <dir> --title v1.3.9
 *   node scripts/milestone.mjs create       --project <dir> --title v1.3.9 [--due 2026-09-25] [--file plan.md]
 *   node scripts/milestone.mjs describe     --project <dir> --title v1.3.9 --file plan.md [--due 2026-09-25]
 *   node scripts/milestone.mjs close        --project <dir> --title v1.3.9
 *   node scripts/milestone.mjs next-version --project <dir>
 *
 * Issues go in and out of a milestone with plain gh: `gh issue edit N --milestone v1.3.9` / `--remove-milestone`.
 *
 * Why a wrapper: only `gh api` can create, rewrite and close a milestone, and `gh api` can do anything the token
 * can. Here the API path is built only by milestoneCore, so this script is allowed and `gh api` is denied. There is
 * no delete on purpose: a release is closed, not erased.
 *
 * next-version prints the version on the first stdout line. Exit 2: no vX.Y.Z milestone yet, ask the user for
 * the first version.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { runIfMain } from "./cli.mjs";
import { loadConfig } from "./config.mjs";
import {
    buildApiArgs, findMilestone, getDueOn, getLatestVersion, getMilestoneStatus, getNextPatch, getOpenMilestones,
    isMilestoneTitle, PAGE_SIZE, parseVersionOutput, splitCommand,
} from "./milestoneCore.mjs";

const EXIT_NO_VERSION = 2;

const run = (file, args, { input, cwd } = {}) => {
    try {
        return execFileSync(file, args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], input, cwd });
    } catch (error) {
        if (error.code === "ENOENT") {
            const hint = process.platform === "win32" ? " (on Windows the command must start with an executable such as node)" : "";
            throw new Error(`${file} not found${hint}`);
        }
        throw new Error(`${[file, ...args.slice(0, 2)].join(" ")} failed: ${(error.stderr || error.message).trim()}`);
    }
};

const gh = (args, input) => run("gh", args, { input });

const formatHeader = (milestone) => [
    `${milestone.title} (${getMilestoneStatus(milestone)})`,
    `done ${milestone.closed_issues} of ${milestone.closed_issues + milestone.open_issues}`,
    ...(milestone.due_on ? [`due ${milestone.due_on.slice(0, 10)}`] : []),
].join(" — ");

const formatIssue = (issue) => {
    const labels = issue.labels.map((label) => label.name).join(", ");
    return `  #${issue.number} [${issue.state === "OPEN" ? "open" : "closed"}] ${issue.title}${labels ? ` :: ${labels}` : ""}`;
};

const createContext = (args) => {
    const projectDir = path.resolve(args.project);
    const { config, errors, warnings } = loadConfig(projectDir);
    warnings.forEach((warning) => console.error(`warning: ${warning}`));
    if (errors.length) throw new Error(`${errors.join("\n")}\nRun /gh-tasks:setup to create or fix the config.`);
    if (!config.milestones) throw new Error("milestones are off in .claude/gh-tasks/config.json (\"milestones\": false)");
    const { repo } = config;

    // The only door to gh api
    const api = (method, { number, page, payload } = {}) => JSON.parse(gh(
        buildApiArgs(method, repo, { number, page, hasPayload: payload !== undefined }),
        payload === undefined ? undefined : JSON.stringify(payload),
    ));

    let milestones = null;
    const getMilestones = () => {
        if (milestones) return milestones;
        milestones = [];
        for (let page = 1; ; page += 1) {
            const batch = api("GET", { page });
            milestones.push(...batch);
            if (batch.length < PAGE_SIZE) return milestones;
        }
    };

    const requireTitle = () => {
        if (!args.title) throw new Error("--title vX.Y.Z is required");
        if (!isMilestoneTitle(args.title)) throw new Error(`a milestone is named vX.Y.Z, got ${args.title}`);
        return args.title;
    };

    const requireMilestone = () => {
        const title = requireTitle();
        const milestone = findMilestone(getMilestones(), title);
        if (!milestone) throw new Error(`no milestone ${title}. Create it: milestone.mjs create --title ${title}`);
        return milestone;
    };

    const readDescription = () => {
        if (args.file === undefined) return undefined;
        const text = fs.readFileSync(path.resolve(args.file), "utf8");
        return (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).trim();
    };

    const getIssues = (title) => JSON.parse(gh([
        "issue", "list", "--repo", repo, "--milestone", title, "--state", "all", "--limit", "1000",
        "--json", "number,title,state,labels",
    ])).sort((a, b) => a.number - b.number);

    return { projectDir, config, api, getMilestones, requireTitle, requireMilestone, readDescription, getIssues };
};

const commands = {
    list: ({ getMilestones }) => {
        const milestones = [...getMilestones()].sort((a, b) => b.number - a.number);
        if (!milestones.length) console.log("No milestones.");
        milestones.forEach((milestone) => console.log(formatHeader(milestone)));
    },

    show: ({ requireMilestone, getIssues }) => {
        const milestone = requireMilestone();
        console.log(formatHeader(milestone));
        console.log(`${milestone.html_url}\n`);
        console.log(milestone.description || "(no description — the task order is not written)");
        const issues = getIssues(milestone.title);
        console.log(`\nIssues (${issues.length}):`);
        issues.forEach((issue) => console.log(formatIssue(issue)));
    },

    create: ({ api, getMilestones, requireTitle, readDescription }, args) => {
        const title = requireTitle();
        const dueOn = getDueOn(args.due);
        const description = readDescription() ?? "";
        const milestones = getMilestones();
        if (findMilestone(milestones, title)) throw new Error(`milestone ${title} already exists`);
        const open = getOpenMilestones(milestones);
        if (open.length) {
            throw new Error(`one open milestone at a time: ${open.map((m) => m.title).join(", ")} is still open`);
        }
        const created = api("POST", { payload: { title, description, ...(dueOn ? { due_on: dueOn } : {}) } });
        console.log(`created: ${created.title} — ${created.html_url}`);
    },

    describe: ({ api, requireMilestone, readDescription }, args) => {
        const dueOn = getDueOn(args.due);
        const description = readDescription();
        if (description === undefined) throw new Error("--file <description file> is required");
        const milestone = requireMilestone();
        api("PATCH", { number: milestone.number, payload: { description, ...(dueOn ? { due_on: dueOn } : {}) } });
        console.log(`description updated: ${milestone.title} — ${milestone.html_url}`);
    },

    close: ({ api, requireMilestone, getIssues }) => {
        const milestone = requireMilestone();
        const open = getIssues(milestone.title).filter((issue) => issue.state === "OPEN");
        if (open.length) {
            console.error(`Open issues left: ${open.length} — move them to the next milestone or close them:`);
            open.forEach((issue) => console.error(formatIssue(issue)));
            throw new Error(`milestone ${milestone.title} is not closed`);
        }
        api("PATCH", { number: milestone.number, payload: { state: "closed" } });
        console.log(`closed: ${milestone.title} — ${milestone.html_url}`);
    },

    "next-version": ({ config, projectDir, getMilestones }) => {
        if (config.version.scheme === "command") {
            const [file, ...args] = splitCommand(config.version.command);
            console.log(parseVersionOutput(run(file, args, { cwd: projectDir })));
            return;
        }
        const latest = getLatestVersion(getMilestones().map((milestone) => milestone.title));
        if (!latest) {
            console.error("No vX.Y.Z milestone yet: ask the user for the first version.");
            process.exit(EXIT_NO_VERSION);
        }
        console.log(getNextPatch(latest));
    },
};

const USAGE = `Usage: node milestone.mjs <${Object.keys(commands).join(" | ")}> --project <dir> `
    + "[--title vX.Y.Z] [--due YYYY-MM-DD] [--file <path>]";

const main = () => {
    const { positionals: [command], values: args } = parseArgs({
        allowPositionals: true,
        options: {
            "project": { type: "string" },
            "title": { type: "string" },
            "due": { type: "string" },
            "file": { type: "string" },
        },
    });
    if (!commands[command] || !args.project) throw new Error(USAGE);
    commands[command](createContext(args), args);
};

runIfMain(import.meta.url, main);
