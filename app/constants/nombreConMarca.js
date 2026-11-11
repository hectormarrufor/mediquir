// En todos los formatos impresos (facturas, notas, ventas, presupuestos) el artículo sale con su marca: «JERINGA 5 ML - BD».
// Si el nombre ya trae la marca, no se repite.
export const nombreConMarca = (nombre, marca) => {
    const n = String(nombre || '').trim();
    const m = String(marca || '').trim();
    if (!m || n.toLowerCase().includes(m.toLowerCase())) return n;
    return `${n} - ${m}`;
};
