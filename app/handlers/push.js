// utils/push.js
export async function suscribirsePush(fetched) {
  try {
    // Esperar a que el SW esté listo
    const reg = await navigator.serviceWorker.ready;
    if (!reg) {
      throw new Error('Service worker no está listo');
    } else {
      console.log("service worker disponible, procedo a suscribir al usuario")
    }

    // Crear suscripción push
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    });

    if (sub.endpoint.includes('wns2-ch1p.notify.windows.com')) {
      console.warn('Suscripción WNS no soportada');
      return;
    }

    let os = "Desconocido", browser = "Desconocido";
    if (navigator.userAgentData) {
      os = navigator.userAgentData.platform;
      browser = navigator.userAgentData.brands[0]?.brand || "Desconocido";
    } else {
      const ua = navigator.userAgent;
      if (/Android/i.test(ua)) os = "Android";
      else if (/Win/i.test(ua)) os = "Windows";
      else if (/Mac/i.test(ua)) os = "macOS";
      else if (/Linux/i.test(ua)) os = "Linux";

      if (/Chrome/i.test(ua)) browser = "Chrome";
      else if (/Firefox/i.test(ua)) browser = "Firefox";
      else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
      else if (/Edg/i.test(ua)) browser = "Edge";
    }
    console.log(`Suscripción push creada en ${os} usando ${browser}:`, sub);



    // Enviar suscripción al backend junto con datos del usuario
    await fetch('/api/suscribir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        suscripcion: sub,
        usuarioId: fetched?.id,
        rol: fetched?.isAdmin ? 'admin' : fetched?.rol,
        navegador: `${browser} - ${os}`,
        environment: window.location.hostname.includes('localhost') ? 'development' : 'production',
      }),
    });

    return sub;
  } catch (e) {
    console.error('Push subscribe failed', e);
    throw e; // opcional: relanzar para manejarlo fuera
  }
}
export async function desuscribirsePush() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers no disponibles, no se puede desuscribir de push');
    return null;
  }
  else {
    console.log("service worker disponible, procedo a desuscribir de push el usuario")
  }

  try {


    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    console.log("endpoint de la suscripcion a inactivar:", sub?.endpoint);
    if (sub) {
      try {
        await sub.unsubscribe();
        await fetch('/api/suscribir', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        console.log('Desuscripción push exitosa');
        return sub.endpoint;
      } catch (err) {
        console.error('Error al desuscribir push:', err.message);
      }
    }
    else {
      console.log('No hay suscripción push activa para desuscribir.');
    }
  }
  catch (e) {
    console.error("error en desuscribirsePush", e);
  }

  return null;
}
export async function eliminarTodasSuscripcionesInactivas() {
  try {
    const response = await fetch('/api/suscribir/eliminarTodas', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await response.json();
    if (response.ok) {
      console.log('Suscripciones inactivas eliminadas:', data);
    } else {
      console.error('Error al eliminar suscripciones inactivas:', data);
    }
  } catch (e) {
    console.error('Error en eliminarTodasSuscripcionesInactivas:', e);
  }
}

export async function pedirPermisoPush() {
  if (!('Notification' in window)) {
    console.warn('Este navegador no soporta notificaciones.');
    return;
  }
  if (Notification.permission === 'default') {
    const permiso = await Notification.requestPermission();
    if (permiso === 'granted') {
      console.log('Permiso de notificaciones concedido.');
    }
  } else if (Notification.permission === 'denied') {
    console.warn('Las notificaciones están bloqueadas. Revisa los permisos del navegador.');
  }
}