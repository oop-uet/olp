/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#003366',
          50: '#e6ecf2',
          100: '#ccd9e6',
          200: '#99b3cc',
          300: '#668cb3',
          400: '#336699',
          500: '#003366',
          600: '#002952',
          700: '#001f3d',
          800: '#001429',
          900: '#000a14',
        },
        brand: {
          blue: '#003366',
          white: '#FFFFFF',
        },
      },
    },
  },
  plugins: [],
}
