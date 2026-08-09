"use client";
import React, { use } from 'react';
import SalidaForm from "../../SalidasForm";




export default function EditarSalidaPage({ params }) {
  const { id } = use(params);
  return <SalidaForm salidaId={id} />;
}