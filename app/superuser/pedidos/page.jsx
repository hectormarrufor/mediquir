import { redirect } from 'next/navigation';

// Los pedidos ahora son ventas al mayor: esta pantalla antigua (que usaba un modelo que ya no existe) lleva a Ventas.
export default function PedidosAntiguo() {
    redirect('/superuser/ventas');
}
