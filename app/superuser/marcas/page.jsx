import { redirect } from 'next/navigation';

// Las marcas ahora se manejan junto con las categorías y los grupos de equivalencia
export default function Page() { redirect('/superuser/inventario/clasificacion?tab=marcas'); }
