/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['Mulish', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'sans-serif'],
      },
      colors: {
        // 保留既有名称，只更新为方向 B 的取值。
        primary: { DEFAULT: '#3b6ea5', 50: '#eef3f9', 500: '#4f7fb2', 600: '#3b6ea5', 700: '#315c8a' },
        brand: { 50: '#eef3f9', 100: '#dce8f3', 500: '#4f7fb2', 600: '#3b6ea5', 700: '#2f5680' },
        success: { 50: '#eaf6f1', 500: '#4f9d7d', 600: '#3f8f6e', 700: '#327359' },
        warning: { 50: '#fdf7ef', 500: '#c98a4b', 600: '#b5741f', 700: '#965f18' },
        danger: { 50: '#fdf5f5', 400: '#cf6d6c', 500: '#c0504f', 600: '#a94342', 700: '#8d3938' },
        info: { 50: '#eef3f9', 600: '#3b6ea5', 700: '#2f5680' },
        'border-strong': '#d9d2c7',
        // shadcn CSS 变量映射
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        chart: {
          1: '#3b6ea5',
          2: '#c98a4b',
          3: '#3f8f6e',
          4: '#b5741f',
          5: '#7b6ca8',
          6: '#5a8fa8',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('@tailwindcss/forms'), require('tailwindcss-animate')],
}
