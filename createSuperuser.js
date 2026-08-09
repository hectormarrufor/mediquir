const { crearCliente } = require("./app/ApiFunctions/userServices");
const { default: defaultUser } = require("./objects/defaultUser");

crearCliente(defaultUser)