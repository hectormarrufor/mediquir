'use client';

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
                            if (prodFresco) {
                                return {
                                    ...item,
                                    product: prodFresco // Se actualiza stockAlmacen real
                                };
                            }
                            return item;
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

    const addToCart = (product, quantity, precioFinal) => {
        setCart((prevCart) => {
            const existingItem = prevCart.find((item) => item.product.id === product.id);
            if (existingItem) {
                return prevCart.map((item) =>
                    item.product.id === product.id
                        ? { ...item, quantity: item.quantity + quantity }
                        : item
                );
            }
            return [...prevCart, { product, quantity, precioFinal }];
        });
    };

    const removeFromCart = (productId) => {
        setCart((prevCart) => prevCart.filter((item) => item.product.id !== productId));
    };

    const updateQuantity = (productId, newQuantity) => {
        if (newQuantity < 1) return;
        setCart((prevCart) =>
            prevCart.map((item) =>
                item.product.id === productId ? { ...item, quantity: newQuantity } : item
            )
        );
    };

    // 3. RE-VERIFICACIÓN ATÓMICA PRE-CHECKOUT
    const verifyStockBeforeCheckout = async () => {
        setIsVerifying(true);
        try {
            const res = await fetch('/api/productos');
            if (!res.ok) throw new Error("Error consultando inventario");
            
            const productosBD = await res.json();
            let hayInconsistencias = false;

            const cartValidado = cart.map(item => {
                const prodBD = productosBD.find(p => p.id === item.product.id);
                const stockDisponible = Number(prodBD?.stockAlmacen || 0);

                // Si el producto no existe, se agotó o la cantidad supera el stock actual
                if (!prodBD || stockDisponible <= 0 || item.quantity > stockDisponible) {
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

    // Subtotal calculado ignorando productos que se hayan quedado sin stock
    const subtotal = cart.reduce((acc, item) => {
        const stockDispo = Number(item.product.stockAlmacen || 0);
        if (stockDispo <= 0) return acc;
        return acc + (item.precioFinal * item.quantity);
    }, 0);

    const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

    return (
        <CartContext.Provider value={{ 
            cart, 
            addToCart, 
            removeFromCart, 
            updateQuantity, 
            subtotal, 
            totalItems, 
            isLoaded,
            isVerifying,
            verifyStockBeforeCheckout 
        }}>
            {children}
        </CartContext.Provider>
    );
}