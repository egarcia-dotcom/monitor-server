/**
 * ================================================================================
 * MONITOR MODULE - Monitor Server
 * ================================================================================
 * 
 * Responsabilidades:
 * - Gestionar subida de archivos para un cliente
 * - Controlar drag & drop, selección y validación de archivos
 * - Manejar escaneo y procesamiento de carpetas pendientes
 * - Mostrar resultados y estados en el frontend
 * 
 * Información relevante:
 * - Limite de archivos por sesión: 10
 * - Limite de tamaño por archivo: 10MB
 * - Validación por cliente: Portugal solo TXT, resto solo PDF
 * - Actualiza AppState para estado global (cliente seleccionado, archivos, procesamiento)
 * 
 * ================================================================================
 */

const Monitor = {
    elements: {}, // Cache de elementos del DOM

    /** Inicializa el módulo */
    init() {
        this.cacheElements();
        this.setupListeners();
    },

    /** Cachea elementos importantes del DOM */
    cacheElements() {
        this.elements = {
            clientSelect: document.getElementById('client-select'),
            uploadArea: document.getElementById('upload-area'),
            fileInput: document.getElementById('file-input'),
            fileList: document.getElementById('file-list'),
            uploadActions: document.getElementById('upload-actions'),
            processBtn: document.getElementById('process-btn'),
            clearBtn: document.getElementById('clear-btn'),
            scanBtn: document.getElementById('scan-btn'),
            scanResults: document.getElementById('scan-results')
        };
    },

    /** Configura todos los listeners de interacción con el usuario */
    setupListeners() {
        this.elements.clientSelect.addEventListener('change', (e) => this.handleClientChange(e));
        this.elements.uploadArea.addEventListener('click', () => this.openFileDialog());
        this.elements.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.elements.uploadArea.addEventListener('dragleave', () => this.handleDragLeave());
        this.elements.uploadArea.addEventListener('drop', (e) => this.handleDrop(e));
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.elements.processBtn.addEventListener('click', () => this.handleUpload());
        this.elements.clearBtn.addEventListener('click', () => this.clearFiles());
        this.elements.scanBtn.addEventListener('click', () => this.handleScanFolders());
    },

    /** Maneja cambio de cliente */
    handleClientChange(e) {
        AppState.selectedClient = e.target.value;
        this.elements.uploadArea.classList.toggle('disabled', !AppState.selectedClient);
        if (!AppState.selectedClient) this.clearFiles();
    },

    /** Abre el diálogo de selección de archivos */
    openFileDialog() {
        if (AppState.selectedClient) this.elements.fileInput.click();
    },

    /** Drag over: añade clase visual si hay cliente seleccionado */
    handleDragOver(e) {
        e.preventDefault();
        if (AppState.selectedClient) this.elements.uploadArea.classList.add('drag-over');
    },

    /** Quita clase drag-over al salir del área */
    handleDragLeave() {
        this.elements.uploadArea.classList.remove('drag-over');
    },

    /** Maneja archivos arrastrados */
    handleDrop(e) {
        e.preventDefault();
        this.elements.uploadArea.classList.remove('drag-over');
        if (!AppState.selectedClient) return;
        this.addFiles(Array.from(e.dataTransfer.files));
    },

    /** Maneja archivos seleccionados desde input */
    handleFileSelect(e) {
        this.addFiles(Array.from(e.target.files));
        e.target.value = '';
    },

    /** Agrega archivos al AppState validando límites y extensiones */
    addFiles(newFiles) {
        for (const file of newFiles) {
            if (AppState.files.length >= 10) {
                UI.showToast('Máximo 10 archivos por sesión', 'error');
                return;
            }

            const maxSize = 10 * 1024 * 1024; // 10MB
            if (file.size > maxSize) {
                UI.showToast(`${file.name}: Supera el límite de 10MB`, 'error');
                continue;
            }

            const ext = file.name.toLowerCase().split('.').pop();
            if (AppState.selectedClient === 'airliquide_portugal' && ext !== 'txt') {
                UI.showToast('Portugal solo acepta archivos TXT', 'error');
                continue;
            }
            if (AppState.selectedClient !== 'airliquide_portugal' && ext !== 'pdf') {
                UI.showToast('Solo se permiten archivos PDF', 'error');
                continue;
            }

            if (AppState.files.some(f => f.name === file.name)) {
                UI.showToast(`"${file.name}" ya está en la cola`, 'error');
                continue;
            }

            AppState.files.push(file);
        }

        this.renderFileList();
    },

    /** Renderiza la lista de archivos en la UI */
    renderFileList() {
        if (AppState.files.length === 0) {
            this.elements.fileList.innerHTML = '';
            this.elements.uploadActions.style.display = 'none';
            return;
        }

        this.elements.uploadActions.style.display = 'flex';

        const html = AppState.files.map((file, index) => `
            <div class="file-item">
                <div class="file-info">
                    <div>
                        <p class="file-name">${file.name}</p>
                        <p class="file-size">${(file.size / 1024).toFixed(2)} KB</p>
                    </div>
                </div>
                <button class="file-remove" data-index="${index}">✗</button>
            </div>
        `).join('');

        this.elements.fileList.innerHTML = html;

        // Listener para eliminar archivos de la cola
        this.elements.fileList.querySelectorAll('.file-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                AppState.files.splice(parseInt(btn.dataset.index), 1);
                this.renderFileList();
            });
        });
    },

    /** Limpia todos los archivos de la cola */
    clearFiles() {
        AppState.files = [];
        this.renderFileList();
    },

    /** Maneja subida de archivos al backend */
    async handleUpload() {
        if (AppState.files.length === 0 || AppState.processing) return;

        UI.showOverlay(`Subiendo ${AppState.files.length} archivo(s)...`);
        AppState.processing = true;

        try {
            const formData = new FormData();
            formData.append('client', AppState.selectedClient);
            AppState.files.forEach(file => formData.append('files', file));

            const data = await API.uploadFiles(formData);

            UI.hideOverlay();
            AppState.processing = false;

            const success = data.results.filter(r => r.status === 'queued').length;
            const errors = data.results.filter(r => r.status === 'error').length;

            if (success > 0) UI.showToast(`✓ ${success} archivo(s) procesado(s) correctamente`, 'success');
            if (errors > 0) UI.showToast(`⚠ ${errors} archivo(s) con errores`, 'error');

            this.clearFiles();
        } catch (err) {
            UI.hideOverlay();
            AppState.processing = false;
        }
    },

    /** Maneja escaneo de carpetas pendientes */
    async handleScanFolders() {
        if (AppState.processing) return;

        UI.showOverlay('Escaneando carpetas...');
        AppState.processing = true;

        try {
            const data = await API.scanFolders();
            UI.hideOverlay();
            AppState.processing = false;

            this.renderScanResults(data.folders);
        } catch (err) {
            UI.hideOverlay();
            AppState.processing = false;
        }
    },

    /** Renderiza resultados del escaneo y permite procesar carpetas */
    renderScanResults(folders) {
        // ────────────────────────────────────────────────────────────────
        // CASO 1: No hay archivos pendientes
        // ────────────────────────────────────────────────────────────────
        if (!folders || folders.length === 0) {
            this.elements.scanResults.innerHTML = `
                <div class="scan-folders">
                    <div style="text-align: center; padding: 2rem; color: #6B7280;">
                        <svg style="width: 4rem; height: 4rem; margin: 0 auto 1rem; color: #9CA3AF;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p style="font-size: 1rem; font-weight: 600; color: #374151; margin-bottom: 0.5rem;">
                            ✓ Sin archivos pendientes
                        </p>
                        <p style="font-size: 0.875rem; color: #6B7280;">
                            Todas las carpetas están vacías o procesadas
                        </p>
                    </div>
                </div>
            `;
            return;
        }

        // ────────────────────────────────────────────────────────────────
        // CASO 2: Hay archivos pendientes - Renderizar resultados
        // ────────────────────────────────────────────────────────────────
        
        // Mapeo de nombres de clientes (por si UI.getClientName falla)
        const clientNames = {
            'airliquide_galicia': 'Air Liquide Galicia',
            'airliquide_bilbao': 'Air Liquide Bilbao',
            'airliquide_portugal': 'Air Liquide Portugal',
            'nipongases': 'Nipongases'
        };
        
        const getClientName = (client) => {
            // Intentar usar UI.getClientName si existe
            if (typeof UI !== 'undefined' && UI.getClientName) {
                return UI.getClientName(client);
            }
            // Fallback al mapeo local
            return clientNames[client] || client;
        };
        
        const html = `
            <div class="scan-folders">
                <h3 class="scan-title">📁 ARCHIVOS PENDIENTES DETECTADOS</h3>
                
                ${folders.map(folder => `
                    <div class="folder-item">
                        <span class="folder-name">${getClientName(folder.client)}</span>
                        <span class="folder-count">${folder.count} archivo(s)</span>
                    </div>
                `).join('')}
                
                <div class="form-group" style="margin-top: 1rem;">
                    <label for="folder-select">Selecciona carpeta a procesar:</label>
                    <select id="folder-select" class="select">
                        ${folders.map(f => `
                            <option value="${f.client}">${getClientName(f.client)}</option>
                        `).join('')}
                    </select>
                </div>
                
                <div class="button-group" style="margin-top: 1rem;">
                    <button id="process-folder-btn" class="btn btn-primary">PROCESAR CARPETA</button>
                    <button id="cancel-scan-btn" class="btn btn-secondary">CANCELAR</button>
                </div>
            </div>
        `;

        this.elements.scanResults.innerHTML = html;

        // ────────────────────────────────────────────────────────────────
        // LISTENERS: Botones de acción
        // ────────────────────────────────────────────────────────────────
        const processBtn = document.getElementById('process-folder-btn');
        const cancelBtn = document.getElementById('cancel-scan-btn');
        
        if (processBtn) {
            processBtn.addEventListener('click', () => this.handleProcessFolder());
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.elements.scanResults.innerHTML = '';
            });
        }
    },

    /** Procesa carpeta seleccionada usando el backend */
    async handleProcessFolder() {
        const folderSelect = document.getElementById('folder-select');
        if (!folderSelect) return;
        
        const client = folderSelect.value;
        if (!client || AppState.processing) return;

        UI.showOverlay('Procesando carpeta...');
        AppState.processing = true;

        try {
            await API.processFolder(client);
            UI.hideOverlay();
            AppState.processing = false;
            UI.showToast('✓ Carpeta procesada correctamente', 'success');
            this.elements.scanResults.innerHTML = '';
        } catch (err) {
            UI.hideOverlay();
            AppState.processing = false;
        }
    }
};