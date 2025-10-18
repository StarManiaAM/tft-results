import js from "@eslint/js";
import globals from "globals";
import {defineConfig} from "eslint/config";
import pluginSecurity from "eslint-plugin-security";

export default defineConfig([
    {
        files: ["**/*.{js,mjs,cjs}"],
        plugins: {js, pluginSecurity},
        extends: ["js/recommended", pluginSecurity.configs.recommended],
        languageOptions: {globals: globals.node},
    }
]);
