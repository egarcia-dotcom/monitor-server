/**
 * ================================================================================
 * RUTAS WEB/API - Monitor Server
 * ================================================================================
 * 
 * Responsabilidades:
 * - Proveer endpoints consumidos por el frontend
 * - Gestionar subida de archivos, procesamiento de carpetas y historial
 * - Devolver datos de clientes y estado del servidor
 * 
 * Endpoints principales:
 * 1. GET /api/clients
 *    - Devuelve lista de clientes configurados (para dropdowns)
 * 2. GET /api/status
 *    - Estado del servidor: activo, uptime, tamaño de cola
 * 3. POST /api/upload
 *    - Subida manual de archivos (multipart/form-data)
 *    - Campos: client (string), files (array)
 * 4. POST /api/scan-folders
 *    - Escanea todas las carpetas pendientes de procesamiento
 *    - Devuelve listado de clientes y archivos pendientes
 * 5. POST /api/process-folder
 *    - Procesa todos los archivos de una carpeta específica
 *    - Body: { client }
 * 6. GET /api/history
 *    - Devuelve historial de procesamiento
 *    - Query params: date (DD-MM-YYYY), client, page
 * 
 * Cómo ampliar:
 * - Agregar nuevos endpoints siguiendo la misma estructura
 * - Añadir validaciones y middlewares adicionales según sea necesario
 * - Integrar nuevos controladores para lógica de negocio específica
 * 
 * ================================================================================
 */

const express = require('express');
const uploadController = require('../controllers/upload.controller');
const folderController = require('../controllers/folder.controller');
const historyController = require('../controllers/history.controller');

const router = express.Router();

// GET /api/clients - Lista de clientes
router.get('/clients', (req, res) => {
    const SCRIPTS_MAP = require('../config/scripts-map.json');
    const clients = Object.keys(SCRIPTS_MAP).map(key => ({
        id: key,
        name: key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    }));
    res.json({ clients });
});

// GET /api/status - Estado del servidor
router.get('/status', (req, res) => {
    res.json({
        status: 'active',
        uptime: Math.floor(process.uptime()),
        queueSize: 0
    });
});

// POST /api/upload - Subida manual
router.post('/upload', uploadController.upload, uploadController.processUpload);

// POST /api/scan-folders - Escaneo de carpetas
router.post('/scan-folders', folderController.scanFolders);

// POST /api/process-folder - Procesar carpeta completa
router.post('/process-folder', folderController.processFolder);

// GET /api/history - Historial con filtros
router.get('/history', historyController.getHistory);

module.exports = router;
