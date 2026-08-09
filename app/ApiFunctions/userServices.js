
// clientesService.js
const bcrypt = require('bcryptjs');
require('dotenv').config();
const API_URL = '/api/users';


// Obtener todos los clientes (GET)
export async function obtenerUsuarios() {
  console.log(process.env)
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`Error al obtener Usuarios: ${response.statusText}`);
    }
    return response.json();
  } catch (error) {
    console.error('Error en obtenerUsuarios:', error);
    throw error;
  }
}

// Obtener un cliente por ID (GET)
export async function obtenerUsuarioPorId(id) {
  try {
    const response = await fetch(`${API_URL}/${id}`);
    if (!response.ok) {
      throw new Error(`Error al obtener Usuario ${id}: ${response.statusText}`);
    }
    return response.json();
  } catch (error) {
    console.error(`Error en obtenerUsuarioPorId (${id}):`, error);
    throw error;
  }
}

// Crear un nuevo cliente (POST)
export async function crearUsuario(usuario) {
  console.log(usuario);
  

  const encryptedPassword = await bcrypt.hash(usuario.password, 10);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...usuario, password: encryptedPassword }),
    });
    const json = await response.json()
    console.log(json)

    if (!json.error) {
      return json;
    }
    else {
      throw new Error(`Error al crear usuario: ${json.error}`);
    }

  } catch (error) {
    console.error('Error en crearUsuario:', error);
    throw error;
  }
}

export async function iniciarSesion(user, contrasena) {

  try {
    const response = await fetch('/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, contrasena }),
    });
    if (response.ok) {
      const data = await response.json();
  
      if (data.token) {
        localStorage.setItem('token', data.token);
      }
  
      return data;
    }
  } catch (error) {
    console.log("error inciando sesion: ", error);
    throw error;
  }
}

export async function cerrarSesion(redirect) {
  try {
    const response = await fetch('/api/users/logout', {
      method: 'POST',
    });

    if (response.ok) {
      localStorage.removeItem('token'); // Elimina el token del almacenamiento local
      // Redirige al usuario a la página de inicio de sesión
      redirect('/');
    } else {
      console.error('Error al cerrar sesión');
    }
  } catch (error) {
    console.error('Error al cerrar sesión:', error);
  }
}

export async function checkSession() {
  try {
    const response = await fetch('/api/users/session');
    const data = await response.json();
    return data.authenticated;
  } catch (error) {
    console.error('Error al verificar la sesión:', error);
  }
}

export const getPerfilUsuario = async () => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/clientes/perfil', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.json();
  } catch (error) {
    throw error;
  }
};

// Actualizar un cliente (PUT)
export async function actualizarUsuario(id, usuario) {
  try {
    const response = await fetch(`${API_URL}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(usuario),
    });

    if (!response.ok) {
      throw new Error(`Error al actualizar usuario ${id}: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error(`Error en actualizarUsuario (${id}):`, error);
    throw error;
  }
}

// Eliminar un cliente (DELETE)
export async function eliminarUsuario(id) {
  try {
    const response = await fetch(`${API_URL}/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Error al eliminar usuario ${id}: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error(`Error en eliminarUsuario (${id}):`, error);
    throw error;
  }
}