// Consulta de RIF del portal del SENIAT (tiene captcha: se abre en otra pestaña y la persona pega el RIF)
export const URL_SENIAT_RIF = 'http://contribuyente.seniat.gob.ve/BuscaRif/BuscaRif.jsp';
// RIF sin guiones ni espacios y en mayúsculas, para comparar ("j-12345678-9" y "J123456789" son el mismo)
export const normRif = (r) => String(r || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
