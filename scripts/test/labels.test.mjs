import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { checkDeletion, formatPlan, LABELS, planLabels, RENAMES } from "../labels.mjs";

const ours = LABELS.map(({ name, color, description }) => ({ name, color, description }));

describe("LABELS and RENAMES", () => {
    test("1. names are unique", () => {
        assert.equal(new Set(LABELS.map((l) => l.name)).size, LABELS.length);
    });

    test("2. colours are 6-digit lowercase hex, descriptions fit GitHub's 100 characters", () => {
        LABELS.forEach(({ name, color, description }) => {
            assert.match(color, /^[0-9a-f]{6}$/, name);
            assert.ok(description.length > 0 && description.length <= 100, name);
        });
    });

    test("3. every rename targets one of our labels, no target twice", () => {
        const names = new Set(LABELS.map((l) => l.name));
        RENAMES.forEach(([, to]) => assert.ok(names.has(to), to));
        assert.equal(new Set(RENAMES.map(([, to]) => to)).size, RENAMES.length);
    });
});

describe("planLabels", () => {
    test("1. empty repository → create everything", () => {
        const plan = planLabels([]);
        assert.equal(plan.create.length, LABELS.length);
        const { renames, conflicts, update, unchanged, foreign } = plan;
        assert.deepEqual([renames, conflicts, update, unchanged, foreign], [[], [], [], [], []]);
    });

    test("2. all in place → unchanged; colour case is ignored", () => {
        const plan = planLabels(ours.map((l) => ({ ...l, color: l.color.toUpperCase() })));
        assert.equal(plan.unchanged.length, LABELS.length);
        assert.deepEqual([plan.create, plan.update], [[], []]);
    });

    test("3. a different colour or description → update with the changed fields", () => {
        const existing = ours.map((l) => (l.name === "type:bug" ? { ...l, color: "000000", description: "" } : l));
        const { update } = planLabels(existing);
        assert.equal(update.length, 1);
        assert.equal(update[0].name, "type:bug");
        assert.deepEqual(update[0].fields, ["color", "description"]);
    });

    test("4. an old name → rename, then the renamed label is updated, not created", () => {
        const plan = planLabels([{ name: "bug", color: "d73a4a", description: "Something isn't working" }]);
        assert.deepEqual(plan.renames, [{ from: "bug", to: "type:bug" }]);
        assert.ok(!plan.create.some((l) => l.name === "type:bug"));
        assert.deepEqual(plan.update.map((l) => l.name), ["type:bug"]);
        assert.deepEqual(plan.foreign, []);
    });

    test("5. old and new both exist → conflict, nothing renamed, old not foreign", () => {
        const plan = planLabels([...ours, { name: "p1", color: "ff0000" }]);
        assert.deepEqual(plan.conflicts, [{ from: "p1", to: "prio:critical" }]);
        assert.deepEqual([plan.renames, plan.foreign], [[], []]);
    });

    test("6. other labels → foreign, sorted; enhancement is not renamed", () => {
        const plan = planLabels([{ name: "wontfix" }, { name: "enhancement" }, { name: "good first issue" }]);
        assert.deepEqual(plan.foreign, ["enhancement", "good first issue", "wontfix"]);
        assert.deepEqual(plan.renames, []);
    });
});

describe("checkDeletion", () => {
    const plan = planLabels([...ours, { name: "wontfix" }, { name: "p2" }]);

    test("1. foreign and the old side of a conflict may go", () => {
        assert.deepEqual(checkDeletion(["wontfix", "p2"], plan), []);
    });

    test("2. our labels never", () => {
        assert.match(checkDeletion(["type:bug"], plan)[0], /never deleted/);
    });

    test("3. unknown names are refused", () => {
        assert.match(checkDeletion(["nope"], plan)[0], /not a label/);
    });
});

describe("formatPlan", () => {
    test("1. every kind of line, deleted labels leave the foreign list", () => {
        const plan = planLabels([{ name: "bug" }, { name: "p1" }, { name: "prio:critical" }, { name: "a" }, { name: "b" }]);
        const lines = formatPlan(plan, ["a"]);
        assert.ok(lines.includes("rename: bug → type:bug"));
        assert.ok(lines.includes("create: status:inbox"));
        assert.ok(lines.includes("update: type:bug (color, description)"));
        assert.ok(lines.includes("delete: a"));
        assert.ok(lines.some((line) => line.startsWith("conflict: both \"p1\" and \"prio:critical\"")));
        assert.ok(lines.includes("foreign (kept): b"));
    });

    test("2. a deleted conflict label is not reported as a conflict", () => {
        const plan = planLabels([...ours, { name: "p1" }]);
        assert.ok(!formatPlan(plan, ["p1"]).some((line) => line.startsWith("conflict")));
    });
});
