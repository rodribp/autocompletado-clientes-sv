// SPDX-License-Identifier: MIT
//
// Todos los textos visibles, en un solo sitio. No es un sistema de traducción:
// la extensión es solo para El Salvador y solo en español. Centralizarlos
// evita cadenas sueltas por el código y hace trivial revisar el tono.

export const T = {
  // Cabecera y estados de la página
  titulo: 'Clientes',
  offSite: 'Abre admin.factura.gob.sv para poder rellenar un documento.',
  wrongPage: 'Estás en el portal, pero no en una Factura (CF) ni en un Crédito Fiscal (CCF).',
  noContentScript: 'No se pudo conectar con la página. Recárgala e inténtalo de nuevo.',
  reintentar: 'Reintentar',

  // Lista
  buscar: 'Buscar por nombre, NIT o NRC',
  nuevo: 'Nuevo cliente',
  guardarActual: 'Guardar cliente actual',
  guardarActualAyuda: 'Lee el receptor que está en pantalla y lo guarda como cliente nuevo.',
  sinClientes: 'Todavía no tienes clientes. Crea uno, o abre un documento y usa «Guardar cliente actual».',
  sinResultados: 'Ningún cliente coincide con la búsqueda.',
  rellenar: 'Rellenar',
  editar: 'Editar',
  eliminar: 'Eliminar',
  cancelar: 'Cancelar',
  confirmarEliminar: (nombre: string) => `¿Eliminar a ${nombre}?`,
  noAptoCcf: 'No apto para CCF',

  // Formulario
  nuevoCliente: 'Nuevo cliente',
  editarCliente: 'Editar cliente',
  guardar: 'Guardar',
  volver: 'Volver',
  campoNombre: 'Nombre o razón social',
  campoNombreComercial: 'Nombre comercial',
  campoTipoDocumento: 'Tipo de documento',
  campoNumeroDocumento: 'Número de documento',
  campoNrc: 'NRC',
  campoActividadCodigo: 'Código de actividad económica',
  campoActividadDescripcion: 'Descripción de la actividad',
  campoDepartamento: 'Departamento',
  campoMunicipio: 'Municipio',
  campoDistrito: 'Distrito',
  campoComplemento: 'Complemento de dirección',
  campoCorreo: 'Correo electrónico',
  campoTelefono: 'Teléfono',
  campoNotas: 'Notas',
  seleccione: '-- Seleccione --',
  municipioSinCatalogo: 'Aún no conocemos los municipios de este departamento. Rellena un documento una vez y se aprenderán solos.',
  codigoManual: 'Escribir código manualmente',

  // Respaldos
  exportar: 'Exportar respaldo (JSON)',
  importar: 'Importar respaldo (JSON)',
  diagnostico: 'Diagnóstico',
  importadoOk: (r: { importados: number; actualizados: number; omitidos: number }) =>
    `Importados ${r.importados}, actualizados ${r.actualizados}` +
    (r.omitidos > 0 ? `, omitidos ${r.omitidos} por estar incompletos.` : '.'),

  // Resultado del relleno
  rellenadoOk: (n: number) => `Receptor rellenado (${n} ${n === 1 ? 'campo' : 'campos'}).`,
  rellenadoParcial: (ok: number, faltan: number) =>
    `Rellenado parcial: ${ok} ${ok === 1 ? 'campo' : 'campos'}, ${faltan} sin completar.`,
  verDetalle: 'Ver qué faltó',
  copiar: 'Copiar',
  copiado: 'Copiado',
  guardadoOk: 'Cliente guardado.',
  eliminadoOk: 'Cliente eliminado.',
} as const;

/** Mensaje legible para cada motivo por el que un campo no se pudo rellenar. */
export const MOTIVOS: Record<string, string> = {
  CONTROL_NOT_FOUND: 'El campo no existe en este formulario.',
  OPTION_NOT_FOUND: 'La opción guardada ya no está en la lista. Selecciónala a mano.',
  TIMEOUT_CASCADE: 'El portal no cargó las opciones a tiempo. Vuelve a intentarlo.',
  PARENT_FAILED: 'No se pudo porque falló el campo del que depende.',
  NGSELECT_NO_MATCH: 'No se encontró la actividad económica en la lista del portal.',
  NGSELECT_DISABLED: 'El selector de actividad económica está deshabilitado.',
  DOC_FIELD_NOT_RENDERED: 'El campo de número de documento no apareció. Cópialo y pégalo a mano.',
  VALUE_MISMATCH: 'El portal rechazó el valor. Revísalo a mano.',
  EMPTY_VALUE: 'Sin dato guardado.',
  NOT_ELIGIBLE_CCF: 'Este cliente no tiene NIT ni DUI, así que no puede recibir crédito fiscal.',
  EXCEPTION: 'Ocurrió un error inesperado en este campo.',
};

/** Errores de nivel superior, cuando ni siquiera se pudo empezar. */
export const ERRORES: Record<string, string> = {
  PAGE_NOT_SUPPORTED: T.wrongPage,
  PAGE_NOT_READY: 'La página todavía no terminó de cargar. Espera un momento y reintenta.',
  RECEPTOR_ROOT_MISSING: 'No se encontró la sección Receptor en esta página.',
  NO_TAB: 'No hay ninguna pestaña activa.',
  TIMEOUT: 'La página no respondió a tiempo.',
  UNKNOWN: 'Ocurrió un error inesperado.',
};
