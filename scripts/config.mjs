/*
 * The project config of gh-tasks: `.claude/gh-tasks/config.json`, committed, plus the git-ignored
 * `.claude/gh-tasks/config.local.json` for what differs per person — the gh account. This file is the schema —
 * defaults, types and validation live here, and skills read the effective config from `check` instead of guessing
 * defaults.
 *
 *   node scripts/config.mjs check --project <dir>
 *
 * Success: the effective config (defaults applied, `repo` resolved) as JSON on stdout, warnings on stderr, exit 0.
 * Failure: one line per error on stderr and a pointer to /gh-tasks:setup, exit 1.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { runIfMain } from "./cli.mjs";

export const getConfigPath = (projectDir) => path.join(projectDir, ".claude", "gh-tasks", "config.json");
export const getLocalConfigPath = (projectDir) => path.join(projectDir, ".claude", "gh-tasks", "config.local.json");

export const DEFAULTS = Object.freeze({
    language: "en",
    milestones: true,
    version: { scheme: "patch" },
    checks: [],
    commit: {
        format: "type(scope): subject",
        example: "fix(cart): keep layout stable on mobile",
        types: ["feat", "fix", "test", "build", "docs", "chore"],
        trailers: false,
    },
    issueTemplate: { extraLines: [] },
});

// owner: letters, digits, hyphens; name: also dots and underscores, but not "." or ".."
const REPO_PATTERN = /^[A-Za-z0-9-]+\/(?!\.\.?$)[A-Za-z0-9._-]+$/;

export const isRepo = (value) => typeof value === "string" && REPO_PATTERN.test(value);

// A GitHub login: letters, digits and single inner hyphens, up to 39 characters
const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

export const isLogin = (value) => typeof value === "string" && LOGIN_PATTERN.test(value);

const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";
const isBoolean = (value) => typeof value === "boolean";
const isStringList = (value) => Array.isArray(value) && value.every(isNonEmptyString);

const string = { check: isNonEmptyString, expected: "a non-empty string" };
const boolean = { check: isBoolean, expected: "true or false" };
const stringList = { check: isStringList, expected: "an array of non-empty strings" };

// A field is either a leaf ({ check, expected }) or a section ({ fields })
const SCHEMA = {
    repo: { check: isRepo, expected: "\"owner/name\"" },
    language: string,
    milestones: boolean,
    version: {
        fields: {
            scheme: { check: (value) => ["patch", "command"].includes(value), expected: "\"patch\" or \"command\"" },
            command: string,
        },
    },
    checks: stringList,
    commit: {
        fields: {
            format: string,
            example: string,
            types: { check: (value) => isStringList(value) && value.length > 0, expected: "a non-empty array of non-empty strings" },
            trailers: boolean,
        },
    },
    issueTemplate: { fields: { extraLines: stringList } },
};

const LOCAL_SCHEMA = {
    account: { check: isLogin, expected: "a GitHub login" },
};

// Keeps only known, well-typed fields; everything else becomes an error or a warning
const pickValid = (raw, fields, prefix, errors, warnings) => {
    const valid = {};
    Object.entries(raw).forEach(([key, value]) => {
        const name = `${prefix}${key}`;
        const field = fields[key];
        if (!field) {
            warnings.push(`unknown field "${name}" is ignored`);
        } else if (field.fields) {
            if (isPlainObject(value)) valid[key] = pickValid(value, field.fields, `${name}.`, errors, warnings);
            else errors.push(`"${name}" must be an object`);
        } else if (field.check(value)) {
            valid[key] = value;
        } else {
            errors.push(`"${name}" must be ${field.expected}, got ${JSON.stringify(value)}`);
        }
    });
    return valid;
};

const applyDefaults = (valid) => {
    const config = structuredClone(DEFAULTS);
    Object.entries(valid).forEach(([key, value]) => {
        config[key] = isPlainObject(value) ? { ...config[key], ...value } : value;
    });
    return config;
};

/**
 * Validates a parsed config.json and applies defaults. Pure: does not read files or resolve `repo`.
 * @returns {{ config: object, errors: string[], warnings: string[] }}
 */
export const validateConfig = (raw) => {
    const errors = [];
    const warnings = [];
    if (!isPlainObject(raw)) {
        return { config: structuredClone(DEFAULTS), errors: ["the config must be a JSON object"], warnings };
    }
    const config = applyDefaults(pickValid(raw, SCHEMA, "", errors, warnings));

    const { version } = config;
    // An invalid command is already reported by its type check
    if (version.scheme === "command" && !version.command && !errors.some((e) => e.startsWith("\"version.command\""))) {
        errors.push("\"version.command\" is required when \"version.scheme\" is \"command\"");
    }
    if (version.scheme === "patch" && version.command) {
        warnings.push("\"version.command\" is ignored with \"version.scheme\": \"patch\"");
        delete version.command;
    }
    return { config, errors, warnings };
};

/**
 * Validates a parsed config.local.json. Pure. No defaults: a missing `account` means the active gh account.
 * @returns {{ local: object, errors: string[], warnings: string[] }}
 */
export const validateLocalConfig = (raw) => {
    const errors = [];
    const warnings = [];
    if (!isPlainObject(raw)) return { local: {}, errors: ["the local config must be a JSON object"], warnings };
    return { local: pickValid(raw, LOCAL_SCHEMA, "", errors, warnings), errors, warnings };
};

// github.com only: gh would send another host's owner/name to github.com
const REMOTE_PATTERNS = [
    // scp-like: git@github.com:owner/name.git
    /^[^@/\s]+@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
    // URL: https://github.com/owner/name.git, ssh://git@github.com/owner/name.git
    /^(?:https?|ssh|git):\/\/(?:[^@/]+@)?github\.com(?::\d+)?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
];

/** `git remote get-url origin` output → "owner/name", or null when it is not a github.com repository URL. */
export const parseRepoFromRemote = (url) => {
    if (typeof url !== "string") return null;
    for (const pattern of REMOTE_PATTERNS) {
        const match = url.trim().match(pattern);
        if (match) {
            const repo = `${match[1]}/${match[2]}`;
            return isRepo(repo) ? repo : null;
        }
    }
    return null;
};

const getOriginUrl = (projectDir) => execFileSync("git", ["-C", projectDir, "remote", "get-url", "origin"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
}).trim();

/** @returns {{ raw?: unknown, missing?: true, error?: string }} */
const readJson = (file) => {
    let text;
    try {
        text = fs.readFileSync(file, "utf8");
    } catch {
        return { missing: true };
    }
    try {
        // Editors on Windows may save a BOM, JSON.parse rejects it
        return { raw: JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) };
    } catch (error) {
        return { error: `${file} is not valid JSON: ${error.message}` };
    }
};

/**
 * Reads and validates config.local.json; a missing file is an empty local config.
 * @returns {{ local: object, errors: string[], warnings: string[] }}
 */
export const loadLocalConfig = (projectDir) => {
    const file = getLocalConfigPath(projectDir);
    const { raw, missing, error } = readJson(file);
    if (missing) return { local: {}, errors: [], warnings: [] };
    if (error) return { local: {}, errors: [error], warnings: [] };
    const { local, errors, warnings } = validateLocalConfig(raw);
    const where = (message) => `${message} in ${file}`;
    return { local, errors: errors.map(where), warnings: warnings.map(where) };
};

/**
 * Reads, validates and completes the config of a project; `repo` falls back to the `origin` remote, `account`
 * comes from config.local.json.
 * @param {string} projectDir
 * @param {{ getRemoteUrl?: (projectDir: string) => string }} [options] injectable for tests
 * @returns {{ config: object | null, errors: string[], warnings: string[] }}
 */
export const loadConfig = (projectDir, { getRemoteUrl = getOriginUrl } = {}) => {
    const configPath = getConfigPath(projectDir);
    const { raw, missing, error } = readJson(configPath);
    if (missing) return { config: null, errors: [`no config at ${configPath}`], warnings: [] };
    if (error) return { config: null, errors: [error], warnings: [] };

    const { config, errors, warnings } = validateConfig(raw);
    const local = loadLocalConfig(projectDir);
    errors.push(...local.errors);
    warnings.push(...local.warnings);
    Object.assign(config, local.local);
    if (!config.repo && !errors.length) {
        const repo = readOriginRepo(projectDir, getRemoteUrl);
        if (repo) config.repo = repo;
        else errors.push("\"repo\" is not set and cannot be read from `git remote get-url origin`");
    }
    return { config: errors.length ? null : config, errors, warnings };
};

const readOriginRepo = (projectDir, getRemoteUrl) => {
    try {
        return parseRepoFromRemote(getRemoteUrl(projectDir));
    } catch {
        // no git, no repository or no origin
        return null;
    }
};

/**
 * The repository of a project: from its config when there is one, else from the `origin` remote — `setup` creates
 * labels before it writes the config.
 * @throws when the config is invalid or no repository can be found
 */
export const resolveRepo = (projectDir, { getRemoteUrl = getOriginUrl } = {}) => {
    if (fs.existsSync(getConfigPath(projectDir))) {
        const { config, errors } = loadConfig(projectDir, { getRemoteUrl });
        if (errors.length) throw new Error(`${errors.join("; ")}. Run /gh-tasks:setup to fix the config.`);
        return config.repo;
    }
    const repo = readOriginRepo(projectDir, getRemoteUrl);
    if (!repo) throw new Error("no config and no GitHub repository in `git remote get-url origin`");
    return repo;
};

const USAGE = "Usage: node config.mjs check --project <dir>";

const main = () => {
    const { positionals: [command], values } = parseArgs({
        allowPositionals: true,
        options: { project: { type: "string" } },
    });
    if (command !== "check" || !values.project) throw new Error(USAGE);

    const { config, errors, warnings } = loadConfig(path.resolve(values.project));
    warnings.forEach((warning) => console.error(`warning: ${warning}`));
    if (errors.length) {
        errors.forEach((error) => console.error(`error: ${error}`));
        console.error("Run /gh-tasks:setup to create or fix the config.");
        process.exit(1);
    }
    console.log(JSON.stringify(config, null, 2));
};

runIfMain(import.meta.url, main);
