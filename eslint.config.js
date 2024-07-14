// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config({
  files: ['**/*.ts'],
  extends: [
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    ...tseslint.configs.strict,
    //...tseslint.configs.stylistic,
  ],
  rules: {
    "linebreak-style": [ "error", "unix" ],
    "semi": [ "warn", "never" ],
    "indent": [ "error", 2 ],
    "quotes": [ "warn", "single" ],
    // https://stackoverflow.com/a/78734642
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        "argsIgnorePattern": "^_[^_].*$|^_$",
        "varsIgnorePattern": "^_[^_].*$|^_$",
        "caughtErrorsIgnorePattern": "^_[^_].*$|^_$"
      }
    ]
  },
})