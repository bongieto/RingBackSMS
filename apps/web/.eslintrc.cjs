/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: ['../../.eslintrc.cjs', 'next/core-web-vitals'],
  rules: {
    'react/no-unescaped-entities': 'off',
  },
};
