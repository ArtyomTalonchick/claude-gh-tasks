import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    DEFAULTS, getConfigPath, getLocalConfigPath, isLogin, loadConfig, loadLocalConfig, parseRepoFromRemote, resolveRepo,
    validateConfig, validateLocalConfig,
} from "../config.mjs";

describe("validateConfig", () => {
    test("1. empty object → defaults, no errors or warnings", () => {
        const { config, errors, warnings } = validateConfig({});
        assert.deepEqual(config, DEFAULTS);
        assert.deepEqual(errors, []);
        assert.deepEqual(warnings, []);
    });

    test("2. defaults are not shared between calls", () => {
        validateConfig({}).config.commit.types.push("perf");
        assert.deepEqual(validateConfig({}).config.commit.types, DEFAULTS.commit.types);
    });

    test("3. a partial section is completed from defaults", () => {
        const { config } = validateConfig({ commit: { trailers: true } });
        assert.deepEqual(config.commit, { ...DEFAULTS.commit, trailers: true });
    });

    test("4. a full valid config is kept as is", () => {
        const raw = {
            repo: "owner/name",
            language: "ru",
            milestones: false,
            version: { scheme: "command", command: "node tools/release/release.mjs next-version" },
            checks: ["npm run lint", "npm test"],
            commit: { format: "type (scope): subject", example: "fix (cart): x", types: ["fix"], trailers: false },
            issueTemplate: { extraLines: ["**Who is affected:** <customers | staff>"] },
        };
        const { config, errors, warnings } = validateConfig(raw);
        assert.deepEqual(config, raw);
        assert.deepEqual(errors, []);
        assert.deepEqual(warnings, []);
    });

    [
        [null, "the config must be a JSON object"],
        [[], "the config must be a JSON object"],
        ["text", "the config must be a JSON object"],
        [{ repo: "name-only" }, "\"repo\" must be"],
        [{ repo: "owner/.." }, "\"repo\" must be"],
        [{ repo: "../../owner/name" }, "\"repo\" must be"],
        [{ language: "" }, "\"language\" must be"],
        [{ milestones: "yes" }, "\"milestones\" must be"],
        [{ version: "patch" }, "\"version\" must be an object"],
        [{ version: { scheme: "minor" } }, "\"version.scheme\" must be"],
        [{ version: { scheme: "command" } }, "\"version.command\" is required"],
        [{ version: { scheme: "command", command: " " } }, "\"version.command\" must be"],
        [{ checks: "npm test" }, "\"checks\" must be"],
        [{ checks: ["npm test", ""] }, "\"checks\" must be"],
        [{ commit: { format: 1 } }, "\"commit.format\" must be"],
        [{ commit: { types: [] } }, "\"commit.types\" must be"],
        [{ commit: { trailers: "no" } }, "\"commit.trailers\" must be"],
        [{ issueTemplate: { extraLines: [1] } }, "\"issueTemplate.extraLines\" must be"],
    ].forEach(([raw, message], i) => {
        test(`${i + 5}. error: ${JSON.stringify(raw)}`, () => {
            const { errors } = validateConfig(raw);
            assert.equal(errors.length, 1, errors.join("; "));
            assert.ok(errors[0].startsWith(message), errors[0]);
        });
    });

    test("23. unknown fields → warnings at every level, dropped from the config", () => {
        const { config, errors, warnings } = validateConfig({ extra: 1, commit: { style: "x" } });
        assert.deepEqual(errors, []);
        assert.deepEqual(warnings, [
            "unknown field \"extra\" is ignored",
            "unknown field \"commit.style\" is ignored",
        ]);
        assert.deepEqual(config, DEFAULTS);
    });

    test("24. version.command with scheme patch → warning, dropped", () => {
        const { config, errors, warnings } = validateConfig({ version: { command: "node next.mjs" } });
        assert.deepEqual(errors, []);
        assert.equal(warnings.length, 1);
        assert.deepEqual(config.version, { scheme: "patch" });
    });

    test("25. an invalid field falls back to its default", () => {
        assert.equal(validateConfig({ milestones: "yes" }).config.milestones, true);
    });
});

describe("isLogin", () => {
    [
        ["ArtyomTalonchick", true],
        ["a", true],
        ["user-1", true],
        ["a".repeat(39), true],
        ["a".repeat(40), false],
        ["-user", false],
        ["user-", false],
        ["us--er", false],
        ["user_name", false],
        ["", false],
        [42, false],
    ].forEach(([value, expected], i) => {
        test(`${i + 1}. ${JSON.stringify(value)} → ${expected}`, () => {
            assert.equal(isLogin(value), expected);
        });
    });
});

describe("validateLocalConfig", () => {
    test("1. an account is kept", () => {
        assert.deepEqual(validateLocalConfig({ account: "user" }), { local: { account: "user" }, errors: [], warnings: [] });
    });

    test("2. empty object → no account, no defaults", () => {
        assert.deepEqual(validateLocalConfig({}), { local: {}, errors: [], warnings: [] });
    });

    test("3. invalid login → error", () => {
        assert.match(validateLocalConfig({ account: "user name" }).errors[0], /^"account" must be a GitHub login/);
    });

    test("4. unknown field → warning", () => {
        assert.deepEqual(validateLocalConfig({ language: "ru" }).warnings, ["unknown field \"language\" is ignored"]);
    });

    test("5. not an object → error", () => {
        assert.deepEqual(validateLocalConfig([]).errors, ["the local config must be a JSON object"]);
    });
});

describe("parseRepoFromRemote", () => {
    [
        ["git@github.com:owner/name.git", "owner/name"],
        ["git@github.com:owner/name", "owner/name"],
        ["https://github.com/owner/name.git", "owner/name"],
        ["https://github.com/owner/name", "owner/name"],
        ["https://github.com/owner/name/", "owner/name"],
        ["https://user@github.com/owner/name.git", "owner/name"],
        ["ssh://git@github.com/owner/name.git", "owner/name"],
        ["git@github.com:Owner-1/my.repo_x.git\n", "Owner-1/my.repo_x"],
        ["https://GitHub.com/owner/name.git", "owner/name"],
        ["git@ghe.corp.example:org/app.git", null],
        ["https://gitlab.com/owner/name.git", null],
        ["", null],
        ["C:\\Projects\\name", null],
        ["../local/name", null],
        ["https://github.com/owner", null],
        ["https://github.com/owner/name/extra", null],
        [undefined, null],
    ].forEach(([url, expected], i) => {
        test(`${i + 1}. ${JSON.stringify(url)} → ${expected}`, () => {
            assert.equal(parseRepoFromRemote(url), expected);
        });
    });
});

describe("loadConfig", () => {
    const tempDirs = [];
    const makeProject = (content) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-tasks-config-"));
        tempDirs.push(dir);
        if (content !== undefined) {
            fs.mkdirSync(path.dirname(getConfigPath(dir)), { recursive: true });
            fs.writeFileSync(getConfigPath(dir), content);
        }
        return dir;
    };
    const remote = (url) => ({ getRemoteUrl: () => url });
    const noRemote = { getRemoteUrl: () => { throw new Error("no origin"); } };

    after(() => tempDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

    test("1. no config file → error", () => {
        const { config, errors } = loadConfig(makeProject(), noRemote);
        assert.equal(config, null);
        assert.match(errors[0], /^no config at /);
    });

    test("2. broken JSON → error", () => {
        const { config, errors } = loadConfig(makeProject("{ \"language\": "), noRemote);
        assert.equal(config, null);
        assert.match(errors[0], /is not valid JSON/);
    });

    test("3. repo from the config, remote not asked", () => {
        const { config, errors } = loadConfig(makeProject("{ \"repo\": \"owner/name\" }"), noRemote);
        assert.deepEqual(errors, []);
        assert.equal(config.repo, "owner/name");
    });

    test("4. repo from the origin remote", () => {
        const { config } = loadConfig(makeProject("{}"), remote("git@github.com:owner/name.git"));
        assert.equal(config.repo, "owner/name");
    });

    test("5. no repo and no remote → error", () => {
        const { config, errors } = loadConfig(makeProject("{}"), noRemote);
        assert.equal(config, null);
        assert.match(errors[0], /"repo" is not set/);
    });

    test("6. BOM is accepted", () => {
        const { errors } = loadConfig(makeProject("\uFEFF{ \"repo\": \"owner/name\" }"), noRemote);
        assert.deepEqual(errors, []);
    });

    test("7. invalid config → null config, warnings kept", () => {
        const { config, errors, warnings } = loadConfig(makeProject("{ \"milestones\": 1, \"x\": 1 }"), noRemote);
        assert.equal(config, null);
        assert.equal(errors.length, 1);
        assert.equal(warnings.length, 1);
    });

    test("8. resolveRepo: config repo wins over the remote", () => {
        const dir = makeProject("{ \"repo\": \"owner/name\" }");
        assert.equal(resolveRepo(dir, remote("git@github.com:other/repo.git")), "owner/name");
    });

    test("9. resolveRepo: no config → the remote", () => {
        assert.equal(resolveRepo(makeProject(), remote("https://github.com/owner/name.git")), "owner/name");
    });

    test("10. resolveRepo: invalid config → throws, the remote is not a fallback", () => {
        const dir = makeProject("{ \"milestones\": 1 }");
        assert.throws(() => resolveRepo(dir, remote("git@github.com:owner/name.git")), /"milestones" must be/);
    });

    test("11. resolveRepo: no config and no remote → throws", () => {
        assert.throws(() => resolveRepo(makeProject(), noRemote), /no config/);
    });

    const writeLocal = (dir, content) => {
        fs.mkdirSync(path.dirname(getLocalConfigPath(dir)), { recursive: true });
        fs.writeFileSync(getLocalConfigPath(dir), content);
        return dir;
    };

    test("12. no local config → no account", () => {
        const { config, errors } = loadConfig(makeProject("{ \"repo\": \"owner/name\" }"), noRemote);
        assert.deepEqual(errors, []);
        assert.equal("account" in config, false);
    });

    test("13. the account comes from the local config", () => {
        const dir = writeLocal(makeProject("{ \"repo\": \"owner/name\" }"), "{ \"account\": \"user\" }");
        assert.equal(loadConfig(dir, noRemote).config.account, "user");
    });

    test("14. an invalid local config makes the config invalid, the error names the file", () => {
        const dir = writeLocal(makeProject("{ \"repo\": \"owner/name\" }"), "{ \"account\": 1 }");
        const { config, errors } = loadConfig(dir, noRemote);
        assert.equal(config, null);
        assert.match(errors[0], /"account" must be .* in .*config\.local\.json$/);
    });

    test("15. loadLocalConfig: broken JSON → error, missing file → empty", () => {
        assert.match(loadLocalConfig(writeLocal(makeProject(), "{")).errors[0], /is not valid JSON/);
        assert.deepEqual(loadLocalConfig(makeProject()), { local: {}, errors: [], warnings: [] });
    });
});
