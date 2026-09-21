/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/dashboard/**/*.{tsx,html}',
    './docs/artifacts/**/*.tsx',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        bg: 'var(--bg)',
        panel: 'var(--panel)',
        'panel-raised': 'var(--panel-raised)',
        'panel-hover': 'var(--panel-hover)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        'text-faint': 'var(--text-faint)',
        line: 'var(--line)',
        'line-subtle': 'var(--line-subtle)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-text': 'var(--accent-text)',
      },
    },
  },
  plugins: [],
};
