"use client"
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/charts/styles.css';
import './global.css';
import 'dayjs/locale/es';

import React, { Suspense, useEffect } from 'react';
import { AppShell, Burger, createTheme, Group, Image as MantineImage, MantineProvider, UnstyledButton, Box, Center, Loader, Button, ActionIcon } from '@mantine/core';
import { useDisclosure, useHeadroom } from '@mantine/hooks';
import { Notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { theme as themeConfig } from '../theme';
import { AuthProvider } from '@/hooks/useAuth';
import LayoutMenu from './LayoutMenu';
import NavBar from './NavBar';
import AuthGuard from '@/hooks/authGuard';
import NotificationBell from './components/NotificationBell';
import { DatesProvider } from '@mantine/dates';
import ReactQueryProvider from './QueryProvider';
import Image from 'next/image';
import { tenant } from '@/config/tenant';
import { IconShoppingCart } from '@tabler/icons-react';

const theme = createTheme(themeConfig);

function LoadingFallback() {
  return (
    <Center h="100vh">
      <Loader size="lg" type="dots" />
    </Center>
  );
}

export default function ClientLayout({ children }) {
  const [opened, { toggle }] = useDisclosure();
  const router = useRouter();
  const pinned = useHeadroom({ fixedAt: 120 });

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js')
        .then(() => console.log('✅ SW Registrado'))
        .catch(err => console.error('❌ Error SW:', err));
    }
    //apartado para saber cuantas suscripciones push hay actualmente, se puede eliminar luego
    // fetch("/api/suscribir").then((res) => {
    //   res.json().then((data) => {
    //     console.log("Subscripciones actuales:", data);
    //   });
    // });
  }, []);

  return (
    <MantineProvider theme={theme} forceColorScheme='light' withGlobalStyles withNormalizeCSS locale="es">
      <DatesProvider settings={{ locale: 'es' }}>
        <ReactQueryProvider>
          <AuthProvider>
            <Suspense fallback={<LoadingFallback />}>
              <AuthGuard>
                <Notifications />
                <AuthProvider>
                  <AppShell
                    header={{ height: 60, collapsed: !pinned }}
                    navbar={{
                      width: 300,
                      breakpoint: 'sm',
                      collapsed: { desktop: true, mobile: !opened },
                    }}
                    padding="md"
                  >
                    <AppShell.Header
  style={{
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(0,0,0,0.1)'
  }}
>
  <Group h="100%" px="md" justify="space-between" wrap="nowrap">
    {/* 1. SECCIÓN LOGO */}
    <UnstyledButton onClick={() => router.push('/')}>
      <Box w={140} h={60} style={{ display: 'flex', alignItems: 'center' }}>
        <img
          src={tenant.assets.logo}
          alt={`Logo ${tenant.name}`}
          fetchPriority="high"
          style={{
            maxHeight: '60px',
            width: 'auto',
            maxWidth: '200px',
            objectFit: 'contain'
          }}
        />
      </Box>
    </UnstyledButton>

    {/* 2. SECCIÓN DERECHA (Carrito + Notificaciones + Menú) */}
    <Group wrap="nowrap" gap="sm">
      {/* Botón Carrito Desktop */}
      <Button
          variant="light" 
          color="blue" 
          radius="xl" 
          leftSection={<IconShoppingCart size={20} />}
          visibleFrom="sm"
      >
          Carrito
      </Button>

      {/* Botón Carrito Móvil (Solo el ícono para ahorrar espacio) */}
      <ActionIcon hiddenFrom="sm" variant="light" color="blue" size="lg" radius="xl">
          <IconShoppingCart size={20} />
      </ActionIcon>

      <NotificationBell />
      
      <Burger
        opened={opened}
        onClick={toggle}
        hiddenFrom="sm"
        size="sm"
      />
      
      <Box visibleFrom="sm">
        <LayoutMenu router={router} />
      </Box>
    </Group>
  </Group>
</AppShell.Header>

                    <AppShell.Navbar p="md" style={{ backgroundColor: 'rgba(255, 255, 255, 0.95)' }}>
                      <NavBar router={router} close={toggle} />
                    </AppShell.Navbar>

                    <AppShell.Main p={0} pt={60}>
                      <Box
                        style={{
                          position: 'fixed',
                          top: 0, left: 0, width: '100%', height: '100%',
                          zIndex: -1,
                          backgroundImage: `url(${tenant.assets.fondoGlobal})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          opacity: 0.3
                        }}
                      />
                      {children}
                    </AppShell.Main>
                  </AppShell>
                </AuthProvider>
              </AuthGuard>
            </Suspense>
          </AuthProvider>
        </ReactQueryProvider>
      </DatesProvider>
    </MantineProvider>
  );
}