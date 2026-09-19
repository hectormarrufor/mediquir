'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { calcularFactura } from '@/app/constants/facturacion';

const CLAVE = 'mediquir-b2b-carrito';
const Contexto = createContext(null);

const leer = () => {
    try {
        const crudo = window.localStorage.getItem(CLAVE);
        const lista = crudo ? JSON.parse(crudo) : [];
        return Array.isArray(lista) ? lista.filter((i) => i?.producto?.id && Number.isInteger(i.cantidad) && i.cantidad > 0) : [];
    } catch {
        return [];
    }
};

// Carrito del portal B2B. Es solo comodidad del navegador: el servidor recalcula precios, IVA y existencias al crear el pedido.
export function B2BCartProvider({ children }) {
    const [items, setItems] = useState([]);
    const [listo, setListo] = useState(false);

    useEffect(() => { setItems(leer()); setListo(true); }, []);
    useEffect(() => {
        if (!listo) return;
        try { window.localStorage.setItem(CLAVE, JSON.stringify(items)); } catch { /* almacenamiento bloqueado */ }
    }, [items, listo]);

    const fijarCantidad = useCallback((producto, cantidad) => {
        const n = Math.floor(Number(cantidad));
        setItems((prev) => {
            const sinEste = prev.filter((i) => i.producto.id !== producto.id);
            if (!(n > 0)) return sinEste;
            const tope = producto.disponible > 0 ? Math.min(n, producto.disponible) : n;
            const actual = prev.find((i) => i.producto.id === producto.id);
            const nuevo = { producto, cantidad: tope };
            return actual ? prev.map((i) => (i.producto.id === producto.id ? nuevo : i)) : [...sinEste, nuevo];
        });
    }, []);

    const agregar = useCallback((producto, cantidad = 1) => {
        setItems((prev) => {
            const actual = prev.find((i) => i.producto.id === producto.id);
            const total = (actual?.cantidad || 0) + Math.max(1, Math.floor(Number(cantidad) || 1));
            const tope = producto.disponible > 0 ? Math.min(total, producto.disponible) : total;
            return actual
                ? prev.map((i) => (i.producto.id === producto.id ? { producto, cantidad: tope } : i))
                : [...prev, { producto, cantidad: tope }];
        });
    }, []);

    const quitar = useCallback((id) => setItems((prev) => prev.filter((i) => i.producto.id !== id)), []);
    const vaciar = useCallback(() => setItems([]), []);

    // Mismas reglas que el servidor (renglón redondeado, IVA sobre la base)
    const factura = useMemo(() => (items.length
        ? calcularFactura({ renglones: items.map((i) => ({ precioUnitario: i.producto.precio, cantidad: i.cantidad, aplicaIva: i.producto.porcentajeIva > 0, porcentajeIva: i.producto.porcentajeIva })) })
        : null), [items]);

    const valor = useMemo(() => ({
        items, listo, factura, agregar, fijarCantidad, quitar, vaciar,
        totalArticulos: items.reduce((acc, i) => acc + i.cantidad, 0),
        cantidadDe: (id) => items.find((i) => i.producto.id === id)?.cantidad || 0,
    }), [items, listo, factura, agregar, fijarCantidad, quitar, vaciar]);

    return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useB2BCart = () => {
    const ctx = useContext(Contexto);
    if (!ctx) throw new Error('useB2BCart debe usarse dentro de B2BCartProvider');
    return ctx;
};
