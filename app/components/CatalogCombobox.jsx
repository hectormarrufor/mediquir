// components/AsyncCatalogComboBox.jsx
import { useState } from "react";
import { Combobox, TextInput, useCombobox, Loader } from "@mantine/core";
import { useCatalogOptions } from "@/hooks/useCatalogOptions";
import axios from "axios";
import { capitalizeUnlessUppercase } from "../handlers/capitalizeUnlessUppercase";
import { CatalogCreatorModal } from "./CatalogCreatorModal";

export function AsyncCatalogComboBox({
  disabled = false,
  label,
  placeholder,
  fieldKey,   // Ruta tipo string: "itemsSerializados.0.historialRecauchado.0.tallerNombre"
  idFieldKey,
  form,
  tipo = "",
  catalogo
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingCreateValue, setPendingCreateValue] = useState("");

  const store = useCombobox({
    onDropdownClose: () => store.resetSelectedOption()
  });

  const { options, loading, setOptions } = useCatalogOptions(catalogo, tipo);

  const handleCreateNew = async (payload) => {
    try {
      const body = typeof payload === 'object' 
        ? { ...payload, tipo } 
        : { valor: payload, tipo };

      const res = await axios.post(`/api/inventario/catalogo/${catalogo}`, body);
      const nuevo = res.data.data;

      setOptions(prev => {
        const exists = prev.some(opt => opt.nombre === nuevo.nombre);
        return exists ? prev : [...prev, nuevo];
      });

      form.setFieldValue(fieldKey, nuevo.nombre);
      if (idFieldKey) form.setFieldValue(idFieldKey, nuevo.id);

    } catch (err) {
      console.error("Error creando nuevo valor", err);
    }
  };

  const query = (form.getInputProps(fieldKey).value || "").toLowerCase();

  const filteredOptions = options
    .filter(opt => (opt?.nombre ?? "").toLowerCase().includes(query))
    .reduce((acc, curr) => {
      if (!acc.some(o => o.nombre === curr.nombre)) acc.push(curr);
      return acc;
    }, []);

  const mappedOptions = filteredOptions.map((opt, index) => (
    <Combobox.Option value={opt.nombre || opt.medida} key={`${opt.nombre}-${index}`}>
      {opt.nombre || opt.medida}
    </Combobox.Option>
  ));

  return (
    <>
      <Combobox
        store={store}
        onOptionSubmit={(val) => {
          if (val.startsWith("+")) {
            const rawValue = val.replace('+ Añadir "', '').replace('"', '');
            if (catalogo === 'talleres') {
              setPendingCreateValue(rawValue);
              setModalOpen(true);
            } else {
              form.setFieldValue(fieldKey, rawValue);
              handleCreateNew(rawValue);
            }
          } else {
            form.setFieldValue(fieldKey, val);
            if (idFieldKey) {
                const selectedObj = options.find(o => (o.nombre || o.medida) === val);
                if (selectedObj) {
                    form.setFieldValue(idFieldKey, selectedObj.id);
                }
            }
          }
          store.closeDropdown();
        }}
      >
        <Combobox.Target>
          <TextInput
            disabled={disabled}
            label={label}
            placeholder={placeholder}
            
            /* --- CORRECCIÓN AQUÍ --- */
            /* Usamos getInputProps para que Mantine resuelva la ruta anidada por nosotros */
            value={form.getInputProps(fieldKey).value || ""} 
            
            rightSection={loading ? <Loader size="xs" /> : null}
            onChange={(e) => {
              let v = capitalizeUnlessUppercase(e.currentTarget.value);
              // setFieldValue sí acepta la ruta string sin problemas
              form.setFieldValue(fieldKey, v);
              
              if (idFieldKey) form.setFieldValue(idFieldKey, null); 
              
              store.openDropdown();
              store.updateSelectedOptionIndex("active");
            }}
            onClick={() => store.openDropdown()}
            onFocus={() => store.openDropdown()}
            onBlur={() => store.closeDropdown()}
          />
        </Combobox.Target>

        <Combobox.Dropdown>
          <Combobox.Options>
            {loading ? <Combobox.Option value="loading" disabled>Cargando...</Combobox.Option> : (
              <>
                {mappedOptions}
                {/* Usamos getInputProps aquí también para la lógica de "Añadir nuevo" */}
                {(form.getInputProps(fieldKey).value || "").length > 0 && 
                 !filteredOptions.some(o => o.nombre.toLowerCase() === (form.getInputProps(fieldKey).value || "").toLowerCase()) && (
                  <Combobox.Option value={`+ Añadir "${form.getInputProps(fieldKey).value}"`}>
                    {`+ Añadir "${form.getInputProps(fieldKey).value}"`}
                  </Combobox.Option>
                )}
              </>
            )}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>

      <CatalogCreatorModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        initialValue={pendingCreateValue}
        catalogo={catalogo}
        onConfirm={(values) => handleCreateNew(values)}
      />
    </>
  );
}