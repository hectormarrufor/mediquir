"use client"
import React, { useEffect, useState } from 'react'
import { useForm } from '@mantine/form';
import { TextInput, PasswordInput, Paper, Text, Button, Group } from '@mantine/core'
import estilos from './login.module.css';
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
        router.push('/b2b');
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
        const response = await fetch('/api/users/hay-admin');
        const { hayAdmin: existeAdmin } = await response.json();
        if (existeAdmin) {
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
    <div className={estilos.escena}>
      {/* El mismo video de la portada, a pantalla completa, con un velo navy para que el formulario se lea */}
      <video className={estilos.video} autoPlay muted loop playsInline preload="metadata" poster="/tenants/mediquir/hero-1-lg.jpg" aria-hidden="true">
        <source src="/tenants/mediquir/hero-video.mp4" type="video/mp4" />
      </video>
      <div className={estilos.velo} />

      <div className={estilos.caja}>
        <Text className={estilos.rotulo}>Acceso al sistema</Text>
        <div role="heading" aria-level={1} className={estilos.titulo}>Bienvenido/a</div>

        <Paper variant="oscura" p={28} mt="lg" radius="lg">
          <form onSubmit={form.onSubmit(handleSubmit)}>
            <TextInput
              label="Usuario"
              placeholder="escribe tu usuario"
              required
              size="md"
              autoCapitalize="none"
              {...form.getInputProps('user')}
            />

            <PasswordInput
              label="Contraseña"
              placeholder="Ingresa tu contraseña"
              required
              mt="md"
              size="md"
              {...form.getInputProps('password')}
            />

            <Group mt="xl">
              <Button type="submit" fullWidth size="md">
                Iniciar Sesion
              </Button>
              {!hayAdmin && <Button fullWidth size="md" onClick={async () => {
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
            </Group>
          </form>
        </Paper>
      </div>
    </div>
  )
}

export default page