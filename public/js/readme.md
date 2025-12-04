# Monitor Server - Índice de Módulos JS

Resumen rápido de los módulos frontend y sus responsabilidades principales.

---

## `api.js`
- Centraliza llamadas al backend.
- Funciones: `getClients`, `getStatus`, `uploadFiles`, `scanFolders`, `processFolder`, `getHistory`.

## `state.js`
- Estado global del frontend.
- Variables: `currentPage`, `files`, `selectedClient`, `clients`, `processing`, `historyPage`.

## `ui.js`
- Feedback visual y utilidades.
- Funciones: `showOverlay`, `hideOverlay`, `showToast`, `getClientName`.

## `app.js`
- Inicializa la app y gestiona navegación.
- Funciones: `init`, `navigateTo`, `loadClients`.

## `monitor.js`
- Subida de archivos y procesamiento de carpetas.
- Funciones: selección/drag&drop de archivos, validaciones, render lista, subir archivos, escanear/procesar carpetas.

## `historial.js`
- Mostrar historial de procesamiento.
- Funciones: cargar historial con filtros, render tabla, paginación, estadísticas.

---

**Flujo resumido:**  
`app.js` → inicializa todo  
`monitor.js` → subida y procesamiento de archivos  
`historial.js` → historial de procesamiento  
`ui.js` → overlays/toasts  
`api.js` → llamadas al backend  
`state.js` → estado global compartido
