/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        display: ['"Fraunces"', 'serif'],
      },
      colors: {
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
        border: 'rgb(var(--border) / <alpha-value>)',
      },
      boxShadow: {
        'soft-xl': '0 24px 70px -40px rgba(15, 23, 42, 0.45)',
        'soft-lg': '0 18px 40px -28px rgba(15, 23, 42, 0.4)',
      },
      backgroundImage: {
        'hero-glow': 'radial-gradient(circle at top left, rgba(251, 146, 60, 0.28), transparent 52%), radial-gradient(circle at 80% 20%, rgba(56, 189, 248, 0.22), transparent 45%)',
        'mesh': 'linear-gradient(135deg, rgba(15, 118, 110, 0.08), transparent 40%), linear-gradient(315deg, rgba(251, 113, 133, 0.12), transparent 55%)',
      },
      keyframes: {
        floaty: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        rise: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        floaty: 'floaty 6s ease-in-out infinite',
        rise: 'rise 0.7s ease-out forwards',
      },
    },
  },
  plugins: [],
}
