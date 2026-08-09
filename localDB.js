import Dexie from 'dexie';

export const localDB = new Dexie('DadicaDB');

localDB.version(1).stores({
  fletes: '++id, codigo, clienteId, estado, createdAt, synced',
  odt: '++id, numero, estado, synced',
  gastosVariables: '++id, fleteId, tipo, synced',
  syncQueue: '++id, action, table, data, createdAt', // para guardar acciones pendientes
  // agrega las tablas que más uses offline
});

export const syncQueue = localDB.table('syncQueue'); // para guardar acciones pendientes