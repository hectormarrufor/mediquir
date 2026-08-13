// utils/formatters.js

/**
 * Capitaliza la primera letra de una cadena, a menos que toda la cadena esté en mayúsculas.
 * @param {string} str - La cadena de texto a capitalizar.
 * @returns {string} La cadena capitalizada o en mayúsculas original.
 */
export const capitalizeUnlessUppercase = (str) => {
     if (!str) return '';

    // Dividimos la cadena en palabras por el espacio
    const words = str.split(' ');

    const capitalizedWords = words.map(word => {
        if (!word) return '';
        
        // Si la palabra completa está en mayúsculas, la mantenemos así
        if (word === word.toUpperCase()) {
            return word;
        }

        // Si no, capitalizamos la primera letra y el resto en minúsculas
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });

    // Unimos las palabras de nuevo en una sola cadena
    return capitalizedWords.join(' ');
};
/**
 * Convierte un texto a Title Case (Capitaliza la primera letra de cada palabra).
 * Ej: "inyectadora de plastico" -> "Inyectadora De Plastico"
 */
export const capitalizarPalabras = (texto) => {
    if (!texto) return '';
    return texto
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

// Aquí puedes ir agregando a futuro más funciones globales, como:
// export const formatearMoneda = (numero) => { ... }

// 🔥 FORMATEADOR VISUAL AVANZADO CON 3 DECIMALES Y SEPARADORES
export const formatearPrecio = (valor) => {
    const numero = Number(valor);
    if (isNaN(numero)) return '0.000';

    // Usamos el formato internacional adaptado para mostrar siempre 3 decimales
    // 'en-US' usa comas para miles y punto para decimales (ej: 1,234.500)
    // Si prefieres el formato latino (1.234,500), puedes cambiar 'en-US' por 'es-VE'
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
    }).format(numero);
};