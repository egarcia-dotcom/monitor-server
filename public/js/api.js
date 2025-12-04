/**
 * ================================================================================
 * API UTILS - Monitor Server
 * ================================================================================
 * 
 * Responsabilidades:
 * - Centralizar llamadas al backend (API REST)
 * - Manejar errores y notificar al usuario
 * - Facilitar consumo de endpoints: clientes, estado, historial y procesamiento
 * 
 * Información relevante:
 * - Los errores se muestran mediante UI.showToast
 * - Permite enviar GET y POST con JSON o FormData
 * 
 * ================================================================================
 */

const API = {
    /**
     * Llama a cualquier endpoint del backend y maneja errores
     * 
     * @param {string} endpoint - URL del endpoint
     * @param {object} options - Opciones de fetch (method, headers, body)
     * @returns {Promise<object>} Respuesta JSON del backend
     */
    async call(endpoint, options = {}) {
        try {
            const response = await fetch(endpoint, options);
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Error en la petición');
            }
            return await response.json();
        } catch (err) {
            UI.showToast(err.message, 'error');
            throw err;
        }
    },

    /** Obtiene la lista de clientes */
    getClients: () => API.call('/api/clients'),

    /** Obtiene el estado general del sistema */
    getStatus: () => API.call('/api/status'),

    /** Sube archivos al servidor */
    uploadFiles: (formData) => API.call('/api/upload', { method: 'POST', body: formData }),

    /** Inicia un escaneo de carpetas */
    scanFolders: () => API.call('/api/scan-folders', { method: 'POST' }),

    /** Procesa la carpeta de un cliente específico */
    processFolder: (client) => API.call('/api/process-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client })
    }),

    /**
     * Obtiene historial de procesamiento
     * 
     * @param {string} date - Fecha en formato YYYY-MM-DD
     * @param {string} client - Cliente a filtrar ("all" para todos)
     * @param {number} page - Número de página
     */
    getHistory: (date, client, page) => {
        const [year, month, day] = date.split('-');
        const formattedDate = `${day}-${month}-${year}`;
        return API.call(`/api/history?date=${formattedDate}&client=${client}&page=${page}`);
    }
};
