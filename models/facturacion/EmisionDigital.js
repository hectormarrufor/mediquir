// models/facturacion/EmisionDigital.js
// Registro aislado de documentos enviados a la Imprenta Digital (The Factory HKA).
// En Fase 1 (DEMO) permite probar emisión, descarga de PDF, consulta de estado y anulación
// sin afectar Ventas, NotasFiscales, Correlativos ni el Libro de Ventas.
const { DataTypes } = require('sequelize');
const sequelize = require('../../sequelize');

const EmisionDigital = sequelize.define('EmisionDigital', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    ambiente: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'demo',
    },
    proveedor: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'TFHKA',
    },
    ventaId: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    tipoDocumento: {
        type: DataTypes.STRING(2),
        allowNull: false,
    },
    serie: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: '',
    },
    numeroDocumento: {
        type: DataTypes.STRING(30),
        allowNull: true,
    },
    transaccionId: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },
    numeroControl: {
        type: DataTypes.STRING(40),
        allowNull: true,
    },
    estado: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'PENDIENTE',
    },
    fechaEmision: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },
    moneda: {
        type: DataTypes.STRING(5),
        allowNull: false,
        defaultValue: 'BSD',
    },
    tasaCambio: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: true,
    },
    clienteRif: {
        type: DataTypes.STRING(30),
        allowNull: true,
    },
    clienteNombre: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
    totalBs: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
    },
    totalUsd: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: true,
    },
    urlConsulta: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    fechaAsignacion: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    horaAsignacion: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    rangoAsignado: {
        type: DataTypes.STRING(150),
        allowNull: true,
    },
    codigoRespuesta: {
        type: DataTypes.STRING(20),
        allowNull: true,
    },
    mensajeRespuesta: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    validaciones: {
        type: DataTypes.JSONB,
        allowNull: true,
    },
    payloadEnviado: {
        type: DataTypes.JSONB,
        allowNull: true,
    },
    respuestaCruda: {
        type: DataTypes.JSONB,
        allowNull: true,
    },
    anuladoMotivo: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    anuladoAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    usuarioId: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
}, {
    tableName: 'EmisionesDigitales',
    timestamps: true,
});

EmisionDigital.associate = (models) => {
    EmisionDigital.belongsTo(models.Venta, { foreignKey: 'ventaId', as: 'venta' });
    EmisionDigital.belongsTo(models.User, { foreignKey: 'usuarioId', as: 'usuario' });
};

module.exports = EmisionDigital;
