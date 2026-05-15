import nextVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = [
  ...nextVitals,
  {
    ignores: ['.next/**', 'out/**']
  },
  {
    rules: {
      '@next/next/no-img-element': 'off'
    }
  }
];

export default eslintConfig;
