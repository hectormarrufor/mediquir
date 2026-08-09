export function sueldoSemanalDesdeMes(sueldoMensual) {
  return (sueldoMensual / 30) * 7;
}

export function sueldoDiarioDesdeMes(sueldoMensual) {
  return (sueldoMensual / 30);
}

export function sueldoXHora(sueldoDiario) {
    return (sueldoDiario / 8);
}

export const actualizarSueldos = (campo, valor) => {
  let mensual, semanal, diario, horario;

  switch (campo) {
    case "mensual":
      mensual = valor;
      diario = (valor / 4 / 7).toFixed(2);
      semanal = (valor / 4).toFixed(2);
      horario = (diario / 8).toFixed(2);
      break;
    case "diario":
      diario = valor;
      mensual = (valor * 7 * 4).toFixed(2);
      semanal = (valor * 7).toFixed(2);
      horario = (valor / 8).toFixed(2);
      break;
    case "semanal":
      semanal = valor
      diario = (valor / 7).toFixed(2);
      mensual = (semanal * 4).toFixed(2);
      horario = (diario / 8).toFixed(2);
      break;
    case "horario":
      horario = valor;
      diario = (valor * 8).toFixed(2);
      mensual = (diario * 7 * 4).toFixed(2);
      semanal = (diario * 7).toFixed(2);
      break;
    default:
      return;
  }

  return({ mensual, semanal, diario, horario });
};