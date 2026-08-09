import { NextResponse } from 'next/server';
import sequelize from '@/sequelize';
import {
    Consumible, Filtro, Aceite, Bateria, Neumatico, Correa, Sensor,
    GrupoEquivalencia, ConsumibleSerializado, ConsumibleInstalado,
    SubsistemaInstancia, Activo, VehiculoInstancia, Remolque,
    MaquinaInstancia, Vehiculo, Maquina, RemolqueInstancia, Manguera,
    Combustible, Herramienta, ConsumibleRecomendado, Subsistema, RepuestoGeneral
} from '@/models';

// 🔥 FUNCIÓN HELPER OBLIGATORIA: Gestiona los grupos de equivalencia dinámicamente 🔥
async function gestionarGrupoEquivalencia(datosTecnicos, modeloHijoInstancia, ModeloHijoClase, transaction) {
    let grupoId = modeloHijoInstancia ? modeloHijoInstancia.grupoEquivalenciaId : null;

    // 1. Si el usuario seleccionó una vinculación en el modal
    if (datosTecnicos.equivalenciaSeleccionada && datosTecnicos.equivalenciaSeleccionada.id) {
        const consumibleHermanoId = datosTecnicos.equivalenciaSeleccionada.id;
        const hermano = await ModeloHijoClase.findOne({ where: { consumibleId: consumibleHermanoId }, transaction });

        if (hermano) {
            if (hermano.grupoEquivalenciaId) {
                return hermano.grupoEquivalenciaId;
            } else {
                const nuevoGrupo = await GrupoEquivalencia.create({
                    nombre: `Grupo para ${hermano.marca} ${hermano.codigo}`,
                    marcaOEM: datosTecnicos.marcaOEM || null,
                    codigoOEM: datosTecnicos.codigoOEM || null
                }, { transaction });
                await hermano.update({ grupoEquivalenciaId: nuevoGrupo.id }, { transaction });
                return nuevoGrupo.id;
            }
        }
    }

    // 2. Si NO hay selección manual, pero el usuario escribió un código OEM
    if (datosTecnicos.codigoOEM) {
        let grupoExistente = await GrupoEquivalencia.findOne({
            where: { codigoOEM: datosTecnicos.codigoOEM },
            transaction
        });

        if (grupoExistente) {
            return grupoExistente.id;
        } else {
            const nuevoGrupo = await GrupoEquivalencia.create({
                nombre: `OEM ${datosTecnicos.marcaOEM || ''} ${datosTecnicos.codigoOEM}`.trim(),
                marcaOEM: datosTecnicos.marcaOEM || null,
                codigoOEM: datosTecnicos.codigoOEM
            }, { transaction });
            return nuevoGrupo.id;
        }
    }

    return grupoId; // Si no hizo nada, conservamos el que ya tenía (o null)
}

// GET: Obtener un consumible por ID con detalles completos + Instalaciones Equivalentes
export async function GET(request, { params }) {
    const { id } = await params;

    try {
        const consumible = await Consumible.findByPk(id, {
            include: [
                {
                    model: Filtro,
                    include: [{
                        model: GrupoEquivalencia,
                        as: 'grupoEquivalencia',
                        include: [{
                            model: Filtro,
                            as: 'filtros',
                            include: [{ model: Consumible }]
                        }]
                    }]
                },
                { model: Aceite },
                { model: Bateria },
                { model: Neumatico },
                { model: Correa },
                { model: Sensor },
                { model: Combustible },
                { model: RepuestoGeneral },
                {
                    model: ConsumibleSerializado,
                    as: 'serializados',
                    include: [{
                        model: Activo, as: 'activo', include: [
                            { model: VehiculoInstancia, as: 'vehiculoInstancia', include: [{ model: Vehiculo, as: 'plantilla' }] },
                            { model: RemolqueInstancia, as: 'remolqueInstancia', include: [{ model: Remolque, as: 'plantilla' }] },
                            { model: MaquinaInstancia, as: 'maquinaInstancia', include: [{ model: Maquina, as: 'plantilla' }] }
                        ]
                    }]
                },
                {
                    model: ConsumibleInstalado,
                    as: 'instalaciones',
                    order: [['createdAt', 'DESC']],
                    include: [{ 
                        model: SubsistemaInstancia, 
                        as: 'subsistema',
                        include: [{
                            model: Activo, as: 'activo', include: [
                                { model: VehiculoInstancia, as: 'vehiculoInstancia', include: [{ model: Vehiculo, as: 'plantilla' }] },
                                { model: RemolqueInstancia, as: 'remolqueInstancia', include: [{ model: Remolque, as: 'plantilla' }] },
                                { model: MaquinaInstancia, as: 'maquinaInstancia', include: [{ model: Maquina, as: 'plantilla' }] }
                            ]
                        }]
                    }]
                },
                {
                    model: ConsumibleRecomendado,
                    as: 'recomendaciones',
                    include: [{
                        model: Subsistema,
                        as: 'subsistema',
                        include: [{ model: Vehiculo, as: 'vehiculo' }]
                    }]
                }
            ]
        });

        if (!consumible) {
            return NextResponse.json({ error: 'Consumible no encontrado' }, { status: 404 });
        }

        // Búsqueda de instalaciones de hermanos equivalentes
        let instalacionesHermanos = [];
        
        const hijoConGrupo = consumible.Filtro || consumible.Correa || consumible.Sensor || consumible.RepuestoGeneral;
        
        if (hijoConGrupo && hijoConGrupo.grupoEquivalenciaId) {
            const modelosHijos = [Filtro, Correa, Sensor, RepuestoGeneral];
            let hermanosIds = [];

            for (const Modelo of modelosHijos) {
                const hermanos = await Modelo.findAll({
                    where: { 
                        grupoEquivalenciaId: hijoConGrupo.grupoEquivalenciaId,
                    },
                    attributes: ['consumibleId']
                });
                hermanosIds = [...hermanosIds, ...hermanos.map(h => h.consumibleId)];
            }
            
            hermanosIds = hermanosIds.filter(hId => hId !== parseInt(id));

            if (hermanosIds.length > 0) {
                instalacionesHermanos = await ConsumibleInstalado.findAll({
                    where: { consumibleId: hermanosIds },
                    order: [['createdAt', 'DESC']],
                    include: [
                        { model: Consumible, as: 'fichaTecnica', attributes: ['id', 'nombre'] },
                        { 
                            model: SubsistemaInstancia, 
                            as: 'subsistema',
                            include: [{
                                model: Activo, as: 'activo', include: [
                                    { model: VehiculoInstancia, as: 'vehiculoInstancia', include: [{ model: Vehiculo, as: 'plantilla' }] },
                                    { model: RemolqueInstancia, as: 'remolqueInstancia', include: [{ model: Remolque, as: 'plantilla' }] },
                                    { model: MaquinaInstancia, as: 'maquinaInstancia', include: [{ model: Maquina, as: 'plantilla' }] }
                                ]
                            }]
                        }
                    ]
                });
                
                instalacionesHermanos = instalacionesHermanos.map(inst => {
                    const data = inst.toJSON();
                    data.esEquivalente = true;
                    return data;
                });
            }
        }

        const jsonConsumible = consumible.toJSON();
        jsonConsumible.instalaciones = [...jsonConsumible.instalaciones, ...instalacionesHermanos]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 30); 

        return NextResponse.json(jsonConsumible);

    } catch (error) {
        console.error("ERROR FULL:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT: Actualizar un consumible
export async function PUT(request, { params }) {
    const { id } = await params; 
    const body = await request.json();
    const t = await sequelize.transaction();

    try {
        const consumible = await Consumible.findByPk(id, { transaction: t });
        if (!consumible) throw new Error('Consumible no encontrado');

        await consumible.update({
            nombre: body.nombre,
            descripcion: body.descripcion,
            categoria: body.categoria,
            stockMinimo: body.stockMinimo,
            unidadMedida: body.unidadMedida,
            precioPromedio: body.precioPromedio,
            ubicacionBase: body.ubicacionBase, 
            stockAlmacen: body.stockAlmacen,
            datosTecnicos: body.datosTecnicos 
        }, { transaction: t });

        const datosTecnicos = body.datosTecnicos || {};

        if (body.tipoSpecifico === 'Filtro') {
            const filtro = await Filtro.findOne({ where: { consumibleId: id }, transaction: t });
            const grupoId = await gestionarGrupoEquivalencia(datosTecnicos, filtro, Filtro, t);

            const dataFiltro = {
                marca: datosTecnicos.marca,
                codigo: datosTecnicos.codigo,
                tipo: datosTecnicos.tipo,
                posicion: datosTecnicos.posicion,
                grupoEquivalenciaId: grupoId
            };

            if (filtro) await filtro.update(dataFiltro, { transaction: t });
            else await Filtro.create({ ...dataFiltro, consumibleId: id }, { transaction: t });
        }

        if (body.tipoSpecifico === 'Aceite') {
            const aceite = await Aceite.findOne({ where: { consumibleId: id }, transaction: t });
            const dataAceite = { viscosidad: datosTecnicos.viscosidad, tipoBase: datosTecnicos.tipoBase, marca: datosTecnicos.marca };
            if (aceite) await aceite.update(dataAceite, { transaction: t });
            else await Aceite.create({ ...dataAceite, consumibleId: id }, { transaction: t });
        }

        if (body.tipoSpecifico === 'Bateria') {
            const bateria = await Bateria.findOne({ where: { consumibleId: id }, transaction: t });
            const data = { marca: datosTecnicos.marca, codigo: datosTecnicos.codigo, amperaje: datosTecnicos.amperaje, voltaje: datosTecnicos.voltaje, capacidad: datosTecnicos.capacidad };
            if (bateria) await bateria.update(data, { transaction: t });
            else await Bateria.create({ ...data, consumibleId: id }, { transaction: t });
        }

        if (body.tipoSpecifico === 'Neumatico') {
            const neumatico = await Neumatico.findOne({ where: { consumibleId: id }, transaction: t });
            const data = { marca: datosTecnicos.marca, modelo: datosTecnicos.modelo, medida: datosTecnicos.medida, esTubeless: datosTecnicos.esTubeless, esRecauchable: datosTecnicos.esRecauchable };
            if (neumatico) await neumatico.update(data, { transaction: t });
            else await Neumatico.create({ ...data, consumibleId: id }, { transaction: t });
        }

        if (body.tipoSpecifico === 'Correa') {
            const correa = await Correa.findOne({ where: { consumibleId: id }, transaction: t });
            const grupoId = await gestionarGrupoEquivalencia(datosTecnicos, correa, Correa, t);

            const data = { marca: datosTecnicos.marca, codigo: datosTecnicos.codigo, grupoEquivalenciaId: grupoId };
            if (correa) await correa.update(data, { transaction: t });
            else await Correa.create({ ...data, consumibleId: id }, { transaction: t });
        }

        if (body.tipoSpecifico === 'Manguera') {
            const manguera = await Manguera.findOne({ where: { consumibleId: id }, transaction: t });
            const dataManguera = { marca: datosTecnicos.marca, diametro: datosTecnicos.diametro, longitud: datosTecnicos.longitud, conectores: datosTecnicos.conectores };
            if (manguera) await manguera.update(dataManguera, { transaction: t });
            else await Manguera.create({ ...dataManguera, consumibleId: id }, { transaction: t });
        }

        if (body.tipoSpecifico === 'Sensor') {
            const sensor = await Sensor.findOne({ where: { consumibleId: id }, transaction: t });
            const grupoId = await gestionarGrupoEquivalencia(datosTecnicos, sensor, Sensor, t);

            const dataSensor = { marca: datosTecnicos.marca, codigo: datosTecnicos.codigo, nombre: datosTecnicos.nombreEspecifico || body.nombre, grupoEquivalenciaId: grupoId };
            if (sensor) await sensor.update(dataSensor, { transaction: t });
            else await Sensor.create({ ...dataSensor, consumibleId: id }, { transaction: t });
        }

        if (body.tipoSpecifico === 'Gasoil' || body.tipoSpecifico === 'Combustible') {
            const combustible = await Combustible.findOne({ where: { consumibleId: id }, transaction: t });
            const dataCombustible = { tipoCombustible: datosTecnicos.tipoCombustible || 'gasoil', tipoTanque: datosTecnicos.tipoTanque, dimensiones: datosTecnicos.dimensiones, capacidadTotalLitros: datosTecnicos.capacidadTotalLitros || 0 };
            if (combustible) await combustible.update(dataCombustible, { transaction: t });
            else await Combustible.create({ ...dataCombustible, consumibleId: id }, { transaction: t });
        }

        if (body.tipoSpecifico === 'Herramienta') {
            const herramienta = await Herramienta.findOne({ where: { consumibleId: id }, transaction: t });
            const dataHerramienta = { tipoAlimentacion: datosTecnicos.tipoAlimentacion, medidaOCapacidad: datosTecnicos.medidaOCapacidad, requiereCalibracion: datosTecnicos.requiereCalibracion, mesesGarantia: datosTecnicos.mesesGarantia, esDePrecision: datosTecnicos.esDePrecision };
            if (herramienta) await herramienta.update(dataHerramienta, { transaction: t });
            else await Herramienta.create({ ...dataHerramienta, consumibleId: id }, { transaction: t });
        }

        if (body.tipoSpecifico === 'Repuesto General') {
            const repuesto = await RepuestoGeneral.findOne({ where: { consumibleId: id }, transaction: t });
            const grupoId = await gestionarGrupoEquivalencia(datosTecnicos, repuesto, RepuestoGeneral, t);
        
            const dataRepuesto = {
                marca: datosTecnicos.marca,
                codigo: datosTecnicos.codigo,
                codigoOriginal: datosTecnicos.codigoOriginal,
                grupoEquivalenciaId: grupoId
            };
        
            if (repuesto) {
                await repuesto.update(dataRepuesto, { transaction: t });
            } else {
                await RepuestoGeneral.create({ ...dataRepuesto, consumibleId: id }, { transaction: t });
            }
        }

        if (body.recomendaciones && Array.isArray(body.recomendaciones)) {
            const existingRecs = await ConsumibleRecomendado.findAll({ where: { consumibleId: id }, transaction: t });
            const existingIds = existingRecs.map(r => r.id);
            const incomingIds = body.recomendaciones.map(r => r.id).filter(Boolean);

            const toDelete = existingIds.filter(eId => !incomingIds.includes(eId));
            if (toDelete.length > 0) {
                await ConsumibleRecomendado.destroy({ where: { id: toDelete }, transaction: t });
            }

            for (const rec of body.recomendaciones) {
                if (rec.id) {
                    await ConsumibleRecomendado.update(
                        { cantidad: rec.cantidad },
                        { where: { id: rec.id }, transaction: t }
                    );
                } else {
                    await ConsumibleRecomendado.create({
                        consumibleId: id,
                        subsistemaId: rec.subsistemaId,
                        cantidad: rec.cantidad || 1,
                        categoria: body.categoria || 'general',
                        tipoCriterio: 'individual'
                    }, { transaction: t });
                }
            }
        }

        await t.commit();
        return NextResponse.json({ success: true, message: 'Consumible actualizado' });

    } catch (error) {
        await t.rollback();
        console.error("Error en PUT:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE: Eliminar un consumible
export async function DELETE(request, { params }) {
    const { id } = await params;
    const t = await sequelize.transaction();
    try {
        const consumible = await Consumible.findByPk(id, { transaction: t });
        if (!consumible) throw new Error('Consumible no encontrado');

        await consumible.destroy({ transaction: t });
        await t.commit();
        return NextResponse.json({ success: true, message: 'Consumible eliminado' });
    } catch (error) {
        await t.rollback();
        console.error("Error API Consumibles:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}