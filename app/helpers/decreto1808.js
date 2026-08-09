// utils/decreto1808.js

export const DECRETO_1808 = {
    "Fletes": {
        codigo: "053", // Código de declaración SENIAT
        baseImponible: 100, // % de la factura al que se le aplica la retención
        porcentajes: {
            "Persona Juridica": 3,  // 3% para empresas de transporte
            "Persona Natural": 3    // 3% para choferes independientes
        },
        aplicaSustraendo: false // Fletes no tiene sustraendo en la mayoría de los casos
    },
    "Servicios Generales": { // Mantenimiento mecánico, latonería, etc.
        codigo: "054",
        baseImponible: 100,
        porcentajes: {
            "Persona Juridica": 2, // 2% a talleres registrados
            "Persona Natural": 1   // 1% a mecánicos independientes
        },
        aplicaSustraendo: false
    },
    "Honorarios Profesionales": { // Contadores, Abogados, Ingenieros
        codigo: "001",
        baseImponible: 100,
        porcentajes: {
            "Persona Juridica": 5, 
            "Persona Natural": 3   
        },
        aplicaSustraendo: true // ¡AQUÍ ENTRA LA UNIDAD TRIBUTARIA!
    },
    "Arrendamiento": { // Alquiler de galpones o equipos
        codigo: "006",
        baseImponible: 100,
        porcentajes: {
            "Persona Juridica": 5,
            "Persona Natural": 3
        },
        aplicaSustraendo: false
    }
};

// Fórmula oficial del Sustraendo para Personas Naturales Residentes
export const calcularSustraendo = (valorUtBs, porcentajeRetencion) => {
    // Fórmula SENIAT: UT * 83.3334 * (Porcentaje de retención / 100)
    return valorUtBs * 83.3334 * (porcentajeRetencion / 100);
};