import globals from 'globals';

const sharedRules = {
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  'no-undef': 'error',
  'no-constant-condition': 'error',
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-debugger': 'error',
};

export default [
  {
    ignores: ['node_modules/**', 'functions/node_modules/**', '.firebase/**'],
  },
  {
    files: ['backend/**/*.js', 'functions/**/*.js', '*.js', '*.mjs', '*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: sharedRules,
  },
  {
    files: ['frontend/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        firebase: 'readonly',
        DOMPurify: 'readonly',
        tailwind: 'readonly',
      },
    },
    rules: sharedRules,
  },
];
