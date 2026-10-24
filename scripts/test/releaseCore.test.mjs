import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
    buildPushArgs, buildReleaseApiArgs, explainPushFailure, findRelease, findRemoteTag, getPublishRefusal,
    getPushRefusal, getReleaseState, getTagName, isBranchName, isTagName, pickReleaseMilestone, PUSH_TOKEN_VARIABLE,
} from "../releaseCore.mjs";

const REPO = "owner/name";

describe("getTagName / isTagName", () => {
    test("1. the version is always X.Y.Z", () => {
        assert.equal(getTagName("v{version}", "v1.3.9"), "v1.3.9");
        assert.equal(getTagName("v{version}", "v1.3"), "v1.3.0");
        assert.equal(getTagName("release-{version}", "v2.0.1"), "release-2.0.1");
    });

    test("2. no tag → null", () => {
        assert.equal(getTagName(false, "v1.3.9"), null);
    });

    test("3. not a milestone title → throws", () => {
        assert.throws(() => getTagName("v{version}", "Backlog"), /vX\.Y/);
    });

    [
        ["v1.2.3", true],
        ["release-1.2.3", true],
        ["v1..2", false],
        ["-v1", false],
        [".v1", false],
        ["tags/v1", false],
        ["v1 2", false],
        ["", false],
        [undefined, false],
    ].forEach(([tag, expected], i) => {
        test(`${i + 4}. ${JSON.stringify(tag)} → ${expected}`, () => {
            assert.equal(isTagName(tag), expected);
        });
    });
});

describe("buildReleaseApiArgs", () => {
    test("1. list: one page of releases", () => {
        assert.deepEqual(buildReleaseApiArgs("list", REPO, { page: 2 }), [
            "api", `repos/${REPO}/releases?per_page=100&page=2`,
            "--method", "GET",
            "-H", "Accept: application/vnd.github+json",
        ]);
    });

    test("2. create and update take the payload from stdin", () => {
        assert.deepEqual(buildReleaseApiArgs("create", REPO, { hasPayload: true }), [
            "api", `repos/${REPO}/releases`,
            "--method", "POST",
            "-H", "Accept: application/vnd.github+json",
            "--input", "-",
        ]);
        const update = buildReleaseApiArgs("update", REPO, { id: 42, hasPayload: true });
        assert.equal(update[1], `repos/${REPO}/releases/42`);
        assert.equal(update[3], "PATCH");
    });

    test("3. tag: the matching refs of one tag", () => {
        const args = buildReleaseApiArgs("tag", REPO, { tag: "v1.2.0" });
        assert.equal(args[1], `repos/${REPO}/git/matching-refs/tags/v1.2.0`);
        assert.equal(args[3], "GET");
    });

    ["delete", "upload", "constructor", undefined].forEach((action, i) => {
        test(`${i + 4}. action ${action} refused`, () => {
            assert.throws(() => buildReleaseApiArgs(action, REPO), /not allowed/);
        });
    });

    [
        ["update", { id: 0 }],
        ["update", { id: "42" }],
        ["update", {}],
        ["list", { page: 0 }],
        ["tag", { tag: "../milestones" }],
        ["tag", {}],
    ].forEach(([action, options], i) => {
        test(`${i + 8}. ${action} ${JSON.stringify(options)} refused`, () => {
            assert.throws(() => buildReleaseApiArgs(action, REPO, options));
        });
    });

    test("14. a bad repository is refused", () => {
        assert.throws(() => buildReleaseApiArgs("list", "../x"), /owner\/name/);
    });
});

describe("findRelease / getReleaseState / findRemoteTag", () => {
    const releases = [
        { id: 1, tag_name: "v1.1.0", draft: false },
        { id: 2, tag_name: "v1.2.0", draft: true },
    ];

    test("1. by tag, drafts included", () => {
        assert.equal(findRelease(releases, "v1.2.0").id, 2);
        assert.equal(findRelease(releases, "v1.3.0"), null);
    });

    test("2. none / draft / published", () => {
        assert.equal(getReleaseState(null), "none");
        assert.equal(getReleaseState(releases[1]), "draft");
        assert.equal(getReleaseState(releases[0]), "published");
    });

    test("3. the exact tag only: matching-refs matches by prefix", () => {
        const refs = [
            { ref: "refs/tags/v1.2.0", object: { sha: "aaa" } },
            { ref: "refs/tags/v1.2.0-rc", object: { sha: "bbb" } },
        ];
        assert.equal(findRemoteTag(refs, "v1.2.0"), "aaa");
        assert.equal(findRemoteTag(refs.slice(1), "v1.2.0"), null);
        assert.equal(findRemoteTag([], "v1.2.0"), null);
    });
});

describe("pickReleaseMilestone", () => {
    test("1. the open release milestone wins", () => {
        const milestones = [
            { title: "v1.3.0", state: "closed" },
            { title: "Backlog", state: "open" },
            { title: "v1.4.0", state: "open" },
        ];
        assert.equal(pickReleaseMilestone(milestones).title, "v1.4.0");
    });

    test("2. none open → the highest closed one", () => {
        const milestones = [
            { title: "v1.10", state: "closed" },
            { title: "v1.9.5", state: "closed" },
            { title: "Backlog", state: "open" },
        ];
        assert.equal(pickReleaseMilestone(milestones).title, "v1.10");
    });

    test("3. no release milestone → null", () => {
        assert.equal(pickReleaseMilestone([]), null);
        assert.equal(pickReleaseMilestone([{ title: "Someday", state: "closed" }]), null);
    });
});

describe("getPublishRefusal", () => {
    const draft = { id: 2, draft: true, html_url: "https://x/2" };
    const state = { tag: "v1.2.0", release: draft, localTag: "aaa", remoteTag: "aaa" };

    test("1. a draft whose tag is on GitHub and is the local one → allowed", () => {
        assert.equal(getPublishRefusal(state), null);
    });

    test("2. no local tag, the tag is on GitHub → allowed", () => {
        assert.equal(getPublishRefusal({ ...state, localTag: null }), null);
    });

    [
        [{ release: null }, /no draft/],
        [{ release: { ...draft, draft: false } }, /already published/],
        [{ remoteTag: null }, /not on GitHub/],
        [{ remoteTag: "bbbbbbbbb" }, /not the local one/],
    ].forEach(([change, message], i) => {
        test(`${i + 3}. refused: ${JSON.stringify(change)}`, () => {
            assert.match(getPublishRefusal({ ...state, ...change }), message);
        });
    });
});

describe("buildPushArgs / isBranchName", () => {
    test("1. the branch and the tag go to the HTTPS URL of the repository, plain refs only", () => {
        const args = buildPushArgs(REPO, { branch: "main", tag: "v1.2.0" });
        assert.deepEqual(args.slice(-4), ["push", "https://github.com/owner/name.git", "main", "v1.2.0"]);
        assert.ok(!args.some((arg) => arg.startsWith("--force") || arg === "-f" || arg.includes(":")
            && !arg.startsWith("credential.helper=") && !arg.startsWith("https://")));
    });

    test("2. the token is read from the environment by the helper, never passed as an argument", () => {
        const args = buildPushArgs(REPO, { branch: "main", tag: null });
        assert.deepEqual(args.slice(0, 3), ["-c", "credential.helper=", "-c"]);
        assert.ok(args[3].includes(`password=$${PUSH_TOKEN_VARIABLE}`));
        assert.deepEqual(args.slice(-3), ["push", "https://github.com/owner/name.git", "main"]);
    });

    ["main", "release/2.1", "feature-x_1.2"].forEach((branch, i) => {
        test(`${i + 3}. a branch name: ${branch}`, () => assert.ok(isBranchName(branch)));
    });

    ["", "-f", "--force", "main:other", "+main", "a..b", ".hidden", "a/.b", "main.", "a b", "/main", "main/"]
        .forEach((branch, i) => {
            test(`${i + 6}. refused: ${JSON.stringify(branch)}`, () => {
                assert.equal(isBranchName(branch), false);
                assert.throws(() => buildPushArgs(REPO, { branch, tag: null }), /not a branch name/);
            });
        });

    test("18. a bad tag or repository is refused", () => {
        assert.throws(() => buildPushArgs(REPO, { branch: "main", tag: "--delete" }), /not a tag name/);
        assert.throws(() => buildPushArgs("owner", { branch: "main", tag: null }), /"owner\/name"/);
    });
});

describe("getPushRefusal", () => {
    const state = { branch: "main", tag: "v1.2.0", localTag: "aaa", tagAtHead: true, remoteTag: null };

    test("1. the local tag at HEAD, not on GitHub → allowed", () => {
        assert.equal(getPushRefusal(state), null);
    });

    test("2. no tag in the config → the branch alone is allowed", () => {
        assert.equal(getPushRefusal({ branch: "main", tag: null, localTag: null, tagAtHead: null, remoteTag: null }), null);
    });

    [
        [{ branch: null }, /not on a branch/],
        [{ localTag: null, tagAtHead: null }, /no local tag/],
        [{ remoteTag: "aaa" }, /on GitHub already/],
        [{ tagAtHead: false }, /not at HEAD/],
    ].forEach(([change, message], i) => {
        test(`${i + 3}. refused: ${JSON.stringify(change)}`, () => {
            assert.match(getPushRefusal({ ...state, ...change }), message);
        });
    });
});

describe("explainPushFailure", () => {
    test("1. a rejection says the user decides and never forces", () => {
        const stderr = " ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs";
        assert.match(explainPushFailure(stderr, "main"), /GitHub has commits that main lacks.*never force/);
    });

    test("2. any other failure keeps git's message", () => {
        assert.equal(explainPushFailure("fatal: Authentication failed\n", "main"),
            "git push failed: fatal: Authentication failed");
    });
});
