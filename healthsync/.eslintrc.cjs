module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: {
    es2022: true,
    node: true,
    jest: true,
  },
  ignorePatterns: ['**/dist/**', '**/coverage/**', '**/*.js'],
  // TypeScript's noUnusedLocals/noUnusedParameters are enforced by tsc.
  // Disable the core rule because it misreads typed function parameters.
  rules: {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-var-requires': 'off',
  },
};