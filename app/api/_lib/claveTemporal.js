import crypto from 'node:crypto';

// Clave temporal legible: sin caracteres que se confunden (0/O, 1/l/I). Se muestra UNA vez; en la base solo queda su hash.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export function claveTemporal(largo = 10) {
    return Array.from(crypto.randomBytes(largo), (b) => ALFABETO[b % ALFABETO.length]).join('');
}
