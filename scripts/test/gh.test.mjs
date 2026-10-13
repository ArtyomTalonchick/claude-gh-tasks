import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getLocalConfigPath } from "../config.mjs";
import { checkGhArgs, ghEnv, parseAccounts, splitArgs } from "../gh.mjs";

describe("checkGhArgs", () => {
    [
        ["issue", "list", "--state", "open"],
        ["issue", "edit", "11", "--add-label", "status:in-progress"],
        ["issue", "view", "11", "--comments"],
        ["issue", "close", "11", "--reason", "completed"],
        ["issue", "create", "--title", "x", "--label", "status:inbox"],
        ["label", "list", "--limit", "1"],
        ["search", "issues", "--repo", "owner/name", "key words"],
    ].forEach((args, i) => {
        test(`${i + 1}. allowed: gh ${args.join(" ")}`, () => {
            assert.equal(checkGhArgs(args), null);
        });
    });

    [
        [[], /only gh issue/],
        [["api", "repos/owner/name"], /only gh issue/],
        [["auth", "token"], /only gh issue/],
        [["repo", "delete", "owner/name"], /only gh issue/],
        [["pr", "list"], /only gh issue/],
        [["search", "repos", "x"], /only gh issue/],
        [["-R", "owner/name", "issue", "list"], /only gh issue/],
        [["issue"], /needs a subcommand/],
        [["issue", "--help"], /needs a subcommand/],
        [["label"], /needs a subcommand/],
        [["issue", "delete", "11", "--yes"], /not run by gh-tasks/],
        [["issue", "transfer", "11", "owner/other"], /not run by gh-tasks/],
    ].forEach(([args, message], i) => {
        test(`${i + 8}. refused: gh ${args.join(" ")}`, () => {
            assert.match(checkGhArgs(args), message);
        });
    });
});

describe("splitArgs", () => {
    test("1. --project first, the rest goes to gh untouched", () => {
        assert.deepEqual(splitArgs(["--project", "C:/p q", "issue", "edit", "1", "--body", "a b"]), {
            projectDir: "C:/p q",
            ghArgs: ["issue", "edit", "1", "--body", "a b"],
        });
    });

    [
        [],
        ["--project"],
        ["issue", "list", "--project", "dir"],
        ["--project=dir", "issue", "list"],
    ].forEach((argv, i) => {
        test(`${i + 2}. no leading --project <dir> → null: ${JSON.stringify(argv)}`, () => {
            assert.equal(splitArgs(argv), null);
        });
    });
});

describe("parseAccounts", () => {
    test("1. github.com accounts with the active one marked", () => {
        const text = JSON.stringify({
            hosts: {
                "github.com": [
                    { state: "success", active: true, host: "github.com", login: "first", tokenSource: "keyring" },
                    { state: "success", active: false, host: "github.com", login: "second", tokenSource: "keyring" },
                ],
                "ghe.corp.example": [{ active: true, login: "corp" }],
            },
        });
        assert.deepEqual(parseAccounts(text), [{ login: "first", active: true }, { login: "second", active: false }]);
    });

    test("2. no github.com entry → empty", () => {
        assert.deepEqual(parseAccounts("{\"hosts\":{}}"), []);
    });

    test("3. entries without a login are skipped", () => {
        assert.deepEqual(parseAccounts("{\"hosts\":{\"github.com\":[{\"active\":true},null]}}"), []);
    });

    test("4. not JSON → throws", () => {
        assert.throws(() => parseAccounts("unknown flag: --json"));
    });
});

describe("ghEnv", () => {
    const tempDirs = [];
    const makeProject = (content) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-tasks-gh-"));
        tempDirs.push(dir);
        if (content !== undefined) {
            fs.mkdirSync(path.dirname(getLocalConfigPath(dir)), { recursive: true });
            fs.writeFileSync(getLocalConfigPath(dir), content);
        }
        return dir;
    };
    const readToken = (login) => `token-of-${login}`;
    const noToken = () => { throw new Error("must not be read"); };

    after(() => tempDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

    test("1. no local config → the current environment, no token read", () => {
        assert.equal(ghEnv(makeProject(), { readToken: noToken }), process.env);
    });

    test("2. no account in the local config → the current environment", () => {
        assert.equal(ghEnv(makeProject("{}"), { readToken: noToken }), process.env);
    });

    test("3. an account → GH_TOKEN of that account, the rest of the environment kept", () => {
        const { GH_TOKEN, ...rest } = ghEnv(makeProject("{ \"account\": \"some-user\" }"), { readToken });
        assert.equal(GH_TOKEN, "token-of-some-user");
        const current = { ...process.env };
        delete current.GH_TOKEN;
        assert.deepEqual(rest, current);
    });

    test("4. the configured account wins over a GH_TOKEN already set", () => {
        const saved = process.env.GH_TOKEN;
        process.env.GH_TOKEN = "outer";
        try {
            assert.equal(ghEnv(makeProject("{ \"account\": \"a\" }"), { readToken }).GH_TOKEN, "token-of-a");
        } finally {
            if (saved === undefined) delete process.env.GH_TOKEN;
            else process.env.GH_TOKEN = saved;
        }
    });

    test("5. an invalid local config → throws", () => {
        assert.throws(() => ghEnv(makeProject("{ \"account\": \"-bad\" }"), { readToken }), /"account" must be/);
    });

    test("6. a missing stored token → the error of readToken", () => {
        const failing = () => { throw new Error("gh has no stored token"); };
        assert.throws(() => ghEnv(makeProject("{ \"account\": \"a\" }"), { readToken: failing }), /no stored token/);
    });
});
