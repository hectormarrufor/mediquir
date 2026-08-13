"use client"
import React, { useEffect, useState } from 'react'
import { useForm } from '@mantine/form';
import { TextInput, PasswordInput, Paper, Title, Container, Button, Group, Image } from '@mantine/core'
import { useRouter } from 'next/navigation';
import { crearUsuario, iniciarSesion } from '../ApiFunctions/userServices';
import { notifications } from '@mantine/notifications';
import defaultUser from '../../objects/defaultUser';
import { useAuth } from '@/hooks/useAuth';
import { pedirPermisoPush } from '../handlers/push';

const page = () => {
  const router = useRouter();
  const [hayAdmin, setHayAdmin] = useState(true);
  const { login, isAuthenticated , user } = useAuth(); // Asegúrate de importar el hook useAuth correctamente
  const form = useForm({
    initialValues: {
      user: '',
      password: '',
    },

    validate: {
      // email: (value) =>
      //   /^\S+@\S+$/.test(value) ? null : 'Correo electrónico inválido',
      password: (value) =>
        value.length < 4 ? 'La contraseña debe tener al menos 4 caracteres' : null,
    },
  });

  useEffect(() => {
    if (isAuthenticated) {
      // Redirección dinámica basada en el rol/perfil
      if (user?.clienteId) {
        router.push('/tienda');
      } else {
        router.push('/superuser');
      }

      notifications.show({
        title: 'Sesión Activa',
        message: 'Ya estás autenticado, redirigiendo...',
        color: 'blue',
      });
    }
  }, [isAuthenticated, user, router]);

  useEffect(() => {
    const fetchAdminUser = async () => {
      try {
        const response = await fetch('/api/users'); // Ajusta la ruta según tu backend
        const users = await response.json();
        const adminUser = users.find(user => user.isAdmin);
        if (adminUser) {
          setHayAdmin(true);
        } else {
          setHayAdmin(false);
        }

      } catch (error) {
        notifications.show({
          title: 'Error buscando admin',
          message: error.message,
          color: 'red',
        });
      }
    };

    fetchAdminUser();
  }, []);

  const handleSubmit = async (values) => {
    try {
      await pedirPermisoPush();
      // Llama a la función centralizada de login. Ella manejará su propia redirección.
      await login(values.user, values.password);

    } catch (error) {
      notifications.show({
        title: 'Error de Autenticación',
        message: error.message,
        color: 'red',
      });
    }
  };

  return (
    <>
      <Container size={420} my={50}   >
        <Title
          align="center"
          pt={150}
          style={{ fontFamily: 'Greycliff CF, sans-serif', fontWeight: 900 }}
        >
          Bienvenido/a
        </Title>

        <Paper shadow="md" p={30} mt={30} radius="md">
          <form onSubmit={form.onSubmit(handleSubmit)}>
            <TextInput
              label="Usuario"
              placeholder="escribe tu usuario"
              required
              autoCapitalize="none"
              {...form.getInputProps('user')}
            />

            <PasswordInput
              label="Contraseña"
              placeholder="Ingresa tu contraseña"
              required
              mt="md"
              {...form.getInputProps('password')}
            />

            <Group position="apart" mt="lg">
              <Button type="submit" fullWidth>
                Iniciar Sesion
              </Button>
              {!hayAdmin && <Button fullWidth onClick={async () => {
                try {
                  await crearUsuario(defaultUser)
                  notifications.show({ title: "usuario creado" })
                  router.push('/');
                } catch (error) {
                  notifications.show({ title: error })
                }
              }}>
                Registrar
              </Button>}
              {/* {isAuthenticated && <Button fullWidth onClick={() => cerrarSesion(router.push, checkAuth)}>
                Close session
              </Button>} */}
            </Group>
          </form>
        </Paper>
      </Container>
    </>
  )
}

export default page