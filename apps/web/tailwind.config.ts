import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        terra: 'var(--terra)',
        ink: 'var(--ink)',
      },
    },
  },
};

export default config;
