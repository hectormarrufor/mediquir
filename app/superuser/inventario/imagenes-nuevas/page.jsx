import { redirect } from 'next/navigation';

// Antes eran dos pantallas (fotos y precios); ahora es un solo asistente.
export default function Page() { redirect('/superuser/inventario/auditar'); }
