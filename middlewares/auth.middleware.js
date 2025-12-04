/**
 * ================================================================================
 * MIDDLEWARE DE AUTENTICACIÓN - Monitor Server
 * ================================================================================
 * 
 * Responsabilidades:
 * - Validar la clave API en requests protegidos
 * - Permitir o bloquear acceso según la validez
 * 
 * Endpoints típicos protegidos:
 * - POST /api/upload
 * - POST /api/process-folder
 * - GET /api/scan-folders
 * - GET /api/history
 * 
 * Cómo ampliar:
 * - Añadir más endpoints protegidos simplemente usando `validateApiKey` en la ruta.
 * - Implementar diferentes niveles de permisos añadiendo un campo `role` o `scope` en la API_KEY.
 * - Para seguridad avanzada: reemplazar API_KEY con JWT o OAuth2.
 * - Registrar intentos fallidos en un logger para auditoría.
 * 
 * ================================================================================
 */

const { API_KEY } = require('../config/constants');

/**
 * Middleware de validación de clave API
 * 
 * Uso:
 * router.post('/upload', validateApiKey, uploadHandler)
 * 
 * Flujo:
 * 1. Lee header "x-api-key"
 * 2. Compara con API_KEY configurada
 * 3. Si coincide: next()
 * 4. Si no coincide: 401 Unauthorized
 */
function validateApiKey(req, res, next) {
    const key = req.header('x-api-key'); // Leer clave del request
    
    if (key !== API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    next(); // Continuar al siguiente middleware o controlador
}

module.exports = { validateApiKey };
