// Recibo de pago a un empleado: beneficio de alimentación, beneficio de transporte o quincena.
// Guarda una copia de los datos del empleado (nombre, cédula, cargo) para que el histórico no cambie si luego editan su ficha.
// El empleado lo confirma desde su propio usuario (casilla de conformidad): queda la fecha y hora, quién lo confirmó y la IP.
const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const PagoEmpleado = sequelize.define('PagoEmpleado', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tipo: { type: DataTypes.STRING(15), allowNull: false }, // ALIMENTACION | TRANSPORTE | QUINCENA
    empleadoId: { type: DataTypes.INTEGER, allowNull: false },
    empleadoNombre: { type: DataTypes.STRING(160), allowNull: false },
    cedula: { type: DataTypes.STRING(20), allowNull: false },
    cargo: { type: DataTypes.STRING(120), allowNull: true },
    fechaIngreso: { type: DataTypes.DATEONLY, allowNull: true },
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    periodoDesde: { type: DataTypes.DATEONLY, allowNull: true },
    periodoHasta: { type: DataTypes.DATEONLY, allowNull: true },
    dias: { type: DataTypes.INTEGER, allowNull: true },
    conceptos: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] }, // [{ concepto, asignacion, deduccion }]
    totalAsignaciones: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    totalDeducciones: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    totalCobrar: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    formaPago: { type: DataTypes.STRING(15), allowNull: true },
    referencia: { type: DataTypes.STRING(100), allowNull: true },
    conceptoTexto: { type: DataTypes.STRING(250), allowNull: true },
    estado: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'PENDIENTE' }, // PENDIENTE | CONFIRMADO | ANULADO
    confirmadoAt: { type: DataTypes.DATE, allowNull: true },
    confirmadoPorId: { type: DataTypes.INTEGER, allowNull: true },
    confirmadoIp: { type: DataTypes.STRING(60), allowNull: true },
    anuladoAt: { type: DataTypes.DATE, allowNull: true },
    anuladoMotivo: { type: DataTypes.STRING(250), allowNull: true },
    creadoPorId: { type: DataTypes.INTEGER, allowNull: true },
    creadoPorNombre: { type: DataTypes.STRING(120), allowNull: true },
}, { tableName: 'PagosEmpleados', timestamps: true });

PagoEmpleado.associate = (models) => {
    PagoEmpleado.belongsTo(models.Empleado, { foreignKey: 'empleadoId', as: 'empleado' });
};

module.exports = PagoEmpleado;
