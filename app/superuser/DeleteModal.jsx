import { Modal , Text , Button } from '@mantine/core'
import React from 'react'

const DeleteModal = ({ opened, onClose, onConfirm, object }) => {
  return (
    <Modal opened={opened} centered onClose={onClose} title="Confirmar eliminación">
      <Text>Are you sure you want to delete {object}?</Text>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <Button variant="outline" color="gray" onClick={onClose}>
          Cancelar
        </Button>
        <Button color="red" onClick={onConfirm} style={{ marginLeft: 8 }}>
          Delete
        </Button>
      </div>
    </Modal>
  )
}

export default DeleteModal