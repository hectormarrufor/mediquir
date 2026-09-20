'use client';

import { calcularFactura } from '@/app/constants/facturacion';
import { presentacionDe } from '@/app/constants/presentaciones';
import React, { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext();

export const useCart = () => useContext(CartContext);

export function CartProvider({ children }) {
    const [cart, setCart] = useState([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);

    // 1. HIDRATACIÓN + SINCRONIZACIÓN DE STOCK REAL AL INICIAR
    useEffect(() => {
        const initCart = async () => {
            const storedCart = localStorage.getItem('mediquir-cart');
            if (storedCart) {
                try {
                    const parsedCart = JSON.parse(storedCart);

                    // Consultamos el stock fresco al servidor
                    const res = await fetch('/api/productos');
                    if (res.ok) {
                        const productosBD = await res.json();
                        
                        // Fusionamos el carrito guardado con la data actualizada de la BD
                        const cartActualizado = parsedCart.map(item => {
                            const prodFresco = productosBD.find(p => p.id === item.product.id);
                            // Carritos guardados antes de las presentaciones: todo era por unidad
                            const base = { presentacion: 'UNIDAD', unidadesPorPres: 1, cantidadPres: item.quantity, ...item };
                            if (prodFresco) {
                                return {
                                    ...base,
                                    product: prodFresco // Se actualiza stockAlmacen real
                                };
                            }
                            return base;
                        });
                        setCart(cartActualizado);
                    } else {
                        setCart(parsedCart);
                    }
                } catch (e) {
                    console.error("Error revalidando inventario del carrito:", e);
                }
            }
            setIsLoaded(true);
        };

        initCart();
    }, []);

    // 2. Persistencia en localStorage
    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem('mediquir-cart', JSON.stringify(cart));
        }
    }, [cart, isLoaded]);

    // Un renglón por producto Y presentación (unidad o caja). `quantity` son SIEMPRE unidades (el precio y el stock van por unidad);
    // `cantidadPres` es lo que pidió el cliente (2 cajas) y `unidadesPorPres` cuántas unidades trae cada una.
    const mismo = (item, id, presentacion) => item.product.id === id && (item.presentacion || 'UNIDAD') === presentacion;

    const addToCart = (product, cantidadPres, precioFinal, presentacion = 'UNIDAD') => {
        const pres = presentacionDe(product, presentacion) || presentacionDe(product, 'UNIDAD');
        setCart((prevCart) => {
            const existingItem = prevCart.find((item) => mismo(item, product.id, pres.clave));
            if (existingItem) {
                return prevCart.map((item) =>
                    mismo(item, product.id, pres.clave)
                        ? { ...item, cantidadPres: item.cantidadPres + cantidadPres, quantity: (item.cantidadPres + cantidadPres) * pres.unidades }
                        : item
                );
            }
            return [...prevCart, { product, presentacion: pres.clave, presentacionEtiqueta: pres.etiqueta, unidadesPorPres: pres.unidades, cantidadPres, quantity: cantidadPres * pres.unidades, precioFinal }];
        });
    };

    const removeFromCart = (productId, presentacion = 'UNIDAD') => {
        setCart((prevCart) => prevCart.filter((item) => !mismo(item, productId, presentacion)));
    };

    const updateQuantity = (productId, newCantidadPres, presentacion = 'UNIDAD') => {
        if (newCantidadPres < 1) return;
        setCart((prevCart) =>
            prevCart.map((item) =>
                mismo(item, productId, presentacion) ? { ...item, cantidadPres: newCantidadPres, quantity: newCantidadPres * (item.unidadesPorPres || 1) } : item
            )
        );
    };

    // Unidades de un producto en el carrito, sumando todas sus presentaciones
    const unidadesEnCarrito = (productId) => cart.filter((item) => item.product.id === productId).reduce((a, item) => a + item.quantity, 0);

    const clearCart = () => {
        setCart([]);
    };

    // 3. RE-VERIFICACIÓN ATÓMICA PRE-CHECKOUT
    const verifyStockBeforeCheckout = async () => {
        setIsVerifying(true);
        try {
            const res = await fetch('/api/productos?fresh=1');
            if (!res.ok) throw new Error("Error consultando inventario");
            
            const productosBD = await res.json();
            let hayInconsistencias = false;

            const cartValidado = cart.map(item => {
                const prodBD = productosBD.find(p => p.id === item.product.id);
                const stockDisponible = Number(prodBD?.stockAlmacen || 0);

                // Si el producto no existe, se agotó o las unidades (de todas sus presentaciones) superan el stock actual
                if (!prodBD || stockDisponible <= 0 || unidadesEnCarrito(item.product.id) > stockDisponible) {
                    hayInconsistencias = true;
                }

                return {
                    ...item,
                    product: prodBD || item.product
                };
            });

            setCart(cartValidado);
            setIsVerifying(false);

            if (hayInconsistencias) {
                return { success: false, reason: 'STOCK_CHANGED' };
            }

            return { success: true };
        } catch (error) {
            setIsVerifying(false);
            return { success: false, reason: 'FETCH_ERROR' };
        }
    };

   // En CartContext.jsx, actualiza los cálculos finales antes del return:

    // Mismas reglas que el servidor: renglón redondeado a 2 decimales, IVA sobre la base imponible (solo lo con existencia)
    const disponibles = cart.filter((item) => Number(item.product.stockAlmacen || 0) > 0 && Number.isInteger(item.quantity) && item.quantity > 0);
    const factura = disponibles.length
        ? calcularFactura({
            renglones: disponibles.map((item) => {
                const porcentajeIva = Number(item.product.porcentajeIva) || 0;
                return { precioUnitario: item.precioFinal, cantidad: item.quantity, aplicaIva: porcentajeIva > 0, porcentajeIva };
            }),
        })
        : { subtotal: 0, montoIva: 0, ivaDetalle: [] };
    const subtotal = factura.subtotal;
    const totalImpuestos = factura.montoIva;
    const ivaDetalle = factura.ivaDetalle; // [{ alicuota, base, iva }]: para mostrar el impuesto claramente

    const totalItems = cart.reduce((acc, item) => acc + (item.cantidadPres ?? item.quantity), 0);

    return (
        <CartContext.Provider value={{ 
            cart, addToCart, removeFromCart, updateQuantity, 
            subtotal, totalImpuestos, ivaDetalle, totalItems, // Exportamos totalImpuestos
            isLoaded, isVerifying, verifyStockBeforeCheckout, clearCart, unidadesEnCarrito,
        }}>
            {children}
        </CartContext.Provider>
    );
}