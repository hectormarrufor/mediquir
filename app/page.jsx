'use client';

import React from 'react';
import LandingMediquir from './LandingMediquir'; 
import { CartProvider } from './components/landing/CartContext';

export default function HomePage() {
    // Leemos la variable de entorno de Vercel. 
    const clientId = process.env.NEXT_PUBLIC_CLIENT_ID || 'mediquir';

    return (
        <CartProvider>
            <LandingMediquir />
        </CartProvider>
    );
}