"use client"
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/charts/styles.css';
import './global.css';
import 'dayjs/locale/es';

import React, { Suspense, useEffect } from 'react';
import { AppShell, createTheme, MantineProvider, Center, Loader, Overlay } from '@mantine/core';
import { useDisclosure, useHeadroom, useMediaQuery } from '@mantine/hooks';
import { Notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { theme as themeConfig, cssVariablesResolver } from '../theme';
import { AuthProvider } from '@/hooks/useAuth';
import NavBar from './NavBar';
import AuthGuard from '@/hooks/authGuard';
import SiteHeader from './components/nav/SiteHeader';
import navClasses from './components/nav/navigation.module.css';
import AppBackground from './components/AppBackground';
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
  const isMobile = useMediaQuery('(max-width: 48em)');

  // Con el menú lateral abierto en móvil, el contenido de atrás no debe desplazarse
  useEffect(() => {
    document.body.style.overflow = opened && isMobile ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [opened, isMobile]);

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
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} forceColorScheme='light' withGlobalStyles withNormalizeCSS locale="es">
      <DatesProvider settings={{ locale: 'es' }}>
        <ReactQueryProvider>
          <AuthProvider>
            <Suspense fallback={<LoadingFallback />}>
              <AuthGuard>
                <Notifications />
                <AuthProvider>
                  <AppShell
                    header={{ height: { base: 60, sm: 70 }, collapsed: !pinned }}
                    navbar={{
                      width: 300,
                      breakpoint: 'sm',
                      collapsed: { desktop: true, mobile: !opened },
                    }}
                    padding="md"
                  >
                    <SiteHeader opened={opened} toggle={toggle} />

                    {/* Fondo atenuado detrás del menú lateral móvil; un toque lo cierra */}
                    {opened && (
                      <Overlay
                        hiddenFrom="sm"
                        fixed
                        color="#020817"
                        backgroundOpacity={0.6}
                        blur={3}
                        zIndex={99}
                        onClick={toggle}
                      />
                    )}

                    <AppShell.Navbar p="md" withBorder={false} className={navClasses.drawer}>
                      <NavBar router={router} close={toggle} opened={opened} />
                    </AppShell.Navbar>

                    <AppShell.Main p={0} pt={{ base: 60, sm: 70 }}>
                      <AppBackground />
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