'use client';
import { useEffect, useState } from 'react';

export default function InstalacionIOSBanner() {
  const [mostrarBanner, setMostrarBanner] = useState(false);

  useEffect(() => {
    const isIOS = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    const isInStandalone = window.navigator.standalone === true;

    if (isIOS && !isInStandalone) {
      setMostrarBanner(true);
    }
  }, []);

  if (!mostrarBanner) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      background: '#fff8dc',
      padding: '12px',
      width: '100%',
      textAlign: 'center',
      zIndex: 9999,
      borderTop: '1px solid #ccc'
    }}>
      📱 Para instalar esta app en tu iPhone:
      <br />
      Toca el botón <strong>Compartir</strong> y luego <strong>“Agregar a pantalla de inicio”</strong>.
    </div>
  );
}