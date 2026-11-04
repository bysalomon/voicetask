import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
export default tseslint.config(eslint.configs.recommended,...tseslint.configs.recommended,{files:['**/*.mjs'],languageOptions:{globals:globals.node}},{files:['**/*.{ts,tsx}'],languageOptions:{globals:globals.browser},plugins:{'react-hooks':hooks},rules:{...hooks.configs.recommended.rules}});
