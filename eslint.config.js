"use strict";

module.exports = [
  {
    files: ["**/*.js"],
    ignores: ["node_modules/**", "assets/**"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        console: "readonly",
        process: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setImmediate: "readonly",
        structuredClone: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        __dirname: "readonly",
        module: "readonly",
        require: "readonly",
        globalThis: "readonly",
        CustomEvent: "readonly",
        TextEncoder: "readonly",
      },
    },
    rules: {
      "no-unreachable": "error",
      "no-dupe-keys": "error",
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-unused-vars": "off",
    },
  },
  {
    files: [
      "account-store.js",
      "server.js",
      "account-client.js",
      "progress-outbox.js",
      "eslint.config.js",
      "scripts/**/*.js",
      "benchmark/**/*.js",
      "test/**/*.js",
    ],
    rules: { "no-undef": "error" },
  },
];
