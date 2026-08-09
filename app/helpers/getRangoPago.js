// app/helpers/getRangoPago.js

export const getRangoPago = () => {
  const hoy = new Date();
  
  // 1. Encontrar el Jueves más reciente (ayer o hace unos días)
  // Si hoy es Viernes (5), el Jueves fue ayer.
  const finCorte = new Date(hoy);
  while (finCorte.getDay() !== 4) { // 4 = Jueves
    finCorte.setDate(finCorte.getDate() - 1);
  }
  // Ajustar al final del día jueves para que tome todas las horas
  finCorte.setHours(23, 59, 59, 999);

  // 2. El inicio del corte es el Viernes anterior (6 días antes del jueves)
  const inicioCorte = new Date(finCorte);
  inicioCorte.setDate(inicioCorte.getDate() - 6);
  inicioCorte.setHours(0, 0, 0, 0);

  return {
    inicio: inicioCorte,
    fin: finCorte,
    inicioStr: inicioCorte.toLocaleDateString("es-VE"),
    finStr: finCorte.toLocaleDateString("es-VE")
  };
};