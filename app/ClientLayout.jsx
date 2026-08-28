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
// En tu archivo ClientLayout.js
import dayjs from 'dayjs';
import 'dayjs/locale/es';

// Configuración global para toda la app
dayjs.locale('es');

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
                        background: 'linear-gradient(135deg, rgba(178, 220, 255, 0.92) 0%, rgba(92, 155, 192, 0.82) 40%, rgba(9, 45, 92, 0.92) 100%)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        borderBottom: '1px solid rgba(249, 50, 0, 0.08)', // Sutil toque del color corporativo en el borde
                        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.26)'
                      }}
                    >
                      <Group h="100%" px="xl" justify="space-between" wrap="nowrap">
                        {/* SECCIÓN LOGO */}
                        <UnstyledButton onClick={() => router.push('/')}>
                          <Box w={140} h={60} style={{ display: 'flex', alignItems: 'center' }}>
                            <img
                              src={tenant.assets.logo}
                              alt={`Logo ${tenant.name}`}
                              fetchPriority="high"
                              style={{
                                maxHeight: '60px',
                                width: 'auto',
                                objectFit: 'cover'
                              }}
                            />
                          </Box>
                        </UnstyledButton>

                        {/* SECCIÓN DERECHA */}
                        <Group wrap="nowrap" gap="md">
                          <NotificationBell />

                          <Box visibleFrom="sm">
                            <LayoutMenu router={router} />
                          </Box>

                          <Burger
                            opened={opened}
                            onClick={toggle}
                            hiddenFrom="sm"
                            size="sm"
                            color="#0B1B3D"
                          />
                        </Group>
                      </Group>
                    </AppShell.Header>

                    <AppShell.Navbar p="md"  style={{
                        background: 'linear-gradient(135deg, rgba(243, 248, 255, 0.92) 0%, rgba(92, 155, 192, 0.82) 40%, rgba(9, 45, 92, 0.92) 100%)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        borderBottom: '1px solid rgba(249, 50, 0, 0.08)', // Sutil toque del color corporativo en el borde
                        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.03)'
                      }}>
                      <NavBar router={router} close={toggle} />
                    </AppShell.Navbar>

                    <AppShell.Main p={0}>
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