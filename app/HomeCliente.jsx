'use client';

import React from 'react';
import LandingMediquir from './LandingMediquir';
import { CartProvider } from './components/landing/CartContext';

// Parte interactiva de la portada (carrito, buscador, tienda). El texto para buscadores llega como `seo`, ya armado en el servidor.
export default function HomeCliente({ seo }) {
    return (
        <CartProvider>
            <LandingMediquir seo={seo} />
        </CartProvider>
    );
}
