import localFont from 'next/font/local';

// Tipografía de la tienda pública: Archivo variable (peso 100–900 y ancho 62–125 %), subconjunto latino, servida desde nuestro
// propio dominio (no depende de Google Fonts, que desde Venezuela a veces no responde). Licencia SIL OFL: ver OFL-Archivo.txt.
// Solo se precarga en la portada, que es quien la importa; el resto del sistema sigue con la letra del sistema operativo.
export const fuenteTienda = localFont({
    src: './archivo-latin-variable.woff2',
    weight: '100 900',
    display: 'swap',
    declarations: [{ prop: 'font-stretch', value: '62% 125%' }],
    fallback: ['system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
});
