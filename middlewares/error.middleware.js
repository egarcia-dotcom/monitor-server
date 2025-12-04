/**
 * ================================================================================
 * MIDDLEWARE DE ERRORES - Monitor Server
 * ================================================================================
 * 
 * Responsabilidades:
 * - Captura errores no manejados en controladores o middlewares
 * - Registra errores en logs
 * - Responde al cliente con JSON sin exponer detalles internos
 * 
 * Uso:
 * - Siempre al final de la cadena de middlewares en Express:
 *   app.use(errorHandler);
 * - Captura errores lanzados con `throw` o `next(err)`
 * 
 * Cómo ampliar:
 * - Diferenciar tipos de error (validation, auth, db) y devolver códigos HTTP distintos
 * - Enviar notificaciones o alertas a devs cuando se produzcan errores críticos
 * - Sanitizar mensajes según entorno (dev vs prod)
 * - Integrar con servicios de monitorización (Sentry, LogRocket, etc.)
 * 
 * ================================================================================
 */

const logger = require('../utils/logger');

/**
 * Middleware de manejo de errores de Express
 * @param {Error} err - Objeto Error
 * @param {Object} req - Request de Express
 * @param {Object} res - Response de Express
 * @param {Function} next - Callback siguiente middleware (opcional aquí)
 */
function errorHandler(err, req, res, next) {
    // Registrar error con stack trace para debugging
    logger.error(`Error no manejado: ${err.message}`, { stack: err.stack });

    // Responder al cliente con JSON (sin exponer stack)
    res.status(err.status || 500).json({
        error: err.message || 'Error interno del servidor'
    });

    // Este middleware es final de la cadena, no se llama next()
}

module.exports = { errorHandler };
