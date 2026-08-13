'use client';
import { useParams } from 'next/navigation';
import ProductoForm from '@/app/components/admin/ProductoForm'; // Ajusta la ruta

export default function EditarProductoPage() {
    const { id } = useParams();
    
    return <ProductoForm productId={id} />; // Al pasarle el ID, se comporta como "Editar"
}