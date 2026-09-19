import { redirect } from 'next/navigation';

// "Nuevo pedido" ahora se hace desde el POS (pedido al mayor) en Ventas.
export default function NuevoPedidoAntiguo() {
    redirect('/superuser/ventas?nueva=1');
}
