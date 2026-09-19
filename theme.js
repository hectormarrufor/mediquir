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
    petrolGray: ["#f4f6f8", "#e8eaed", "#d1d5db", "#b3bcca", "#94a3b8", "#74879e", "#5f738c", "#475569", "#334155", "#1e293b"],

    // --- PALETA DE MARCA MEDIQUIR (landing, header, menú) ---
    // En CSS: var(--mantine-color-brand-6), alpha(var(--mantine-color-navy-9), 0.4), etc.
    // En componentes: color="brand.6", c="navy.9", bg="accent.6".
    navy:   ["#eef2fa", "#dce4f3", "#b9c7e4", "#93a7d1", "#6d86bd", "#4c67a2", "#354d85", "#213765", "#142650", "#0b1b3d"], // 9 = #0B1B3D
    brand:  ["#e6f1fc", "#cce2f7", "#99c5ef", "#66a7e6", "#338add", "#0e72cc", "#005aaa", "#004c90", "#003d74", "#002e58"], // 6 = #005AAA
    accent: ["#fff0eb", "#ffddd2", "#ffbba5", "#ff9577", "#ff6e48", "#ff4b1e", "#f93200", "#d42b00", "#af2400", "#8a1d00"], // 6 = #F93200
    sky:    ["#eaf6ff", "#d3ecff", "#a9dbff", "#6cc0ff", "#45aeff", "#1f9bff", "#0a85e6", "#086cbc", "#06548f", "#043b64"]  // 3 = #6CC0FF
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

// Tokens compuestos (degradados, vidrio, sombras) derivados de la paleta del tema.
// Mantine ya expone cada color como --mantine-color-<nombre>-<n>; aquí solo se añaden
// las combinaciones que se repiten en landing, header y menú, para tener UNA fuente de verdad.
// Uso en CSS: background: var(--mm-gradient-accent);
export const cssVariablesResolver = (theme) => {
  const { navy, brand, accent, sky } = theme.colors;

  return {
    variables: {},
    light: {
      '--mm-gradient-brand': `linear-gradient(90deg, ${navy[9]} 0%, ${brand[6]} 55%, ${sky[6]} 100%)`,
      '--mm-gradient-accent': `linear-gradient(135deg, ${accent[5]} 0%, ${accent[6]} 55%, ${accent[7]} 100%)`,
      '--mm-gradient-highlight': `linear-gradient(90deg, transparent 0%, ${sky[3]} 30%, ${accent[6]} 70%, transparent 100%)`,
      '--mm-glass-bg': 'rgba(255, 255, 255, 0.72)',
      '--mm-glass-border': 'rgba(255, 255, 255, 0.8)',
      '--mm-glass-filter': 'blur(14px) saturate(140%)',
      '--mm-shadow-card': `0 8px 28px ${theme.colors.navy[9]}12`,
    },
    dark: {},
  };
};
