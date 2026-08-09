'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Paper, Title, LoadingOverlay, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import ConsumibleForm from '../../../components/ConsumibleForm';

export default function EditarConsumiblePage() {
    const { id } = useParams();
    const router = useRouter();
    
    const [loading, setLoading] = useState(true);
    const [initialData, setInitialData] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch(`/api/inventario/consumibles/${id}`);
                if (!res.ok) throw new Error('Error al cargar datos');
                const data = await res.json();
                
                const dataFormulario = adaptarDatosParaFormulario(data);
                setInitialData(dataFormulario);

            } catch (error) {
                console.error(error);
                notifications.show({ title: 'Error', message: error.message, color: 'red' });
                router.push('/superuser/inventario/consumibles');
            } finally {
                setLoading(false);
            }
        };

        if (id) fetchData();
    }, [id, router]);

    const handleSubmit = async (values) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/inventario/consumibles/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(values),
            });

            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Error al actualizar');

            notifications.show({ title: 'Éxito', message: 'Consumible actualizado', color: 'green' });
            router.push('/superuser/inventario/consumibles');
            
        } catch (error) {
            notifications.show({ title: 'Error', message: error.message, color: 'red' });
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <LoadingOverlay visible />;
    if (!initialData && !loading) return <Text>No se encontraron datos.</Text>;

    return (
        <Paper p="md">
            <Title order={2} mb="lg">Editar Consumible: {initialData.nombre}</Title>
            <ConsumibleForm
                initialValues={initialData} 
                onSubmit={handleSubmit}
                isEdit={true} 
            />
        </Paper>
    );
}

// --- FUNCIÓN DE ADAPTACIÓN ---
function adaptarDatosParaFormulario(bdData) {
    if (!bdData) return {};

    const base = {
        id: bdData.id,
        nombre: bdData.nombre || '',
        categoria: bdData.categoria || '',
        stockMinimo: Number(bdData.stockMinimo) || 0,
        stockAlmacen: Number(bdData.stockAlmacen) || 0,
        precioPromedio: Number(bdData.precioPromedio) || 0,
        unidadMedida: bdData.unidadMedida || 'unidades',
        clasificacion: bdData.tipo === 'serializado' ? 'Serializado' : 'Fungible',
        tipoSpecifico: bdData.tipoSpecifico || 'Otro',
        ubicacionBase: bdData.ubicacionBase || 'Almacén Principal',
        datosTecnicos: bdData.datosTecnicos || {},
        esUniversal: bdData.datosTecnicos?.esUniversal || false, // 🔥 EXTRAEMOS EL FLAG UNIVERSAL 🔥
        itemsSerializados: bdData.serializados?.map(s => ({ 
            serial: s.serial, 
            garantia: s.fechaGarantia
        })) || [],
        recomendaciones: bdData.recomendaciones?.map(r => ({
            id: r.id,
            subsistemaId: r.subsistemaId,
            subsistemaNombre: r.subsistema?.nombre,
            vehiculoId: r.subsistema?.vehiculoId,
            vehiculoNombre: r.subsistema?.vehiculo ? `${r.subsistema.vehiculo.marca} ${r.subsistema.vehiculo.modelo}` : 'Vehículo Desconocido',
            cantidad: r.cantidad
        })) || [],
    };

    let datosHijo = {};
    let grupo = null;

    if (bdData.Filtro) {
        grupo = bdData.Filtro.grupoEquivalencia;
        datosHijo = {
            marca: bdData.Filtro.marca || '',
            codigo: bdData.Filtro.codigo || '',
            tipo: bdData.Filtro.tipo === "aire" ? "Aire" : bdData.Filtro.tipo === "aceite" ? "Aceite" : bdData.Filtro.tipo === "combustible" ? "Combustible" : "", 
            posicion: bdData.Filtro.posicion === "primario" ? "Primario" : "Secundario",
            imagen: bdData.Filtro.imagen || '',
            grupoEquivalenciaId: bdData.Filtro.grupoEquivalenciaId,
        };
    } else if (bdData.Aceite) {
        datosHijo = {
            marca: bdData.Aceite.marca || '',
            viscosidad: bdData.Aceite.viscosidad || '',
            aplicacion: bdData.Aceite.aplicacion || '',
            tipoAceite: bdData.Aceite.tipoBase || '', 
            modelo: bdData.Aceite.modelo || '',
        };
    } else if (bdData.Baterium || bdData.Bateria) {
        const bat = bdData.Baterium || bdData.Bateria;
        datosHijo = {
            marca: bat.marca || '',
            codigo: bat.codigo || '',
            amperaje: bat.amperaje || 0,
            voltaje: bat.voltaje || 12,
            capacidad: bat.capacidad || 0,
        };
    } else if (bdData.Neumatico) {
        datosHijo = {
            marca: bdData.Neumatico.marca || '',
            medida: bdData.Neumatico.medida || '',
            modelo: bdData.Neumatico.modelo || '',
            esTubeless: bdData.Neumatico.esTubeless || false,
            esRecauchable: bdData.Neumatico.esRecauchable || false,
        };
    } else if (bdData.Correa) {
        grupo = bdData.Correa.grupoEquivalencia;
        datosHijo = {
            marca: bdData.Correa.marca || '',
            codigo: bdData.Correa.codigo || '',
            grupoEquivalenciaId: bdData.Correa.grupoEquivalenciaId,
        };
    } else if (bdData.Sensor) {
        grupo = bdData.Sensor.grupoEquivalencia;
        datosHijo = {
            marca: bdData.Sensor.marca || '',
            codigo: bdData.Sensor.codigo || '',
            nombreEspecifico: bdData.Sensor.nombre || '',
            grupoEquivalenciaId: bdData.Sensor.grupoEquivalenciaId,
        };
    } else if (bdData.Manguera) {
        datosHijo = {
            marca: bdData.Manguera.marca || '',
            diametro: bdData.Manguera.diametro || '',
            longitud: bdData.Manguera.longitud || '',
            conectores: bdData.Manguera.conectores || '',
        };
    } else if (bdData.Combustible) {
        datosHijo = {
            categoria: bdData.Combustible.tipoCombustible || bdData.categoria || 'gasoil',
            tipoTanque: bdData.Combustible.tipoTanque || '',
            tanqueLargo: bdData.Combustible.dimensiones?.largo || '',
            tanqueAncho: bdData.Combustible.dimensiones?.ancho || '',
            tanqueAlto: bdData.Combustible.dimensiones?.alto || '',
            tanqueRadio: bdData.Combustible.dimensiones?.radio || '',
            capacidadTotalLitros: bdData.Combustible.capacidadTotalLitros || '',
        };
    } else if (bdData.Herramienta) {
        datosHijo = {
            tipoAlimentacion: bdData.Herramienta.tipoAlimentacion || 'Manual',
            medidaOCapacidad: bdData.Herramienta.medidaOCapacidad || '',
            requiereCalibracion: bdData.Herramienta.requiereCalibracion || false,
            esDePrecision: bdData.Herramienta.esDePrecision || false,
            mesesGarantia: bdData.Herramienta.mesesGarantia || 0,
            marca: bdData.datosTecnicos?.marca || '',
            codigo: bdData.datosTecnicos?.codigo || '',
        };
    } else if (bdData.RepuestoGeneral) {
        grupo = bdData.RepuestoGeneral.grupoEquivalencia;
        datosHijo = {
            marca: bdData.RepuestoGeneral.marca || '',
            codigo: bdData.RepuestoGeneral.codigo || '',
            grupoEquivalenciaId: bdData.RepuestoGeneral.grupoEquivalenciaId,
        };
    }

    const datosOEM = {
        marcaOEM: grupo?.marcaOEM || '',
        codigoOEM: grupo?.codigoOEM || '',
    };

    return {
        ...base,
        ...datosHijo,
        ...datosOEM
    };
}