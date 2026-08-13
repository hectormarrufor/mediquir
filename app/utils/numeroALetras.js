// app/utils/numeroALetras.js
export function numeroALetras(monto) {
    // Función simplificada para convertir números a letras (ideal para bolívares)
    const unidades = ['','UN ','DOS ','TRES ','CUATRO ','CINCO ','SEIS ','SIETE ','OCHO ','NUEVE '];
    const decenas = ['DIEZ ','ONCE ','DOCE ','TRECE ','CATORCE ','QUINCE ','DIECISEIS ','DIECISIETE ','DIECIOCHO ','DIECINUEVE '];
    const decenasMultiplos = ['','','VEINTE ','TREINTA ','CUARENTA ','CINCUENTA ','SESENTA ','SETENTA ','OCHENTA ','NOVENTA '];
    const centenas = ['','CIENTO ','DOSCIENTOS ','TRESCIENTOS ','CUATROCIENTOS ','QUINIENTOS ','SEISCIENTOS ','SETECIENTOS ','OCHOCIENTOS ','NOVECIENTOS '];

    const formatDecenas = (num) => {
        if (num < 10) return unidades[num];
        if (num < 20) return decenas[num - 10];
        const dec = Math.floor(num / 10);
        const uni = num % 10;
        return decenasMultiplos[dec] + (uni > 0 ? 'Y ' + unidades[uni] : '');
    };

    const formatCentenas = (num) => {
        if (num === 100) return 'CIEN ';
        const cen = Math.floor(num / 100);
        const rest = num % 100;
        return centenas[cen] + formatDecenas(rest);
    };

    const formatMiles = (num) => {
        if (num < 1000) return formatCentenas(num);
        const mil = Math.floor(num / 1000);
        const rest = num % 1000;
        const milStr = mil === 1 ? 'MIL ' : formatCentenas(mil) + 'MIL ';
        return milStr + formatCentenas(rest);
    };

    const formatMillones = (num) => {
        if (num < 1000000) return formatMiles(num);
        const millon = Math.floor(num / 1000000);
        const rest = num % 1000000;
        const millonStr = millon === 1 ? 'UN MILLON ' : formatMiles(millon) + 'MILLONES ';
        return millonStr + formatMiles(rest);
    };

    const numEntero = Math.floor(monto);
    const centavos = Math.round((monto - numEntero) * 100);
    const textoEntero = numEntero === 0 ? 'CERO ' : formatMillones(numEntero);
    
    return `${textoEntero}CON ${centavos.toString().padStart(2, '0')}/100`;
}