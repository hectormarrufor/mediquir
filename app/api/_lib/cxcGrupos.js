import sequelize from '@/sequelize';

// Grupos (pestañas) del libro de cobranza con los ids de sus clientes. Tablas: GruposCobranza y GrupoCobranzaClientes (scripts/migraciones/cxc-grupos.cjs).
export async function listarGrupos() {
    const q = (sql) => sequelize.query(sql, { type: sequelize.QueryTypes.SELECT });
    const [grupos, miembros] = await Promise.all([
        q(`SELECT id, nombre, orden FROM "GruposCobranza" ORDER BY orden, id`),
        q(`SELECT "grupoId", "clienteId" FROM "GrupoCobranzaClientes"`),
    ]);
    const por = new Map();
    for (const m of miembros) (por.get(m.grupoId) || por.set(m.grupoId, []).get(m.grupoId)).push(m.clienteId);
    return grupos.map((g) => ({ ...g, clienteIds: por.get(g.id) || [] }));
}
