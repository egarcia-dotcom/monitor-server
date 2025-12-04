/**
 * ================================================================================
 * ROUTER PRINCIPAL - Monitor Server
 * ================================================================================
 * 
 * Responsabilidades:
 * - Punto de entrada de todas las rutas del servidor
 * - Agrupa rutas de la interfaz web y de automatización
 * - Proporciona endpoint de health check
 * 
 * Rutas principales:
 * 1. GET /health
 *    - Verifica que el servidor está activo
 *    - Retorna status, uptime y timestamp
 * 2. /api -> web.routes.js
 *    - Endpoints para frontend: clients, status, upload, scan, process, history
 * 3. / -> automation.routes.js
 *    - Endpoints para Power Automate
 * 
 * Cómo ampliar:
 * - Agregar nuevos routers y montarlos con router.use('/ruta', nuevoRouter)
 * - Mantener health check siempre accesible
 * 
 * ================================================================================
 */

const express = require('express');
const router = express.Router();
const webRoutes = require('./web.routes');
const automationRoutes = require('./automation.routes');

// Health check
router.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Rutas del frontend
router.use('/api', webRoutes);

// Rutas de Power Automate
router.use('/', automationRoutes);

module.exports = router;
