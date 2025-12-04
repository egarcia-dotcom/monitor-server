/**
 * ================================================================================
 * APP STATE - Monitor Server
 * ================================================================================
 * 
 * Responsabilidades:
 * - Almacenar estado global de la aplicación frontend
 * - Facilitar comunicación entre módulos (App, Monitor, Historial)
 * 
 * Información relevante:
 * - currentPage: página activa ('monitor' o 'historial')
 * - files: archivos en cola para subir
 * - selectedClient: cliente actualmente seleccionado en Monitor
 * - clients: lista de clientes cargada desde backend
 * - processing: indica si hay una operación en curso
 * - historyPage: página actual del historial
 * 
 * ================================================================================
 */

const AppState = {
    currentPage: 'monitor',   // Página actualmente activa
    files: [],                 // Archivos pendientes de subir
    selectedClient: null,      // Cliente seleccionado en Monitor
    clients: [],               // Lista de clientes cargados desde API
    processing: false,         // Flag de operación en curso (subida/scan/procesado)
    historyPage: 1             // Página actual del historial
};
