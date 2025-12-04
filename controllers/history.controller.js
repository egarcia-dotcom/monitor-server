/**
 * ================================================================================
 * CONTROLADOR DE HISTORIAL - Monitor Server
 * ================================================================================
 * 
 * Responsabilidades:
 * - Recuperar historial de procesamiento de archivos
 * - Filtrar por fecha y cliente
 * - Paginar resultados
 * - Calcular estadísticas (éxitos, errores, total)
 * 
 * Historial registra:
 * - Cada archivo procesado (manual o batch)
 * - Estado final (éxito o error)
 * - Mensajes de error detallados
 * - Timestamp y cliente responsable
 * - Método de procesamiento (manual, automatizado, etc.)
 * 
 * ================================================================================
 */

// monitor-server/controllers/history.controller.js
const history = require('../utils/history');
const logger = require('../utils/logger');

/**
 * Recupera el historial de procesamiento con filtros, paginación y estadísticas
 * 
 * Endpoint: GET /api/history
 * 
 * Query Parameters:
 * - date (opcional): filtrar por fecha en formato DD-MM-YYYY (ej: "25-11-2025")
 * - client (opcional): filtrar por cliente (ej: "airliquide_galicia"), "all" para todos
 * - page (opcional): número de página (defecto: 1), 30 resultados por página
 * 
 * Response exitosa:
 * {
 *   "entries": [
 *     {
 *       "filename": "ALBERTO.pdf",
 *       "cliente": "airliquide_galicia",
 *       "status": "success",
 *       "timestamp": "2025-11-25T10:30:44.000Z",
 *       "processedBy": "manual",
 *       "errorMessage": null,
 *       "errorDetail": null
 *     },
 *     ...
 *   ],
 *   "pagination": {
 *     "currentPage": 1,
 *     "totalPages": 5,
 *     "totalEntries": 145
 *   },
 *   "stats": {
 *     "success": 140,
 *     "errors": 5,
 *     "total": 145
 *   }
 * }
 * 
 * Ejemplos de uso:
 * - GET /api/history -> últimas 30 transacciones
 * - GET /api/history?date=25-11-2025 -> transacciones del 25-11-2025
 * - GET /api/history?client=nipongases -> todas de nipongases
 * - GET /api/history?date=25-11-2025&client=airliquide_galicia&page=2 -> combinar filtros
 */
async function getHistory(req, res) {
    try {
        const { date, client, page = 1 } = req.query;
        const perPage = 30; // Resultados por página

        // Obtener todas las entradas del historial
        let entries = await history.getEntries();

        // ────────────────────────────────────────────────────────────────
        // FILTRO 1: Por fecha (opcional)
        // ────────────────────────────────────────────────────────────────
        // Formato esperado: DD-MM-YYYY (ej: "25-11-2025")
        // Se convierte a Date y se compara por día (sin hora)
        if (date) {
            const [day, month, year] = date.split('-');
            const targetDate = new Date(year, month - 1, day);
            entries = entries.filter(e => {
                const entryDate = new Date(e.timestamp);
                return entryDate.toDateString() === targetDate.toDateString();
            });
        }

        // ────────────────────────────────────────────────────────────────
        // FILTRO 2: Por cliente (opcional)
        // ────────────────────────────────────────────────────────────────
        // Si client !== 'all', filtra solo ese cliente
        // Clientes válidos: airliquide_galicia, airliquide_bilbao, airliquide_portugal, nipongases
        if (client && client !== 'all') {
            entries = entries.filter(e => e.cliente === client);
        }

        // ────────────────────────────────────────────────────────────────
        // ORDENAMIENTO: Por fecha descendente (más recientes primero)
        // ────────────────────────────────────────────────────────────────
        entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // ────────────────────────────────────────────────────────────────
        // PAGINACIÓN: Dividir en páginas de 30 resultados
        // ────────────────────────────────────────────────────────────────
        const totalPages = Math.ceil(entries.length / perPage);
        const start = (page - 1) * perPage;
        const paginated = entries.slice(start, start + perPage);

        // ────────────────────────────────────────────────────────────────
        // ESTADÍSTICAS: Contar éxitos y errores en el filtro actual
        // ────────────────────────────────────────────────────────────────
        const success = entries.filter(e => e.status === 'success').length;
        const errors = entries.filter(e => e.status === 'error').length;

        // Retornar respuesta con datos, paginación y estadísticas
        res.json({
            entries: paginated,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalEntries: entries.length
            },
            stats: { success, errors, total: entries.length }
        });
    } catch (err) {
        logger.error(`Error en history: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
}

/**
 * Exporta funciones del controlador
 * 
 * Estas funciones se registran en las rutas:
 * - GET /api/history -> getHistory
 */
module.exports = { getHistory };