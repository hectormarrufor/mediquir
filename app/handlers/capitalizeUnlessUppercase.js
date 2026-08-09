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
}