// src/components/Layout.tsx
import type { ReactNode } from 'react';
import { AppShell, Text } from '@mantine/core';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <AppShell
    style={{ width: '100vw', boxSizing: 'border-box', overflowX: 'hidden' }}
    h='100vh'
      p={0}
      m={0}
    >
    <AppShell.Header bg="#00000063" style={{ position: 'fixed', top: 0, left: 0, width: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          padding: '0 rem',
          justifyContent: 'space-between',
        }}
      >
        <Text fw={700} c="white" size="lg">
          MediQuir
        </Text>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Inicio
          </button>
          <button
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Pacientes
          </button>
          <button
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Configuración
          </button>
        </div>
      </div>
    </AppShell.Header>

      

      <AppShell.Main style={{marginTop: 55}}>{children}</AppShell.Main>

    <AppShell.Footer>
      <div
        style={{
          backgroundColor: '#00000063',
          width: '100%',
          
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text fw={500} c="white">© 2025 MediQuir. Todos los derechos reservados.</Text>
      </div>
    </AppShell.Footer>
    </AppShell>
  );
}