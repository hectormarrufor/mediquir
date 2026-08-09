import React from 'react';
// Asegúrate de que las rutas coincidan con la ubicación de tus componentes
import LandingDadica from './LandingDadica'; 
import LandingForsumaca from './LandingForsumaca';

export default function HomePage() {
  // Leemos la variable de entorno de Vercel. 
  // Si no está definida (ej. desarrollo local), usamos 'dadica' como default.
  const clientId = process.env.NEXT_PUBLIC_CLIENT_ID || 'dadica';

  if (clientId === 'forsumaca') {
    return <LandingForsumaca />;
  }

  // Renderizado por defecto
  return <LandingDadica />;
}