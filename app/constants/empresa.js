// app/constants/empresa.js
export const MEMBRETE_MEDIQUIR = {
    nombre: "Materiales y Equipos Quirurgicos, C.A.",
    rif: "J-30487649-1",
    direccion: "CALLE VENEZUELA ENTRE AV. BOLIVAR Y AV. ALONSO, NRO. S/N SECTOR CASCO CENTRAL, CIUDAD OJEDA - ESTADO ZULIA.",
    telefonos: "0414-970.1172 / 0414-1680773",
    email: "mediquirca@gmail.com",
    logo: "/tenants/mediquir/logo.png" // Asegúrate de tener tu logo real en la carpeta /public de Next.js
};

// Datos fiscales de la empresa para los libros de compras y ventas.
// SUPUESTO (confírmalo con tu contador): la empresa es AGENTE DE RETENCIÓN de IVA y retiene el 75 % del IVA de toda factura de compra
// con IVA, como se ve en el libro de compras de ejemplo. Si dejara de serlo, pon agenteRetencionIva en false.
export const CONFIG_FISCAL = {
    agenteRetencionIva: true,
    porcentajeRetencionCompras: 75,
    alicuotaGeneral: 16,
    agencia: 'Oficina Principal',
    maxRenglonesFactura: 13, // renglones que caben en la forma libre preimpresa (media carta)
    estacion: '001',
};
