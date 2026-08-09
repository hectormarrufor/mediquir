'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Center, Loader, Stack, Text } from '@mantine/core';

function AuthGuardContent({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    // 1. Verificar si hay orden de redirección
    const redirectTo = searchParams.get('redirect_to');

    if (redirectTo) {
      try {
        const targetPath = decodeURIComponent(redirectTo);
        
        // 2. IMPORTANTE: Comparación estricta para romper el bucle
        // Si YA estamos en la ruta destino, NO hacemos nada (dejamos de cargar)
        if (pathname === targetPath) {
            setIsNavigating(false);
            return;
        }

        // 3. Si NO estamos en la ruta destino, navegamos
        console.log(`🔄 [AuthGuard] Redirigiendo de ${pathname} a ${targetPath}`);
        setIsNavigating(true);
        
        // Usamos replace para ir al destino
        router.replace(targetPath);
      } catch (e) {
        console.error('Error decodificando URL', e);
        setIsNavigating(false);
      }
    } else {
      // Si no hay parámetro redirect_to, aseguramos que no haya loader pegado
      setIsNavigating(false);
    }
  }, [searchParams, pathname, router]);

  // Solo mostramos el loader si estamos ACTIVAMENTE navegando por una redirección
  // Y aseguramos que la ruta actual NO sea ya la de destino (doble chequeo visual)
  const redirectTo = searchParams.get('redirect_to');
  const targetCheck = redirectTo ? decodeURIComponent(redirectTo) : null;
  
  if (isNavigating && pathname !== targetCheck) {
    return (
      <Center h="100vh">
        <Stack align="center" gap="md">
          <Loader size="lg" type="dots" />
          <Text size="sm" c="dimmed">Redirigiendo...</Text>
        </Stack>
      </Center>
    );
  }

  return children;
}

// Exportamos envuelto en Suspense por seguridad de Next.js
export default function AuthGuard({ children }) {
    return (
        <Suspense fallback={<Center h="100vh"><Loader /></Center>}>
            <AuthGuardContent>{children}</AuthGuardContent>
        </Suspense>
    );
}