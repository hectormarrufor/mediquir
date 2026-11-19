// Recuerda cómo estaba la lista de la tienda (búsqueda, especialidad, filtros, «ver más» y posición) mientras se ve la página de un
// producto, para dejarla igual al volver. Vive en memoria del navegador: sobrevive a la navegación dentro del sitio, no a recargar.
let estado = null;
let restaurar = false;

export const guardarEstadoTienda = (parcial) => { estado = { ...(estado || {}), ...parcial, t: Date.now() }; };
// La página del producto avisa que se está volviendo a la lista (botón «volver» o flecha atrás del navegador)
export const marcarRestaurarTienda = () => { restaurar = true; };
// Solo hay algo que restaurar si se vuelve de un producto y no ha pasado más de una hora
export const estadoRestaurable = () => (restaurar && estado && Date.now() - estado.t < 3600_000 ? estado : null);
export const darPorRestaurada = () => { restaurar = false; };
// ¿Se llegó a esta página de producto desde la lista de la tienda (y por tanto «volver» regresa a ella)?
export const vinoDeLaLista = () => estado?.scrollY !== undefined;
