
export const formatToInputDate = (dateValue) => {
    if (!dateValue) return "";
    
    // Si ya es un string YYYY-MM-DD, evitamos que new Date() lo arruine
    if (typeof dateValue === 'string' && dateValue.length === 10) {
        // Reemplazamos "-" por "/" para que JS lo trate como fecha LOCAL, no UTC
        const localDate = new Date(dateValue.replace(/-/g, '\/'));
        return new Intl.DateTimeFormat('en-CA', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(localDate);
    }
    
    // Si es un objeto Date completo
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Caracas',
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(dateValue));
};

export const getSafeDate = (val) => {
    if (!val) return new Intl.DateTimeFormat('en-CA').format(new Date());
    
    // Si la fecha viene de Postgres como "2026-01-20T00:00:00.000Z"
    // Tomamos solo los primeros 10 caracteres "2026-01-20"
    if (typeof val === 'string') return val.split('T')[0];
    
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Caracas'
    }).format(new Date(val));
};

export const toLocalDate = (dateVal) => {
    if (!dateVal) return new Date();
    // Si viene de la BD como string "2026-01-20" o ISO
    const d = new Date(dateVal);
    // Forzamos a que la fecha sea interpretada como LOCAL de Caracas
    // añadiendo un offset manual o simplemente usando los componentes
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};