'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Center, Loader } from '@mantine/core';

export default function SuperuserLayout({ children }) {
    const { user, loading, isAuthenticated } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading) {
            // Si el usuario no ha iniciado sesión, lo mandamos al login
            if (!isAuthenticated) {
                router.push('/login');
                return;
            }

            // SEGURIDAD: Si un cliente intenta entrar a /superuser o sus subrutas
            if (user?.clienteId) {
                router.push('/tienda');
            }
        }
    }, [user, loading, isAuthenticated, router]);

    // Mientras valida la sesión, mostramos un loader para evitar parpadeos visuales
    if (loading || !user || user.clienteId) {
        return (
            <Center h="100vh">
                <Loader size="xl" />
            </Center>
        );
    }

    return <>{children}</>;
}