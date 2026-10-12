import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";

export default [
    { ignores: ["node_modules/"] },
    js.configs.recommended,
    {
        files: ["**/*.mjs"],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: "module",
            globals: globals.node,
        },
        plugins: { "@stylistic": stylistic },
        rules: {
            "@stylistic/indent": ["error", 4],
            "@stylistic/quotes": ["error", "double", { avoidEscape: true }],
            "@stylistic/semi": ["error", "always"],
            "@stylistic/comma-dangle": ["error", "always-multiline"],
            "@stylistic/max-len": ["error", { code: 120, ignoreUrls: true, ignoreStrings: true }],
            "@stylistic/eol-last": "error",
            "@stylistic/no-trailing-spaces": "error",
            "@stylistic/object-curly-spacing": ["error", "always"],
            "@stylistic/arrow-parens": ["error", "always"],
            "prefer-const": "error",
            "no-var": "error",
            "eqeqeq": ["error", "always"],
        },
    },
];
