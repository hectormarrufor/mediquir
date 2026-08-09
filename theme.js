// theme.js
import { createTheme, rem } from '@mantine/core';

export const theme = createTheme({
  scale: 1,
  fontSmoothing: true,
  focusRing: "auto",
  white: "#ffffff",
  black: "#0a1014", 
  
  colors: {
    ochre: ["#fdf9e8", "#f8efcd", "#eedb9b", "#e4c665", "#ddb437", "#d8a81a", "#d6a009", "#be8c00", "#a97c00", "#926a00"],
    petrolBlue: ["#eef4fa", "#dce7f3", "#b7cee6", "#8fb3d8", "#6e9dcc", "#588ec5", "#4b86c2", "#1a4768", "#123652", "#0a2338"],
    petrolGray: ["#f4f6f8", "#e8eaed", "#d1d5db", "#b3bcca", "#94a3b8", "#74879e", "#5f738c", "#475569", "#334155", "#1e293b"]
  },
  
  primaryColor: "ochre",
  primaryShade: { light: 6, dark: 6 },
  autoContrast: true,
  luminanceThreshold: 0.4,
  
  fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  fontFamilyMonospace: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace",
  
  defaultRadius: "md", // Bajado a md para que no se vea tan redondo en formularios densos

  headings: {
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: "800",
    textWrap: "pretty",
    sizes: {
      h1: { fontSize: rem(32), lineHeight: "1.2" },
      h2: { fontSize: rem(26), lineHeight: "1.3" },
      h3: { fontSize: rem(22), lineHeight: "1.4" },
      h4: { fontSize: rem(18), lineHeight: "1.45" },
      h5: { fontSize: rem(16), lineHeight: "1.5" }
    }
  },

  shadows: {
    xs: "0 1px 2px rgba(18, 54, 82, 0.03)",
    sm: "0 2px 8px rgba(18, 54, 82, 0.04)",
    md: "0 8px 24px rgba(18, 54, 82, 0.06)", 
    lg: "0 16px 32px rgba(18, 54, 82, 0.08)",
    xl: "0 24px 48px rgba(18, 54, 82, 0.12)"
  },

  components: {
    Title: {
      styles: {
        root: {
          color: 'var(--mantine-color-petrolBlue-9)', // Quitamos el gradiente metálico para que lea más limpio
          letterSpacing: '-0.02em',
          textTransform: 'uppercase',
          position: 'relative',
          display: 'inline-block',
          paddingBottom: '8px',
        }
      }
    },

    // 🔥 PAPER LIMPIO: Sin hacks de GPU ni overflow escondido que rompa el scroll
    Paper: {
      defaultProps: { p: 'md', radius: 'md', shadow: 'sm' },
      styles: {
        root: {
          backgroundColor: 'var(--mantine-color-white)',
          border: '1px solid var(--mantine-color-petrolGray-2)',
          transition: 'box-shadow 0.2s ease',
        }
      }
    },

    Card: {
      defaultProps: { p: 'lg', radius: 'lg' },
      styles: {
        root: {
          backgroundColor: 'var(--mantine-color-white)',
          borderTop: '4px solid var(--mantine-color-petrolBlue-8)',
          borderLeft: '1px solid var(--mantine-color-petrolGray-2)',
          borderRight: '1px solid var(--mantine-color-petrolGray-2)',
          borderBottom: '1px solid var(--mantine-color-petrolGray-2)',
          boxShadow: 'var(--mantine-shadow-sm)',
        }
      }
    },

    Input: {
      defaultProps: { variant: 'filled', radius: 'md' },
      styles: {
        input: {
          backgroundColor: 'var(--mantine-color-petrolGray-0)', 
          border: '1px solid transparent',
        }
      }
    },
    TextInput: { defaultProps: { variant: 'filled', radius: 'md' } },
    NumberInput: { defaultProps: { variant: 'filled', radius: 'md' } },
    Select: { defaultProps: { variant: 'filled', radius: 'md' } },

    Button: {
      defaultProps: { radius: 'xl', fw: 600, size: 'md' },
      styles: {
        root: {
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
        }
      }
    },

    // 🔥 MODAL INMACULADO
    Modal: {
      defaultProps: { 
        radius: 'lg', 
        shadow: 'xl',
        overlayProps: { backgroundOpacity: 0.4, blur: 4 }, // Blur suave en el fondo, no en el modal
      },
      styles: {
        content: { 
          backgroundColor: '#ffffff', // Fondo sólido, cero transparencias conflictivas
          border: 'none',
        },
        header: {
          backgroundColor: 'transparent',
          borderBottom: '1px solid var(--mantine-color-petrolGray-1)',
          paddingBottom: '16px',
        },
        title: { 
          fontWeight: 800, 
          fontSize: '1.25rem',
          color: 'var(--mantine-color-petrolBlue-9)'
        }
      }
    },
  }
});