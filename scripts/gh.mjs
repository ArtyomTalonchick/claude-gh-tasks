/*
 * gh as the project's account. With several accounts logged in to gh, the active one is global: switching it races
 * between parallel sessions. This wrapper runs gh with GH_TOKEN set for its own process only, taken from the gh
 * keyring for the login in `.claude/gh-tasks/config.local.json`; no login → gh runs as the active account.
 *
 *   node scripts/gh.mjs --project <dir> issue <subcommand> …
 *   node scripts/gh.mjs --project <dir> label <subcommand> …
 *   node scripts/gh.mjs --project <dir> search issues …
 *   node scripts/gh.mjs accounts --project <dir>
 *
 * gh output and exit code pass through. A permission rule sees only `node …gh.mjs`, so the subcommands are checked
 * here, and the token is never printed. `accounts` lists the logins of github.com and marks the active one.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { parseArgs } from "node:util";
import { runIfMain } from "./cli.mjs";
import { loadLocalConfig } from "./config.mjs";

const HOST = "github.com";

// issue deletion and transfer move data out of reach: only the user does them
const REFUSED_ISSUE_SUBCOMMANDS = new Set(["delete", "transfer"]);

/** @returns {string | null} why the gh arguments are refused, or null when allowed */
export const checkGhArgs = (args) => {
    const [command, subcommand] = args;
    if (command === "issue" || command === "label") {
        if (!subcommand || subcommand.startsWith("-")) return `gh ${command} needs a subcommand`;
        if (command === "issue" && REFUSED_ISSUE_SUBCOMMANDS.has(subcommand)) {
            return `gh issue ${subcommand} is not run by gh-tasks`;
        }
        return null;
    }
    if (command === "search" && subcommand === "issues") return null;
    return `only gh issue, gh label and gh search issues run through gh-tasks, got: gh ${args.slice(0, 2).join(" ")}`;
};

/** `--project <dir>` first, then the gh arguments as they are. */
export const splitArgs = (argv) => {
    const [flag, projectDir, ...ghArgs] = argv;
    if (flag !== "--project" || !projectDir) return null;
    return { projectDir, ghArgs };
};

/** `gh auth status --json hosts` output → the github.com accounts, `{ login, active }[]`. */
export const parseAccounts = (text) => {
    const hosts = JSON.parse(text)?.hosts ?? {};
    return (hosts[HOST] ?? [])
        .filter((entry) => typeof entry?.login === "string")
        .map((entry) => ({ login: entry.login, active: entry.active === true }));
};

// gh prefers these over the keyring, so they must not leak into the calls that read the keyring
const withoutTokens = () => {
    const env = { ...process.env };
    delete env.GH_TOKEN;
    delete env.GITHUB_TOKEN;
    return env;
};

const readStoredToken = (login) => {
    try {
        return execFileSync("gh", ["auth", "token", "--hostname", HOST, "--user", login], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            env: withoutTokens(),
        }).trim();
    } catch {
        throw new Error(`gh has no stored token for "${login}" on ${HOST}: run gh auth login, then retry`);
    }
};

/**
 * The environment for gh calls of a project: GH_TOKEN of the configured account, or the current environment when
 * no account is configured.
 * @param {string} projectDir
 * @param {{ readToken?: (login: string) => string }} [options] injectable for tests
 */
export const ghEnv = (projectDir, { readToken = readStoredToken } = {}) => {
    const { local, errors } = loadLocalConfig(projectDir);
    if (errors.length) throw new Error(`${errors.join("\n")}\nRun /gh-tasks:setup to fix it.`);
    if (!local.account) return process.env;
    return { ...process.env, GH_TOKEN: readToken(local.account) };
};

const listAccounts = (projectDir) => {
    let output;
    try {
        output = { stdout: execFileSync("gh", ["auth", "status", "--hostname", HOST, "--json", "hosts"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            env: withoutTokens(),
        }), stderr: "" };
    } catch (error) {
        if (error.code === "ENOENT") throw new Error("gh not found: https://cli.github.com");
        // gh exits non-zero when one of the accounts has a problem, the JSON is still printed
        output = { stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
    }
    let accounts;
    try {
        accounts = parseAccounts(output.stdout);
    } catch {
        throw new Error(`gh auth status --json failed (gh 2.70 or newer is needed): ${output.stderr.trim()}`);
    }
    if (!accounts.length) throw new Error(`no gh account on ${HOST}: run gh auth login`);
    accounts.forEach(({ login, active }) => console.log(`${login}${active ? " (active)" : ""}`));
    const { local, errors } = loadLocalConfig(projectDir);
    errors.forEach((error) => console.error(`error: ${error}`));
    console.log(`configured for this project: ${local.account ?? "none, the active account is used"}`);
};

const USAGE = "Usage: node gh.mjs --project <dir> <issue | label | search issues> …\n"
    + "       node gh.mjs accounts --project <dir>";

const main = () => {
    const argv = process.argv.slice(2);
    if (argv[0] === "accounts") {
        const { values } = parseArgs({ args: argv.slice(1), options: { project: { type: "string" } } });
        if (!values.project) throw new Error(USAGE);
        listAccounts(path.resolve(values.project));
        return;
    }

    const split = splitArgs(argv);
    if (!split) throw new Error(USAGE);
    const refused = checkGhArgs(split.ghArgs);
    if (refused) throw new Error(refused);

    const env = ghEnv(path.resolve(split.projectDir));
    try {
        execFileSync("gh", split.ghArgs, { stdio: "inherit", env });
    } catch (error) {
        if (error.code === "ENOENT") throw new Error("gh not found: https://cli.github.com");
        // gh has printed its own error already
        process.exit(error.status ?? 1);
    }
};

runIfMain(import.meta.url, main);
