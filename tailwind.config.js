/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Admin / seller dashboard palette
        brand: {
          DEFAULT: '#2563EB', // Royal Blue — primary / software credibility
          50: '#EFF6FF',
          100: '#DBEAFE',
          600: '#2563EB',
          700: '#1D4ED8',
        },
        slate: {
          950: '#0F172A', // Admin background / structure
          50: '#F8FAFC',
        },
        success: {
          DEFAULT: '#059669', // Paid / Active wallet
          50: '#ECFDF5',
        },
        warning: {
          DEFAULT: '#F59E0B', // Pending / grace period / low stock
          50: '#FFFBEB',
        },
        danger: {
          DEFAULT: '#EF4444', // Suspended / out of stock
          50: '#FEF2F2',
        },
        // Buyer-facing storefront palette
        storefront: {
          accent: '#EA580C', // High-conversion orange/amber
          charcoal: '#18181B',
        },
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl2: '1rem',
      },
    },
  },
  plugins: [],
};
