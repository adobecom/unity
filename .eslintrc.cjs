module.exports = {
  root: true,
  extends: 'airbnb-base',
  env: { browser: true, mocha: true },
  parser: '@babel/eslint-parser',
  parserOptions: {
    allowImportExportEverywhere: true,
    sourceType: 'module',
    requireConfigFile: false,
  },
  rules: {
    'no-param-reassign': [2, { props: false }],
    'linebreak-style': ['error', 'unix'],
    'import/extensions': ['error', { js: 'always' }],
    'object-curly-newline': ['error', {
      ObjectExpression: { multiline: true, minProperties: 6 },
      ObjectPattern: { multiline: true, minProperties: 6 },
      ImportDeclaration: { multiline: true, minProperties: 6 },
      ExportDeclaration: { multiline: true, minProperties: 6 },
    }],
    'no-return-assign': ['error', 'except-parens'],
    'no-unused-expressions': 0,
    'chai-friendly/no-unused-expressions': 2,
    'max-len': 'off',
    'no-plusplus': ['error', { allowForLoopAfterthoughts: true }],
    camelcase: 'off',
  },
  overrides: [
    {
      files: ['test/**/*.js', 'nala/**/*.js', 'nala/**/*.cjs'],
      rules: {
        'no-console': 'off',
        'import/no-extraneous-dependencies': [
          'off',
          { devDependencies: true },
        ],
        'import/prefer-default-export': 'off',
        'max-len': 'off',
      },
    },
  ],
  plugins: [
    'chai-friendly',
  ],
};
