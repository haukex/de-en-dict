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
    "quotes": [ "warn", "single" ]
  },
})