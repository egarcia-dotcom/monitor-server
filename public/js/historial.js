/**
 * ================================================================================
 * HISTORIAL MODULE - Monitor Server
 * ================================================================================
 * 
 * Responsabilidades:
 * - Cargar y mostrar el historial de procesamiento de archivos
 * - Permitir filtrado por fecha y cliente
 * - Manejar paginación y mostrar estadísticas de éxito/errores
 * 
 * Información relevante:
 * - Usa AppState para almacenar página actual del historial
 * - Se conecta con API.getHistory para obtener los datos
 * - Actualiza el DOM de forma dinámica según filtros y resultados
 * 
 * ================================================================================
 */

const Historial = {
    elements: {}, // Cache de elementos del DOM

    /**
     * Inicializa el módulo
     * - Cachea elementos
     * - Configura listeners
     * - Coloca la fecha actual por defecto
     */
    init() {
        this.cacheElements();
        this.setupListeners();
        this.setTodayDate();
    },

    /**
     * Cachea elementos importantes del DOM
     */
    cacheElements() {
        this.elements = {
            historyDate: document.getElementById('history-date'),
            historyClient: document.getElementById('history-client'),
            filterBtn: document.getElementById('filter-btn'),
            historyTbody: document.getElementById('history-tbody'),
            pagination: document.getElementById('pagination'),
            historyStats: document.getElementById('history-stats')
        };
    },

    /**
     * Configura listeners de botones
     * - Filtrado: recarga historial al hacer click
     */
    setupListeners() {
        this.elements.filterBtn.addEventListener('click', () => this.loadHistory());
    },

    /**
     * Establece la fecha de hoy en el input por defecto
     */
    setTodayDate() {
        this.elements.historyDate.value = new Date().toISOString().split('T')[0];
    },

    /**
     * Carga el historial desde la API según filtros de fecha, cliente y página
     * 
     * @param {number} page - Número de página, default 1
     */
    async loadHistory(page = 1) {
        AppState.historyPage = page;

        try {
            const date = this.elements.historyDate.value;
            const client = this.elements.historyClient.value;
            const data = await API.getHistory(date, client, page);
            this.renderHistory(data);
        } catch (err) {
            this.elements.historyTbody.innerHTML = '<tr><td colspan="4" class="text-center">Error cargando datos</td></tr>';
        }
    },

    /**
     * Renderiza la tabla de historial y las estadísticas
     * 
     * @param {object} data - Respuesta de API.getHistory
     */
    renderHistory(data) {
        if (data.entries.length === 0) {
            this.elements.historyTbody.innerHTML = '<tr><td colspan="4" class="text-center">Sin resultados</td></tr>';
            this.elements.pagination.innerHTML = '';
            this.elements.historyStats.innerHTML = '';
            return;
        }

        const html = data.entries.map(entry => {
            const date = new Date(entry.timestamp);
            const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const statusIcon = entry.status === 'success' ? '✓' : '✗';
            const statusClass = entry.status === 'success' ? 'status-success' : 'status-error';

            return `
                <tr>
                    <td>${entry.filename}</td>
                    <td>${UI.getClientName(entry.cliente)}</td>
                    <td class="${statusClass}">${statusIcon}</td>
                    <td>${time}</td>
                </tr>
                ${entry.status === 'error' && entry.errorMessage ? `
                    <tr class="error-detail">
                        <td colspan="4">└─ Error: ${entry.errorMessage}</td>
                    </tr>
                ` : ''}
            `;
        }).join('');

        this.elements.historyTbody.innerHTML = html;
        this.renderPagination(data.pagination);
        
        this.elements.historyStats.innerHTML = `
            Resumen del día:
            <strong>✓ Procesados: ${data.stats.success}</strong> |
            <strong>✗ Errores: ${data.stats.errors}</strong> |
            <strong>Total: ${data.stats.total}</strong>
        `;
    },

    /**
     * Renderiza la paginación
     * 
     * @param {object} pagination - { currentPage, totalPages }
     */
    renderPagination(pagination) {
        if (pagination.totalPages <= 1) {
            this.elements.pagination.innerHTML = '';
            return;
        }

        const { currentPage, totalPages } = pagination;
        let html = '';

        if (currentPage > 1) {
            html += `<button class="page-btn" data-page="${currentPage - 1}">&lt;</button>`;
        }

        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
                const active = i === currentPage ? 'active' : '';
                html += `<button class="page-btn ${active}" data-page="${i}">${i}</button>`;
            } else if (i === currentPage - 3 || i === currentPage + 3) {
                html += `<span class="page-ellipsis">...</span>`;
            }
        }

        if (currentPage < totalPages) {
            html += `<button class="page-btn" data-page="${currentPage + 1}">&gt;</button>`;
        }

        this.elements.pagination.innerHTML = html;

        // Listener para botones de página
        this.elements.pagination.querySelectorAll('.page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.loadHistory(parseInt(btn.dataset.page));
            });
        });
    }
};
