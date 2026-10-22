/*
 * Shared CLI entry for the scripts: `runIfMain(import.meta.url, main)` runs `main` only when the file is executed
 * directly, and turns a thrown error into one stderr line and exit 1. `run` calls a program without a shell.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const realPath = (file) => {
    try {
        return fs.realpathSync(file);
    } catch {
        return path.resolve(file);
    }
};

// import.meta.url is the real path; argv[1] may go through a symlink or a junction (the plugin cache can)
export const isMain = (moduleUrl) => Boolean(process.argv[1])
    && realPath(process.argv[1]) === realPath(fileURLToPath(moduleUrl));

/** Runs a program with an argument array and returns its stdout; a failure throws with its stderr */
export const run = (file, args, { input, cwd, env } = {}) => {
    try {
        return execFileSync(file, args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], input, cwd, env });
    } catch (error) {
        if (error.code === "ENOENT") {
            const hint = process.platform === "win32" ? " (on Windows the command must start with an executable such as node)" : "";
            throw new Error(`${file} not found${hint}`);
        }
        throw new Error(`${[file, ...args.slice(0, 2)].join(" ")} failed: ${(error.stderr || error.message).trim()}`);
    }
};

export const runIfMain = (moduleUrl, main) => {
    if (!isMain(moduleUrl)) return;
    try {
        main();
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
};
