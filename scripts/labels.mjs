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
import { parseArgs } from "node:util";
import { runIfMain } from "./cli.mjs";
import { resolveRepo } from "./config.mjs";
import { ghEnv } from "./gh.mjs";

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
    ...(current.name === wanted.name ? [] : ["name"]),
    ...(current.color?.toLowerCase() === wanted.color ? [] : ["color"]),
    ...((current.description ?? "") === wanted.description ? [] : ["description"]),
];

// GitHub label names are case-insensitive: "Bug" and "bug" are one label
const keyOf = (name) => name.toLowerCase();

/**
 * What `apply` has to do with the labels a repository has now. Pure. Plan entries carry the current names as GitHub
 * has them (`from`, `current`), so commands address existing labels exactly.
 * @param {{ name: string, color?: string, description?: string }[]} existing
 */
export const planLabels = (existing) => {
    const byKey = new Map(existing.map((label) => [keyOf(label.name), label]));
    const renames = [];
    const conflicts = [];
    RENAMES.forEach(([oldName, to]) => {
        const old = byKey.get(keyOf(oldName));
        if (!old) return;
        // Both exist: an interrupted run or a manual rename. Deleting the old one would strip it from its issues,
        // so the user moves them
        if (byKey.has(keyOf(to))) {
            conflicts.push({ from: old.name, to });
            return;
        }
        renames.push({ from: old.name, to });
        byKey.set(keyOf(to), { ...old, name: to });
        byKey.delete(keyOf(oldName));
    });

    const create = [];
    const update = [];
    const unchanged = [];
    LABELS.forEach((label) => {
        const current = byKey.get(keyOf(label.name));
        if (!current) {
            create.push(label);
            return;
        }
        const fields = changedFields(current, label);
        if (fields.length) update.push({ ...label, current: current.name, fields });
        else unchanged.push(label.name);
    });

    const ours = new Set(LABELS.map((label) => keyOf(label.name)));
    const conflicting = new Set(conflicts.map(({ from }) => from));
    const foreign = [...byKey.values()].map((label) => label.name)
        .filter((name) => !ours.has(keyOf(name)) && !conflicting.has(name))
        .sort();
    return { renames, conflicts, create, update, unchanged, foreign };
};

/** Only foreign labels and the old side of a conflict may be deleted. @returns {string[]} errors */
export const checkDeletion = (names, plan) => {
    const deletable = new Set([...plan.foreign, ...plan.conflicts.map(({ from }) => from)]);
    const ours = new Set(LABELS.map((label) => keyOf(label.name)));
    const renamed = new Map(plan.renames.map(({ from, to }) => [from, to]));
    return names.filter((name) => !deletable.has(name)).map((name) => {
        if (ours.has(keyOf(name))) return `"${name}" is a gh-tasks label and is never deleted`;
        if (renamed.has(name)) return `"${name}" is renamed to "${renamed.get(name)}" and keeps its issues`;
        return `"${name}" is not a label of this repository`;
    });
};

export const formatPlan = (plan, toDelete = []) => {
    const deleting = new Set(toDelete);
    const kept = plan.foreign.filter((name) => !deleting.has(name));
    return [
        ...plan.renames.map(({ from, to }) => `rename: ${from} → ${to}`),
        ...plan.create.map(({ name }) => `create: ${name}`),
        ...plan.update.map(({ name, current, fields }) =>
            `update: ${current === name ? name : `${current} → ${name}`} (${fields.join(", ")})`),
        ...toDelete.map((name) => `delete: ${name}`),
        ...plan.conflicts.filter(({ from }) => !deleting.has(from)).map(({ from, to }) =>
            `conflict: both "${from}" and "${to}" exist — move the issues to "${to}", then --delete "${from}"`),
        ...(kept.length ? [`foreign (kept): ${kept.join(", ")}`] : []),
        ...(plan.unchanged.length ? [`unchanged: ${plan.unchanged.length} labels`] : []),
    ];
};

const gh = (args, env) => {
    try {
        return execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env });
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

    const projectDir = path.resolve(values.project);
    const repo = resolveRepo(projectDir);
    const env = ghEnv(projectDir);
    const existing = JSON.parse(gh(["label", "list", "--repo", repo, "--limit", "1000",
        "--json", "name,color,description"], env));
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

    plan.renames.forEach(({ from, to }) => gh(["label", "edit", from, "--name", to, "--repo", repo], env));
    plan.create.forEach(({ name, color, description }) => gh(["label", "create", name, "--repo", repo,
        "--color", color, "--description", description], env));
    plan.update.forEach(({ name, current, color, description }) => gh(["label", "edit", current, "--repo", repo,
        ...(current === name ? [] : ["--name", name]), "--color", color, "--description", description], env));
    toDelete.forEach((name) => gh(["label", "delete", name, "--repo", repo, "--yes"], env));
    console.log(`${repo}: done`);
    lines.forEach((line) => console.log(line));
};

runIfMain(import.meta.url, main);
