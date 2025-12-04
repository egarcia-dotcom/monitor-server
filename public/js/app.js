/**
 * ================================================================================
 * APP CONTROLLER - Monitor Server
 * ================================================================================
 * 
 * Responsabilidades:
 * - Inicializar la aplicación en el frontend
 * - Gestionar navegación entre páginas (Monitor / Historial)
 * - Cargar y mostrar clientes en selects
 * - Conectar los módulos UI, Monitor e Historial
 * 
 * Información relevante:
 * - Utiliza AppState para guardar estado global (página actual, clientes)
 * - Inicialización automática al cargar DOMContentLoaded
 * 
 * ================================================================================
 */

const App = {
    elements: {}, // Cache de elementos del DOM para evitar queries repetidas

    /**
     * Inicializa la aplicación
     * - Cachea elementos del DOM
     * - Configura la navegación entre pestañas
     * - Carga clientes desde el backend
     * - Inicializa módulos UI, Monitor e Historial
     */
    async init() {
        this.cacheElements();
        this.setupNavigation();
        await this.loadClients();
        
        UI.cache();
        Monitor.init();
        Historial.init();
    },

    /**
     * Cachea elementos importantes del DOM para acceso rápido
     */
    cacheElements() {
        this.elements = {
            navTabs: document.querySelectorAll('.nav-tab'),
            pages: document.querySelectorAll('.page'),
            footerLocation: document.getElementById('footer-location'),
            clientSelect: document.getElementById('client-select'),
            historyClient: document.getElementById('history-client')
        };
    },

    /**
     * Configura la navegación entre páginas
     * - Cada tab dispara navigateTo con su data-page
     */
    setupNavigation() {
        this.elements.navTabs.forEach(tab => {
            tab.addEventListener('click', () => this.navigateTo(tab.dataset.page));
        });
    },

    /**
     * Navega a la página indicada
     * - Actualiza AppState.currentPage
     * - Activa/desactiva tabs y páginas
     * - Actualiza el footer
     * - Si es historial, carga datos de historial
     * 
     * @param {string} page - "monitor" o "historial"
     */
    navigateTo(page) {
        AppState.currentPage = page;

        this.elements.navTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.page === page);
        });

        this.elements.pages.forEach(p => {
            p.classList.toggle('active', p.id === `page-${page}`);
        });

        this.elements.footerLocation.textContent = page === 'monitor' 
            ? 'Monitor de PDFs' 
            : 'Historial de Procesamiento';

        if (page === 'historial') {
            Historial.loadHistory();
        }
    },

    /**
     * Carga clientes desde el backend y los muestra en los selects de Monitor e Historial
     */
    async loadClients() {
        try {
            const data = await API.getClients();
            AppState.clients = data.clients;

            // ────────────────────────────────────────────────────────────────
            // POBLAR SELECT MONITOR
            // ────────────────────────────────────────────────────────────────
            this.elements.clientSelect.innerHTML = '<option value="">Seleccionar cliente...</option>';
            data.clients.forEach(client => {
                const option = document.createElement('option');
                option.value = client.id;
                option.textContent = client.name;
                this.elements.clientSelect.appendChild(option);
            });

            // ────────────────────────────────────────────────────────────────
            // POBLAR SELECT HISTORIAL
            // ────────────────────────────────────────────────────────────────
            this.elements.historyClient.innerHTML = '<option value="all">Todos</option>';
            data.clients.forEach(client => {
                const option = document.createElement('option');
                option.value = client.id;
                option.textContent = client.name;
                this.elements.historyClient.appendChild(option);
            });
        } catch (err) {
            console.error('Error cargando clientes:', err);
        }
    }
};

// Inicializa App cuando el DOM esté cargado
document.addEventListener('DOMContentLoaded', () => App.init());
