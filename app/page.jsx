import React from 'react';
// Asegúrate de que las rutas coincidan con la ubicación de tus componentes
import LandingMediquir from './LandingMediquir'; 

export default function HomePage() {
  // Leemos la variable de entorno de Vercel. 
  const clientId = process.env.NEXT_PUBLIC_CLIENT_ID || 'mediquir';



  // Renderizado por defecto
  return <LandingMediquir />;
}