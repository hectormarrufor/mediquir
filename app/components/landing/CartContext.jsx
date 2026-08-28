'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext();

export const useCart = () => useContext(CartContext);

export function CartProvider({ children }) {
    const [cart, setCart] = useState([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // Cargar del localStorage al iniciar
    useEffect(() => {
        const storedCart = localStorage.getItem('mediquir-cart');
        if (storedCart) {
            try {
                setCart(JSON.parse(storedCart));
            } catch (e) {
                console.error("Error parsing cart", e);
            }
        }
        setIsLoaded(true);
    }, []);

    // Guardar en localStorage cada vez que el carrito cambie
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

    const subtotal = cart.reduce((acc, item) => acc + (item.precioFinal * item.quantity), 0);
    const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

    return (
        <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, subtotal, totalItems, isLoaded }}>
            {children}
        </CartContext.Provider>
    );
}