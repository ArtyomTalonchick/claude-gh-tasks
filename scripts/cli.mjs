/*
 * Shared CLI entry for the scripts: `runIfMain(import.meta.url, main)` runs `main` only when the file is executed
 * directly, and turns a thrown error into one stderr line and exit 1.
 */
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

export const runIfMain = (moduleUrl, main) => {
    if (!isMain(moduleUrl)) return;
    try {
        main();
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
};
