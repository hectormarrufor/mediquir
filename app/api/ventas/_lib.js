import { rolDe } from '@/app/constants/roles';

// Monto de una venta en dólares (las hechas en bolívares se convierten con su propia tasa)
export const USD = `(CASE WHEN v."moneda" = 'BS' THEN v."totalFinal" / NULLIF(v."tasaCambio", 0) ELSE v."totalFinal" END)`;

// Filtro por rol: un vendedor solo ve lo suyo
export function alcanceDe(sesion) {
    if (rolDe(sesion) !== 'vendedor') return { sql: '', replacements: {} };
    return {
        sql: ' AND (v."vendedorId" = :yo OR v."empacadorId" = :yo OR v."etiquetadorId" = :yo)',
        replacements: { yo: Number(sesion.id) },
    };
}
