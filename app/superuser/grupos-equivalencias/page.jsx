import { redirect } from 'next/navigation';

// Los grupos de equivalencia ahora se manejan junto con las marcas y las categorías
export default function Page() { redirect('/superuser/inventario/clasificacion?tab=grupos'); }
