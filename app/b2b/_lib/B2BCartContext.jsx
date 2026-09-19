'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { calcularFactura } from '@/app/constants/facturacion';

const CLAVE = 'mediquir-b2b-carrito';
const Contexto = createContext(null);

const PRESENTACION_UNIDAD = { clave: 'UNIDAD', etiqueta: 'Unidad', singular: 'unidad', plural: 'unidades', unidades: 1 };

// Presentaciones que ofrece un producto (las trae el catálogo); un carrito guardado antes de existir esto solo tiene unidades
export const presentacionesDe = (producto) => (producto?.presentaciones?.length ? producto.presentaciones : [PRESENTACION_UNIDAD]);
export const presentacionDe = (producto, clave) => presentacionesDe(producto).find((p) => p.clave === clave) || null;

// Unidades base que hay en un renglón del carrito (cantidad de la presentación × unidades de cada una)
export const unidadesDe = (item) => item.cantidad * (presentacionDe(item.producto, item.presentacion)?.unidades || 1);

const mismo = (a, id, presentacion) => a.producto.id === id && a.presentacion === presentacion;

const leer = () => {
    try {
        const crudo = window.localStorage.getItem(CLAVE);
        const lista = crudo ? JSON.parse(crudo) : [];
        if (!Array.isArray(lista)) return [];
        return lista
            .map((i) => ({ ...i, presentacion: i?.presentacion || 'UNIDAD' }))
            .filter((i) => i?.producto?.id && Number.isInteger(i.cantidad) && i.cantidad > 0 && presentacionDe(i.producto, i.presentacion));
    } catch {
        return [];
    }
};

// Carrito del portal B2B. Es solo comodidad del navegador: el servidor recalcula presentaciones, precios, IVA y existencias al crear el pedido.
// Cada renglón es un producto en UNA presentación (unidad, caja o bulto); el mismo producto puede estar en varias presentaciones a la vez.
export function B2BCartProvider({ children }) {
    const [items, setItems] = useState([]);
    const [listo, setListo] = useState(false);

    useEffect(() => { setItems(leer()); setListo(true); }, []);
    useEffect(() => {
        if (!listo) return;
        try { window.localStorage.setItem(CLAVE, JSON.stringify(items)); } catch { /* almacenamiento bloqueado */ }
    }, [items, listo]);

    // Cuántas presentaciones de esta clase caben todavía, sin pasarse de la existencia (que está en unidades) contando lo que ya hay en otros renglones
    const tope = (prev, producto, presentacion) => {
        const factor = presentacionDe(producto, presentacion)?.unidades || 1;
        if (!(producto.disponible > 0)) return Infinity;
        const enOtros = prev.filter((i) => i.producto.id === producto.id && i.presentacion !== presentacion).reduce((a, i) => a + unidadesDe(i), 0);
        return Math.max(0, Math.floor((producto.disponible - enOtros) / factor));
    };

    const fijarCantidad = useCallback((producto, cantidad, presentacion = 'UNIDAD') => {
        const n = Math.floor(Number(cantidad));
        setItems((prev) => {
            const sinEste = prev.filter((i) => !mismo(i, producto.id, presentacion));
            if (!(n > 0)) return sinEste;
            const nuevo = { producto, presentacion, cantidad: Math.min(n, tope(prev, producto, presentacion)) };
            if (!(nuevo.cantidad > 0)) return sinEste;
            return prev.some((i) => mismo(i, producto.id, presentacion)) ? prev.map((i) => (mismo(i, producto.id, presentacion) ? nuevo : i)) : [...sinEste, nuevo];
        });
    }, []);

    const agregar = useCallback((producto, cantidad = 1, presentacion = 'UNIDAD') => {
        setItems((prev) => {
            const actual = prev.find((i) => mismo(i, producto.id, presentacion));
            const total = (actual?.cantidad || 0) + Math.max(1, Math.floor(Number(cantidad) || 1));
            const cantidadFinal = Math.min(total, tope(prev, producto, presentacion));
            if (!(cantidadFinal > 0)) return prev;
            const nuevo = { producto, presentacion, cantidad: cantidadFinal };
            return actual ? prev.map((i) => (mismo(i, producto.id, presentacion) ? nuevo : i)) : [...prev, nuevo];
        });
    }, []);

    const quitar = useCallback((id, presentacion = 'UNIDAD') => setItems((prev) => prev.filter((i) => !mismo(i, id, presentacion))), []);
    const vaciar = useCallback(() => setItems([]), []);

    // Mismas reglas que el servidor: cada renglón se cobra por UNIDADES (precio unitario × unidades), redondeado, con el IVA sobre la base
    const renglones = (conIva) => items.map((i) => ({ precioUnitario: i.producto.precio, cantidad: unidadesDe(i), aplicaIva: conIva && i.producto.porcentajeIva > 0, porcentajeIva: i.producto.porcentajeIva }));
    const factura = useMemo(() => (items.length ? calcularFactura({ renglones: renglones(true) }) : null), [items]); // eslint-disable-line react-hooks/exhaustive-deps
    // Nota de entrega: el mismo pedido sin IVA
    const facturaSinIva = useMemo(() => (items.length ? calcularFactura({ renglones: renglones(false) }) : null), [items]); // eslint-disable-line react-hooks/exhaustive-deps

    const valor = useMemo(() => ({
        items, listo, factura, facturaSinIva, agregar, fijarCantidad, quitar, vaciar,
        totalArticulos: items.reduce((acc, i) => acc + i.cantidad, 0),
        // Unidades base de este producto que ya hay en el carrito (sumando todas sus presentaciones)
        cantidadDe: (id) => items.filter((i) => i.producto.id === id).reduce((a, i) => a + unidadesDe(i), 0),
    }), [items, listo, factura, facturaSinIva, agregar, fijarCantidad, quitar, vaciar]);

    return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useB2BCart = () => {
    const ctx = useContext(Contexto);
    if (!ctx) throw new Error('useB2BCart debe usarse dentro de B2BCartProvider');
    return ctx;
};
