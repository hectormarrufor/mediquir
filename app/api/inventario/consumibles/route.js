import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import sequelize from '@/sequelize';
import {
    Consumible,
    Filtro,
    Aceite,
    Bateria,
    Neumatico,
    Correa,
    Sensor,
    GrupoEquivalencia,
    ConsumibleSerializado,
    Manguera,
    Recauchado,
    Combustible,
    Herramienta,
    Subsistema,
    Vehiculo,
    ConsumibleRecomendado
} from '@/models';

export async function GET(request) {
    const { searchParams } = new URL(request.url);

    const search = searchParams.get('search') || '';
    const tipoFilter = searchParams.get('tipo') || searchParams.get('categoria') || '';
    const tipoSpecificoFilter = searchParams.get('tipoSpecifico') || '';
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 10;
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'DESC';

    // Nuevos parámetros para el filtrado avanzado
    const vehiculoModelo = searchParams.get('vehiculoModelo') || '';
    const vehiculoTipo = searchParams.get('vehiculoTipo') || '';

    const offset = (page - 1) * limit;

    try {
        let whereCondition = {};

        // 1. Filtro general de búsqueda (Nombre)
        if (search) {
            whereCondition = {
                nombre: { [Op.iLike]: `%${search}%` }
            };
        }

        // 2. Filtro por Categoría
        if (tipoFilter) {
            let pattern = '';
            if (tipoFilter.toLowerCase() === 'filtro') {
                pattern = 'filtro%';
            } else {
                pattern = `%${tipoFilter}%`;
            }

            const categoryCondition = sequelize.where(
                sequelize.cast(sequelize.col('Consumible.categoria'), 'text'),
                { [Op.iLike]: pattern }
            );

            if (!whereCondition[Op.and]) {
                whereCondition[Op.and] = [];
            }
            whereCondition[Op.and].push(categoryCondition);
        }

        if (tipoSpecificoFilter) {
            whereCondition.tipoSpecifico = tipoSpecificoFilter;
        }

        // 3. Lógica para filtros de vehículos anidados
        let vehiculoWhere = {};
        if (vehiculoModelo) {
            vehiculoWhere.modelo = { [Op.iLike]: `%${vehiculoModelo}%` };
        }
        if (vehiculoTipo) {
            vehiculoWhere.tipoVehiculo = vehiculoTipo;
        }
        
        // Si hay al menos un filtro de vehículo, forzamos el INNER JOIN (required: true)
        const isVehiculoFiltered = Object.keys(vehiculoWhere).length > 0;

        const { count, rows } = await Consumible.findAndCountAll({
            where: whereCondition,
            limit: limit,
            offset: offset,
            order: [[sortBy, sortOrder]],
            distinct: true, // Vital para contar bien con includes 1:N
            subQuery: false, // Previene errores de paginación con where en includes anidados
            include: [
                { model: Filtro, include: [{ model: GrupoEquivalencia, as: 'grupoEquivalencia' }] },
                { model: Aceite },
                { model: Bateria },
                { model: Neumatico },
                { model: Correa },
                { model: Sensor },
                { model: Combustible },
                { model: Manguera },
                { model: Herramienta },
                { model: ConsumibleSerializado, as: 'serializados' },
                { 
                    model: ConsumibleRecomendado, 
                    as: 'recomendaciones',
                    required: isVehiculoFiltered, 
                    include: [
                        {
                            model: Subsistema,
                            as: 'subsistema',
                            required: isVehiculoFiltered,
                            include: [
                                {
                                    model: Vehiculo,
                                    as: 'vehiculo',
                                    required: isVehiculoFiltered,
                                    where: isVehiculoFiltered ? vehiculoWhere : undefined
                                }
                            ]
                        }
                    ]
                }
            ]
        });

        const totalPages = Math.ceil(count / limit);

        return NextResponse.json({
            items: rows,
            total: count,
            totalPages: totalPages,
            currentPage: page
        });

    } catch (error) {
        console.error("Error API Consumibles:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Crear Consumible + Datos Técnicos + Equivalencias
export async function POST(request) {
    const t = await sequelize.transaction();

    try {
        const body = await request.json();
        const {
            nombre,
            tipo,
            categoria,
            tipoSpecifico, // <--- AÑADIDO: Recibimos el tipoSpecifico del frontend
            stockAlmacen,
            stockAsignado = 0,
            stockMinimo,
            precioPromedio,
            unidadMedida,
            datosTecnicos,
            itemsSerializados,
            ubicacionBase

        } = body;

        // 1. Crear el Registro Padre (Consumible SKU)
        const nuevoConsumible = await Consumible.create({
            nombre,
            tipo,
            categoria,
            tipoSpecifico, // <--- AÑADIDO: Lo guardamos en el padre
            stockAlmacen,
            stockAsignado,
            stockMinimo,
            precioPromedio,
            unidadMedida: unidadMedida === "unidad" ? "unidades" : unidadMedida,
            ubicacionBase, // <--- AÑADIDO: Guardamos la ubicación base en el catálogo
            datosTecnicos
        }, { transaction: t });

        // 2. Lógica Específica usando tipoSpecifico como pivote principal
        if (tipoSpecifico === 'Filtro' || categoria.startsWith('filtro')) {

            let grupoId = null;

            const { equivalenciaSeleccionada } = datosTecnicos;

            if (equivalenciaSeleccionada && equivalenciaSeleccionada.id) {

                const filtroHermano = await Filtro.findOne({
                    where: { id: equivalenciaSeleccionada.id },
                    transaction: t
                });

                if (filtroHermano) {
                    if (filtroHermano.grupoEquivalenciaId) {
                        grupoId = filtroHermano.grupoEquivalenciaId;
                    }
                    else {
                        const nuevoGrupo = await GrupoEquivalencia.create({
                            nombre: `Grupo para el filtro ${filtroHermano.marca} ${filtroHermano.codigo}`
                        }, { transaction: t });

                        grupoId = nuevoGrupo.id;

                        await filtroHermano.update({
                            grupoEquivalenciaId: grupoId
                        }, { transaction: t });
                    }
                }
            }

            await Filtro.create({
                marca: datosTecnicos.marca,
                tipo: datosTecnicos.tipo,
                codigo: datosTecnicos.codigo,
                posicion: datosTecnicos.posicion,
                imagen: datosTecnicos.imagen || null,
                consumibleId: nuevoConsumible.id,
                grupoEquivalenciaId: grupoId
            }, { transaction: t });
        }
        else if (tipoSpecifico === 'Correa') {
            await Correa.create({
                consumibleId: nuevoConsumible.id,
                marca: datosTecnicos.marca,
                codigo: datosTecnicos.codigo,
            }, { transaction: t });
        }
        else if (tipoSpecifico === 'Aceite') {
            await Aceite.create({
                consumibleId: nuevoConsumible.id,
                viscosidad: datosTecnicos.viscosidad,
                tipo: datosTecnicos.tipo,
                aplicacion: datosTecnicos.aplicacion
            }, { transaction: t });
        }
        else if (tipoSpecifico === 'Neumatico') {
            await Neumatico.create({
                consumibleId: nuevoConsumible.id,
                marca: datosTecnicos.marca,
                modelo: datosTecnicos.modelo,
                medida: datosTecnicos.medida,
                esRecauchable: datosTecnicos.esRecauchable || false,
                esTubeless: datosTecnicos.esTubeless || false
            }, { transaction: t });

        }
        else if (tipoSpecifico === 'Bateria') {
            await Bateria.create({
                consumibleId: nuevoConsumible.id,
                marca: datosTecnicos.marca,
                codigo: datosTecnicos.codigo,
                capacidad: datosTecnicos.capacidad,
                amperaje: datosTecnicos.amperaje,
                voltaje: datosTecnicos.voltaje
            }, { transaction: t });
        }
        else if (tipoSpecifico === 'Sensor') {
            await Sensor.create({
                consumibleId: nuevoConsumible.id,
                marca: datosTecnicos.marca,
                codigo: datosTecnicos.codigo,
                nombre: datosTecnicos.nombre
            }, { transaction: t });
        }
        else if (tipoSpecifico === 'Manguera') {
            await Manguera.create({
                consumibleId: nuevoConsumible.id,
                marca: datosTecnicos.marca,
                diametro: datosTecnicos.diametro,
                longitud: datosTecnicos.longitud,
                conectores: datosTecnicos.conectores
            }, { transaction: t });
        }
        // 🔥 NUEVA LÓGICA: Se detona exclusivamente si el tipoSpecifico es Combustible
        else if (tipoSpecifico === 'Combustible') {
            await Combustible.create({
                consumibleId: nuevoConsumible.id,
                // Usamos la categoría que envía el usuario (gasoil, gasolina, gnv, etc.)
                tipoCombustible: categoria,
                tipoTanque: datosTecnicos.tipoTanque,
                dimensiones: datosTecnicos.dimensiones,
                capacidadTotalLitros: datosTecnicos.capacidadTotalLitros || 0
            }, { transaction: t });
        }
        else if (tipoSpecifico === 'Herramienta') {
            await Herramienta.create({
                consumibleId: nuevoConsumible.id,
                tipoAlimentacion: datosTecnicos.tipoAlimentacion || 'Manual',
                medidaOCapacidad: datosTecnicos.medidaOCapacidad || null,
                requiereCalibracion: datosTecnicos.requiereCalibracion || false,
                mesesGarantia: datosTecnicos.mesesGarantia || 0,
                esDePrecision: datosTecnicos.esDePrecision || false
            }, { transaction: t });
        }
        else {
            console.log(`Consumible de tipoSpecifico ${tipoSpecifico} creado sin tabla hija asociada.`);
        }

        if (itemsSerializados && itemsSerializados.length > 0) {
            for (const item of itemsSerializados) {
                const nuevoSerial = await ConsumibleSerializado.create({
                    serial: item.serial,
                    fechaCompra: item.fechaCompra || null,
                    fechaVencimientoGarantia: item.fechaGarantia || null,
                    consumibleId: nuevoConsumible.id,
                    esRecauchado: item.esRecauchado || false,
                }, { transaction: t });

                if (item.historialRecauchado && item.historialRecauchado.length > 0) {
                    const historialData = item.historialRecauchado.map(h => ({
                        fecha: h.fecha,
                        garantiaHasta: h.fechaVencimientoGarantia,
                        costo: h.costo,
                        tallerId: h.tallerId,
                        consumibleSerializadoId: nuevoSerial.id
                    }));

                    await Recauchado.bulkCreate(historialData, { transaction: t });
                }
            }
        }

        await t.commit();
        return NextResponse.json({ success: true, data: nuevoConsumible }, { status: 201 });

    } catch (error) {
        await t.rollback();
        console.error("Error creando consumible:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}