/**
 * ================================================================================
 * UI MODULE - Monitor Server
 * ================================================================================
 * 
 * Responsabilidades:
 * - Gestionar overlay de procesamiento
 * - Mostrar notificaciones tipo toast
 * - Resolver nombres de clientes a partir de su ID
 * 
 * Información relevante:
 * - Overlay se activa/desactiva con showOverlay/hideOverlay
 * - Toasts duran 3 segundos y admiten tipos: info, success, error
 * - getClientName busca el cliente en AppState.clients, si no existe devuelve el ID
 * 
 * ================================================================================
 */

const UI = {
    elements: {}, // Cache de elementos del DOM

    /** Cachea elementos importantes del DOM para overlay y notificaciones */
    cache() {
        this.elements = {
            overlay: document.getElementById('processing-overlay'),
            overlayMessage: document.getElementById('overlay-message'),
            toast: document.getElementById('toast')
        };
    },

    /**
     * Muestra overlay de procesamiento con mensaje
     * @param {string} message - Mensaje a mostrar
     */
    showOverlay(message) {
        this.elements.overlayMessage.textContent = message;
        this.elements.overlay.classList.add('active');
    },

    /** Oculta overlay de procesamiento */
    hideOverlay() {
        this.elements.overlay.classList.remove('active');
    },

    /**
     * Muestra notificación tipo toast
     * @param {string} message - Mensaje a mostrar
     * @param {string} type - Tipo de toast: 'info', 'success', 'error' (default: 'info')
     */
    showToast(message, type = 'info') {
        this.elements.toast.textContent = message;
        this.elements.toast.className = `toast toast-${type} active`;
        setTimeout(() => this.elements.toast.classList.remove('active'), 3000);
    },

    /**
     * Obtiene el nombre de un cliente a partir de su ID
     * @param {string} clientId
     * @returns {string} Nombre del cliente o ID si no se encuentra
     */
    getClientName(clientId) {
        const client = AppState.clients.find(c => c.id === clientId);
        return client ? client.name : clientId;
    }
};
