'use client';

import { createContext, useContext } from 'react';

// Acciones de la tienda que comparten las secciones de la portada (las provee LandingMediquir):
//   abrirDetalle(producto)            -> vista rápida del producto
//   pedirCantidad(producto, clave)    -> «¿Cuánto vas a agregar?» (clave: 'UNIDAD' o 'CAJA')
// Así hay UNA vista rápida y UNA pregunta de cantidad para toda la página, en vez de una por tarjeta.
const TiendaContext = createContext({ abrirDetalle: () => {}, pedirCantidad: () => {} });

export const TiendaProvider = TiendaContext.Provider;
export const useTienda = () => useContext(TiendaContext);
