/*
 * The label set of gh-tasks. This file is the source of truth for label names, colours and descriptions.
 *
 *   node scripts/labels.mjs apply --project <dir> [--dry-run] [--delete <name>]...
 *
 * Order: renames from older schemes (a rename keeps the label on its issues, delete + create would lose it), then
 * create/update of our labels, then deletion of the foreign labels named with --delete — and only those: our own
 * labels are never deleted. --dry-run prints the plan and changes nothing. Safe to re-run.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { resolveRepo } from "./config.mjs";

// A colour must read in both GitHub themes: it is the chip background in the light one and the text colour in the
// dark one, hence medium lightness. Priority is the only saturated group (hot → cold), so a list reads at a glance;
// type and size stay muted so they do not compete with it.
export const LABELS = [
    // status — present only while something happens to the issue; a triaged free issue has none
    { name: "status:inbox", color: "d4c5f9", description: "New, not triaged yet" },
    { name: "status:in-progress", color: "fbca04", description: "Being worked on right now" },
    { name: "type:bug", color: "f7c6c7", description: "Something is broken" },
    { name: "type:feature", color: "a2eeef", description: "New functionality or an improvement" },
    { name: "type:wish", color: "c5def5", description: "An idea, no commitment" },
    { name: "type:ops", color: "bfd4f2", description: "Not code: settings, external services, content" },
    { name: "prio:critical", color: "e11d48", description: "Blocks users or the main flow — out of turn" },
    { name: "prio:major", color: "e36209", description: "Wanted in the next release" },
    { name: "prio:normal", color: "2da44e", description: "The regular queue" },
    { name: "prio:minor", color: "54aeff", description: "Small, when there is time" },
    // set only by the user
    { name: "prio:backlog", color: "8c959f", description: "Postponed: not planned for the coming releases" },
    { name: "size:s", color: "ededed", description: "Under an hour" },
    { name: "size:m", color: "ededed", description: "Up to half a day" },
    { name: "size:l", color: "ededed", description: "A day or more" },
];

// Older schemes → ours. GitHub's `enhancement` is not here: its meaning is broader than type:feature
export const RENAMES = [
    ["inbox", "status:inbox"],
    ["in-progress", "status:in-progress"],
    ["bug", "type:bug"],
    ["feature", "type:feature"],
    ["wish", "type:wish"],
    ["ops", "type:ops"],
    ["p1", "prio:critical"],
    ["p2", "prio:normal"],
    ["p3", "prio:minor"],
    ["size-s", "size:s"],
    ["size-m", "size:m"],
    ["size-l", "size:l"],
];

const changedFields = (current, wanted) => [
    ...(current.color?.toLowerCase() === wanted.color ? [] : ["color"]),
    ...((current.description ?? "") === wanted.description ? [] : ["description"]),
];

/**
 * What `apply` has to do with the labels a repository has now. Pure.
 * @param {{ name: string, color?: string, description?: string }[]} existing
 */
export const planLabels = (existing) => {
    const byName = new Map(existing.map((label) => [label.name, label]));
    const renames = [];
    const conflicts = [];
    RENAMES.forEach(([from, to]) => {
        if (!byName.has(from)) return;
        // Both exist: an interrupted run or a manual rename. Deleting the old one would strip it from its issues,
        // so the user moves them
        if (byName.has(to)) {
            conflicts.push({ from, to });
            return;
        }
        renames.push({ from, to });
        byName.set(to, { ...byName.get(from), name: to });
        byName.delete(from);
    });

    const create = [];
    const update = [];
    const unchanged = [];
    LABELS.forEach((label) => {
        const current = byName.get(label.name);
        if (!current) {
            create.push(label);
            return;
        }
        const fields = changedFields(current, label);
        if (fields.length) update.push({ ...label, fields });
        else unchanged.push(label.name);
    });

    const ours = new Set(LABELS.map((label) => label.name));
    const conflicting = new Set(conflicts.map(({ from }) => from));
    const foreign = [...byName.keys()].filter((name) => !ours.has(name) && !conflicting.has(name)).sort();
    return { renames, conflicts, create, update, unchanged, foreign };
};

/** Only foreign labels and the old side of a conflict may be deleted. @returns {string[]} errors */
export const checkDeletion = (names, plan) => {
    const deletable = new Set([...plan.foreign, ...plan.conflicts.map(({ from }) => from)]);
    const ours = new Set(LABELS.map((label) => label.name));
    return names.filter((name) => !deletable.has(name)).map((name) => (ours.has(name)
        ? `"${name}" is a gh-tasks label and is never deleted`
        : `"${name}" is not a label of this repository`));
};

export const formatPlan = (plan, toDelete = []) => {
    const deleting = new Set(toDelete);
    const kept = plan.foreign.filter((name) => !deleting.has(name));
    return [
        ...plan.renames.map(({ from, to }) => `rename: ${from} → ${to}`),
        ...plan.create.map(({ name }) => `create: ${name}`),
        ...plan.update.map(({ name, fields }) => `update: ${name} (${fields.join(", ")})`),
        ...toDelete.map((name) => `delete: ${name}`),
        ...plan.conflicts.filter(({ from }) => !deleting.has(from)).map(({ from, to }) =>
            `conflict: both "${from}" and "${to}" exist — move the issues to "${to}", then --delete "${from}"`),
        ...(kept.length ? [`foreign (kept): ${kept.join(", ")}`] : []),
        ...(plan.unchanged.length ? [`unchanged: ${plan.unchanged.length} labels`] : []),
    ];
};

const gh = (args) => {
    try {
        return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
        throw new Error(`gh ${args.slice(0, 2).join(" ")} failed: ${(error.stderr || error.message).trim()}`);
    }
};

const USAGE = "Usage: node labels.mjs apply --project <dir> [--dry-run] [--delete <name>]...";

const main = () => {
    const { positionals: [command], values } = parseArgs({
        allowPositionals: true,
        options: {
            "project": { type: "string" },
            "dry-run": { type: "boolean", default: false },
            "delete": { type: "string", multiple: true, default: [] },
        },
    });
    if (command !== "apply" || !values.project) throw new Error(USAGE);

    const repo = resolveRepo(path.resolve(values.project));
    const existing = JSON.parse(gh(["label", "list", "--repo", repo, "--limit", "1000",
        "--json", "name,color,description"]));
    const plan = planLabels(existing);
    const toDelete = [...new Set(values.delete)];
    const errors = checkDeletion(toDelete, plan);
    if (errors.length) throw new Error(errors.join("\n"));

    const lines = formatPlan(plan, toDelete);
    if (values["dry-run"]) {
        console.log(`${repo}: dry run, nothing changed`);
        lines.forEach((line) => console.log(line));
        return;
    }

    plan.renames.forEach(({ from, to }) => gh(["label", "edit", from, "--name", to, "--repo", repo]));
    plan.create.forEach(({ name, color, description }) => gh(["label", "create", name, "--repo", repo,
        "--color", color, "--description", description]));
    plan.update.forEach(({ name, color, description }) => gh(["label", "edit", name, "--repo", repo,
        "--color", color, "--description", description]));
    toDelete.forEach((name) => gh(["label", "delete", name, "--repo", repo, "--yes"]));
    console.log(`${repo}: done`);
    lines.forEach((line) => console.log(line));
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}
