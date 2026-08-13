'use client';
import ProductoForm from '@/app/components/admin/ProductoForm'; // Ajusta la ruta a donde guardaste el componente

export default function NuevoProductoPage() {
    return <ProductoForm />; // Al no pasarle ID, se comporta como "Nuevo"
}