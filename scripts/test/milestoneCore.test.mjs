import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
    buildApiArgs, compareVersions, findMilestone, formatLocalTime, getDueOn, getLatestVersion, getMilestonePath,
    getMilestoneStatus, getNextMinor, getNextPatch, getOpenMilestones, isMilestoneTitle, parseVersion,
    parseVersionOutput, splitCommand,
} from "../milestoneCore.mjs";

const REPO = "owner/name";

describe("isMilestoneTitle / parseVersion", () => {
    [
        ["v1.3.9", [1, 3, 9]],
        ["v1.10.0", [1, 10, 0]],
        ["v0.0.0", [0, 0, 0]],
        ["1.3.9", null],
        ["v1.3", null],
        ["v1.3.9-rc", null],
        [" v1.3.9", null],
        ["v01.2.3", null],
        ["v1.2.03", null],
        ["release", null],
        [undefined, null],
    ].forEach(([title, expected], i) => {
        test(`${i + 1}. ${title} → ${JSON.stringify(expected)}`, () => {
            assert.deepEqual(parseVersion(title), expected);
            assert.equal(isMilestoneTitle(title), expected !== null);
        });
    });
});

describe("compareVersions / getLatestVersion / getNextPatch / getNextMinor", () => {
    test("1. numeric, not lexical", () => {
        assert.ok(compareVersions("v1.10.0", "v1.9.9") > 0);
        assert.ok(compareVersions("v2.0.0", "v1.99.99") > 0);
        assert.equal(compareVersions("v1.2.3", "v1.2.3"), 0);
    });

    test("2. the highest vX.Y.Z wins, other titles ignored", () => {
        assert.equal(getLatestVersion(["v0.1.0", "Backlog", "v0.10.0", "v0.9.3"]), "v0.10.0");
    });

    test("3. no versions → null", () => {
        assert.equal(getLatestVersion([]), null);
        assert.equal(getLatestVersion(["Someday"]), null);
        assert.equal(getLatestVersion(undefined), null);
    });

    test("4. next patch", () => {
        assert.equal(getNextPatch("v0.1.9"), "v0.1.10");
        assert.equal(getNextPatch("v1.0.0"), "v1.0.1");
    });

    test("5. next minor: patch back to 0", () => {
        assert.equal(getNextMinor("v0.9.3"), "v0.10.0");
        assert.equal(getNextMinor("v1.2.0"), "v1.3.0");
    });
});

describe("getMilestonePath", () => {
    test("1. the list", () => {
        assert.equal(getMilestonePath(REPO), `repos/${REPO}/milestones`);
    });

    test("2. one milestone", () => {
        assert.equal(getMilestonePath(REPO, 4), `repos/${REPO}/milestones/4`);
    });

    // The path is the only door to gh api: it must never lead beyond milestones
    [
        ["../../repos/other/repo", undefined],
        ["owner/repo?state=all", undefined],
        ["owner/repo/issues", undefined],
        ["owner", undefined],
        ["", undefined],
        [undefined, undefined],
        [REPO, "4"],
        [REPO, 1.5],
        [REPO, 0],
        [REPO, -1],
        [REPO, "../release"],
    ].forEach(([repo, number], i) => {
        test(`${i + 3}. refused: ${repo} / ${number}`, () => {
            assert.throws(() => getMilestonePath(repo, number));
        });
    });
});

describe("buildApiArgs", () => {
    test("1. list: every state, one page", () => {
        assert.deepEqual(buildApiArgs("GET", REPO, { page: 2 }), [
            "api", `repos/${REPO}/milestones?state=all&per_page=100&page=2`,
            "--method", "GET", "-H", "Accept: application/vnd.github+json",
        ]);
    });

    test("2. create: payload from stdin", () => {
        assert.deepEqual(buildApiArgs("POST", REPO, { hasPayload: true }).slice(1), [
            `repos/${REPO}/milestones`, "--method", "POST", "-H", "Accept: application/vnd.github+json",
            "--input", "-",
        ]);
    });

    test("3. update one milestone: no query", () => {
        assert.equal(buildApiArgs("PATCH", REPO, { number: 7, hasPayload: true })[1], `repos/${REPO}/milestones/7`);
    });

    ["DELETE", "PUT", "get", undefined].forEach((method, i) => {
        test(`${i + 4}. method ${method} refused`, () => {
            assert.throws(() => buildApiArgs(method, REPO), /not allowed/);
        });
    });

    test("8. bad page refused", () => {
        assert.throws(() => buildApiArgs("GET", REPO, { page: 0 }));
    });
});

describe("findMilestone / getOpenMilestones", () => {
    const milestones = [
        { title: "v0.1.0", number: 1, state: "closed" },
        { title: "v0.1.1", number: 2, state: "open" },
        { title: "Backlog", number: 3, state: "open" },
    ];

    test("1. by title", () => {
        assert.equal(findMilestone(milestones, "v0.1.1").number, 2);
        assert.equal(findMilestone(milestones, "v9.9.9"), undefined);
    });

    test("2. open release milestones only, foreign titles ignored", () => {
        assert.deepEqual(getOpenMilestones(milestones).map((m) => m.title), ["v0.1.1"]);
    });
});

describe("getDueOn", () => {
    test("1. end of the day in UTC", () => {
        assert.equal(getDueOn("2026-09-25"), "2026-09-25T23:59:59Z");
    });

    test("2. not given → undefined", () => {
        assert.equal(getDueOn(undefined), undefined);
    });

    ["25.09.2026", "2026-9-25", "2026-13-01", "2026-02-30", "tomorrow"].forEach((date, i) => {
        test(`${i + 3}. refused: ${date}`, () => {
            assert.throws(() => getDueOn(date), /YYYY-MM-DD/);
        });
    });
});

describe("splitCommand", () => {
    [
        ["node tools/release/release.mjs next-version", ["node", "tools/release/release.mjs", "next-version"]],
        ["  node   a.mjs  ", ["node", "a.mjs"]],
        ["node \"my tools/next.mjs\" --x", ["node", "my tools/next.mjs", "--x"]],
        ["node 'a b.mjs'", ["node", "a b.mjs"]],
        ["node --label=\"a b\"", ["node", "--label=a b"]],
        ["node \"\"", ["node", ""]],
        ["node a.mjs && rm -rf /", ["node", "a.mjs", "&&", "rm", "-rf", "/"]],
    ].forEach(([command, expected], i) => {
        test(`${i + 1}. ${command}`, () => {
            assert.deepEqual(splitCommand(command), expected);
        });
    });

    test("8. unterminated quote refused", () => {
        assert.throws(() => splitCommand("node \"a.mjs"), /unterminated/);
    });

    test("9. empty refused", () => {
        assert.throws(() => splitCommand("   "), /empty/);
    });
});

describe("parseVersionOutput", () => {
    test("1. the first line", () => {
        assert.equal(parseVersionOutput("v1.4.0\nPatch +1 from v1.3.9\n"), "v1.4.0");
        assert.equal(parseVersionOutput("v1.4.0\r\n"), "v1.4.0");
        assert.equal(parseVersionOutput("  v1.4.0  "), "v1.4.0");
    });

    ["1.4.0", "", "Next: v1.4.0", undefined].forEach((stdout, i) => {
        test(`${i + 2}. refused: ${JSON.stringify(stdout)}`, () => {
            assert.throws(() => parseVersionOutput(stdout), /vX\.Y\.Z/);
        });
    });
});

describe("formatLocalTime", () => {
    const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;
    ["2026-10-12T22:41:07Z", "2026-01-01T00:00:00Z", "2026-06-30T23:59:59Z"].forEach((iso, i) => {
        test(`${i + 1}. ${iso} keeps the instant`, () => {
            const local = formatLocalTime(iso);
            assert.match(local, LOCAL_TIME);
            assert.equal(new Date(local).getTime(), new Date(iso).getTime());
        });
    });

    test("4. the date is the local one", () => {
        const date = new Date(2026, 9, 13, 0, 30, 5);
        assert.equal(formatLocalTime(date.toISOString()).slice(0, 19), "2026-10-13T00:30:05");
    });
});

describe("getMilestoneStatus", () => {
    [
        [{ state: "open", open_issues: 1, closed_issues: 1 }, "open — in progress"],
        [{ state: "open", open_issues: 0, closed_issues: 2 }, "open — waiting for a release"],
        [{ state: "open", open_issues: 0, closed_issues: 0 }, "open — empty"],
    ].forEach(([milestone, expected], i) => {
        test(`${i + 1}. ${expected}`, () => assert.equal(getMilestoneStatus(milestone), expected));
    });

    test("4. closed → released at the local time", () => {
        const closedAt = "2026-10-12T22:41:07Z";
        assert.equal(
            getMilestoneStatus({ state: "closed", closed_at: closedAt, open_issues: 0, closed_issues: 5 }),
            `closed — released ${formatLocalTime(closedAt)}`,
        );
    });
});
