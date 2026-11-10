import { useMediaQuery } from '@mantine/hooks';
import clases from './pantallaCompleta.module.css';

// Props para un <Modal>: centrado en la computadora y a pantalla completa en el teléfono (los formularios se leen y se llenan mejor).
// Uso: <Modal {...PANTALLA_COMPLETA_MOVIL} opened={…} …>
export const PANTALLA_COMPLETA_MOVIL = { classNames: { inner: clases.inner, content: clases.content, body: clases.body } };

// Clase para el contenido de una ventana fullScreen que dibuja su propio diseño de borde a borde (sin el relleno que el tema pone a todo Paper)
export const CONTENIDO_SIN_RELLENO = clases.sinRelleno;

// ¿Pantalla de teléfono? Se lee al primer render (sin esperar un efecto) para que una ventana no se abra con el diseño de escritorio
// y salte al de teléfono. Solo en componentes que se pintan en el navegador (en el servidor devuelve false).
export const useEsTelefono = () => useMediaQuery('(max-width: 48em)', false, { getInitialValueInEffect: false });
