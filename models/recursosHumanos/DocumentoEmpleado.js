const { DataTypes } = require("sequelize");
const sequelize = require("../../sequelize");

const DocumentoEmpleado = sequelize.define("DocumentoEmpleado", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  tipo: {
    type: DataTypes.ENUM("Cedula", "RIF", "Licencia", "CertificadoMedico", "Otro"),
    allowNull: false,
  },
  // Solo aplica si tipo es 'Licencia' (1, 2, 3, 4, 5)
  gradoLicencia: {
    type: DataTypes.INTEGER, 
    allowNull: true,
    validate: { min: 1, max: 5 }
  },
  numeroDocumento: {
    type: DataTypes.STRING,
    allowNull: true, // A veces es el mismo que la cédula, pero por si acaso
  },
  fechaVencimiento: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  imagen: {
    type: DataTypes.STRING, // URL de Vercel Blob
    allowNull: true,
  },
  observaciones: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  empleadoId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  }
});

// Definir Relaciones
DocumentoEmpleado.associate = (models) => {
    DocumentoEmpleado.belongsTo(models.Empleado, { foreignKey: "empleadoId" });
};

module.exports = DocumentoEmpleado;