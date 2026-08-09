// generarVapid.js
const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();
console.log('Clave pública:', keys.publicKey);
console.log('Clave privada:', keys.privateKey);