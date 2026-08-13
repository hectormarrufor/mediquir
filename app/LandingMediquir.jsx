'use client';

import React from 'react';
import { Box, Container, Grid, Title, Text, Anchor, Stack, Divider } from '@mantine/core';

// --- NUESTROS MÓDULOS DE LANDING ---
import HeroSection from './components/landing/HeroSection';
// Estos los iremos descomentando a medida que los construyamos:
import CategorySection from './components/landing/CategorySection';
import BestSellersSection from './components/landing/BestSellersSection';
import FooterSection from './components/landing/FooterSection';

export default function LandingMediquir() {
    return (
        <Box bg="#F8F9FA" style={{ minHeight: '100vh', overflow: 'hidden' }}>

            {/* 1. EL NUEVO HERO INTELIGENTE */}
            <HeroSection />

            {/* 2. SECCIÓN DE CATEGORÍAS (Próximo paso) */}
            <CategorySection />

            {/* 3. PRODUCTOS MÁS VENDIDOS Y OFERTAS (Próximo paso) */}
            <BestSellersSection />


            {/* 4. FOOTER CORPORATIVO */}
            <FooterSection />

        </Box>
    );
}