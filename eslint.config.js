'use strict';

module.exports = [
  {
    files: [
      'server.js',
      'account-store.js',
      'network-security.js',
      'test/security-hardening.test.js',
    ],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs' },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'no-constant-condition': 'error',
      'no-dupe-keys': 'error',
      'no-redeclare': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-useless-catch': 'error',
    },
  },
];
