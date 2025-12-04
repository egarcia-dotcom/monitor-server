#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
PROCESADOR DE PDFS - AIR LIQUIDE (GALICIA Y BILBAO)
================================================================================
Descripción:
    Procesa PDFs de Air Liquide detectando líneas horizontales gruesas que
    separan albaranes individuales. Genera un PDF recortado por cada albarán.

Modo de uso:
    - API:   python airliquide.py <folder> <filename> <metadata>
    - Batch: python airliquide.py --watch

Autor: Esteban García
Empresa: Babé y Cía Transportes
Fecha: Noviembre 2025
================================================================================
"""

import os
import sys
import time
import logging
import shutil
import glob

import fitz  # PyMuPDF
import cv2
import numpy as np
from PIL import Image

# ================================================================================
# FIX ENCODING PARA WINDOWS
# ================================================================================

if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ================================================================================
# CONFIGURACIÓN GLOBAL
# ================================================================================

BASE_WORK_DIR = r"H:/BASEDATO/PDF_Conversor/"
IN_DIR_NAME = "entrada"
ERROR_DIR_NAME = "errores"
PROCESADOS_DIR_NAME = "procesados"
LOG_DIR_NAME = "logs"

# Parámetros de procesamiento
DEFAULT_DPI = 150
LINE_MIN_FRAC = 0.5
KERNEL_FRAC = 0.02
MARGIN_THRESH = 0.02
PAD_PIXELS = 6
MIN_LINE_POSITION = 0.25
MAX_LINE_POSITION = 0.75
REINTENTOS_ARCHIVO = 3
ESPERA_ARCHIVO = 2

# Configuración por cliente
CLIENTE_CONFIG = {
    'Galicia': {
        'out_dir': r"H:/BASEDATO/PDF_Conversor/salida", #Desarrollo
        # 'out_dir': r"\\192.168.1.40\dwcloud\AIRLIQUIDE",
        'folder_name': 'airliquide_galicia'
    },
    'Bilbao': {
        'out_dir': r"H:/BASEDATO/PDF_Conversor/salida", #Desarrollo
        # 'out_dir': r"\\192.168.1.40\dwcloud\AIRLIQUIDEBILBAO",
        'folder_name': 'airliquide_bilbao'
    }
}

# ================================================================================
# CONFIGURACIÓN DE LOGGING
# ================================================================================

def setup_logging(cliente):
    """
    Configura el sistema de logging para un cliente específico.
    
    Args:
        cliente: Nombre del cliente (Galicia o Bilbao)
    """
    log_dir = os.path.join(BASE_WORK_DIR, LOG_DIR_NAME, cliente)
    os.makedirs(log_dir, exist_ok=True)
    log_file = os.path.join(log_dir, f"cortar_{cliente.lower()}.log")
    
    # Configurar con encoding UTF-8
    for handler in logging.root.handlers[:]:
        logging.root.removeHandler(handler)
    
    logging.basicConfig(
        filename=log_file,
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        encoding='utf-8',
        force=True
    )
    
    logging.info("=" * 80)
    logging.info(f"SESION INICIADA: {cliente}")
    logging.info("=" * 80)

# ================================================================================
# FUNCIONES AUXILIARES
# ================================================================================

def esperar_archivo(pdf_path, reintentos=REINTENTOS_ARCHIVO, espera=ESPERA_ARCHIVO):
    """
    Espera a que un archivo esté disponible y accesible.
    
    Args:
        pdf_path: Ruta del archivo PDF
        reintentos: Número de intentos de acceso
        espera: Segundos entre intentos
        
    Returns:
        bool: True si el archivo es accesible, False en caso contrario
    """
    logging.info(f"Verificando acceso al archivo: {os.path.basename(pdf_path)}")
    
    for intento in range(1, reintentos + 1):
        if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0:
            try:
                with open(pdf_path, "rb") as f:
                    logging.info(f"OK: Archivo accesible (intento {intento}/{reintentos})")
                    return True
            except (PermissionError, OSError) as e:
                logging.warning(f"Intento {intento}/{reintentos}: Archivo bloqueado - {e}")
        else:
            logging.warning(f"Intento {intento}/{reintentos}: Archivo no existe o esta vacio")
        
        if intento < reintentos:
            time.sleep(espera)
    
    logging.error(f"ERROR: Archivo no accesible tras {reintentos} intentos")
    return False


def render_page_to_image(page, dpi=DEFAULT_DPI):
    """
    Renderiza una página PDF como imagen.
    
    Args:
        page: Página de PyMuPDF
        dpi: Resolución de renderizado
        
    Returns:
        tuple: (imagen PIL, pixmap, zoom)
    """
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
    return img, pix, zoom


def detect_horizontal_lines_refinado(img_pil, line_min_frac=LINE_MIN_FRAC, 
                                    kernel_frac=KERNEL_FRAC, margin_thresh=MARGIN_THRESH):
    """
    Detecta líneas horizontales gruesas en una imagen.
    
    Args:
        img_pil: Imagen PIL
        line_min_frac: Fracción mínima del ancho para considerar línea
        kernel_frac: Fracción del ancho para el kernel morfológico
        margin_thresh: Umbral de margen para validar líneas
        
    Returns:
        list: Lista de posiciones Y de líneas detectadas
    """
    img_gray = np.array(img_pil.convert("L"))
    h, w = img_gray.shape
    
    # Binarización
    _, th = cv2.threshold(img_gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    
    # Detección de líneas horizontales
    kernel_w = max(1, int(w * kernel_frac))
    horiz_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_w, 1))
    horiz = cv2.morphologyEx(th, cv2.MORPH_OPEN, horiz_kernel)
    
    # Encontrar contornos
    contours, _ = cv2.findContours(horiz, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    ys = []
    min_line_len = int(w * line_min_frac)
    max_line_height = max(3, int(0.02 * h))
    
    for cnt in contours:
        x, y, ww, hh = cv2.boundingRect(cnt)
        
        # Validar tamaño de línea
        if ww < min_line_len or hh > max_line_height:
            continue
        
        line_y = y + hh // 2
        
        # Validar posición en la página
        if line_y < int(h * MIN_LINE_POSITION) or line_y > int(h * MAX_LINE_POSITION):
            continue
        
        # Validar márgenes
        band_size = int(h * margin_thresh)
        y_top = max(0, y - band_size)
        y_bot = min(h, y + hh + band_size)
        top_density = np.sum(th[y_top:y, :]) / ((y - y_top) * w * 255 + 1)
        bot_density = np.sum(th[y+hh:y_bot, :]) / ((y_bot - (y+hh)) * w * 255 + 1)
        
        if not (top_density < 0.02 and bot_density < 0.02):
            continue
        
        # Validar que no haya texto cruzando
        roi = th[max(0, y-5):min(h, y+5), x:x+ww]
        vertical_proj = np.sum(roi, axis=0)
        if np.any(vertical_proj > 0.5 * roi.shape[0] * 255):
            continue
        
        ys.append(line_y)
    
    return sorted(set(ys))


def pixel_lines_to_pdf_rects(y_pixels, img_height_px, zoom, pad_px=PAD_PIXELS):
    """
    Convierte líneas en píxeles a rectángulos PDF.
    
    Args:
        y_pixels: Lista de posiciones Y en píxeles
        img_height_px: Altura de la imagen en píxeles
        zoom: Factor de zoom aplicado
        pad_px: Píxeles de padding entre secciones
        
    Returns:
        list: Lista de tuplas (y0, y1) en coordenadas PDF
    """
    boundaries = [0] + y_pixels + [img_height_px]
    rects = []
    
    for i in range(len(boundaries) - 1):
        y0_px = boundaries[i] + (pad_px if i != 0 else 0)
        y1_px = boundaries[i + 1] - (pad_px if (i + 1) != len(boundaries) - 1 else 0)
        
        # Validar altura mínima
        if (y1_px - y0_px) < 20:
            continue
        
        rects.append((y0_px / zoom, y1_px / zoom))
    
    return rects


def detectar_cliente_desde_ruta(pdf_path):
    """
    Detecta el cliente (Galicia o Bilbao) desde la ruta del archivo.
    
    Args:
        pdf_path: Ruta del archivo PDF
        
    Returns:
        str: 'Galicia', 'Bilbao' o None si no se puede determinar
    """
    if "Galicia" in pdf_path or "galicia" in pdf_path.lower():
        return "Galicia"
    elif "Bilbao" in pdf_path or "bilbao" in pdf_path.lower():
        return "Bilbao"
    return None

# ================================================================================
# FUNCIÓN PRINCIPAL DE PROCESAMIENTO
# ================================================================================

def cortar_pdf(pdf_path, dpi=DEFAULT_DPI):
    """
    Procesa un PDF de Air Liquide recortando por líneas horizontales.
    
    Args:
        pdf_path: Ruta del archivo PDF a procesar
        dpi: Resolución de renderizado
        
    Returns:
        bool: True si el procesamiento fue exitoso, False en caso contrario
    """
    # Detectar cliente
    cliente = detectar_cliente_desde_ruta(pdf_path)
    if not cliente:
        print(f"[ERROR] No se puede determinar el cliente desde la ruta: {pdf_path}")
        return False

    setup_logging(cliente)
    
    logging.info("=" * 80)
    logging.info(f"INICIO PROCESAMIENTO: {os.path.basename(pdf_path)}")
    logging.info("=" * 80)
    logging.info(f"Cliente: {cliente}")
    logging.info(f"Archivo: {pdf_path}")

    # Configurar directorios
    in_dir = os.path.join(BASE_WORK_DIR, IN_DIR_NAME, cliente)
    error_dir = os.path.join(BASE_WORK_DIR, ERROR_DIR_NAME, cliente)
    procesados_dir = os.path.join(BASE_WORK_DIR, PROCESADOS_DIR_NAME, cliente)
    out_dir = CLIENTE_CONFIG[cliente]['out_dir']
    
    os.makedirs(error_dir, exist_ok=True)
    os.makedirs(procesados_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)

    fname = os.path.basename(pdf_path)
    base_name = os.path.splitext(fname)[0]
    out_path = os.path.join(out_dir, f"{base_name}_recortado.pdf")

    # Validar acceso al archivo
    if not esperar_archivo(pdf_path):
        logging.error(f"Procesamiento abortado: archivo no accesible")
        print(f"[ERROR] Archivo no accesible: {fname}")
        return False

    # Abrir documentos
    try:
        src_doc = fitz.open(pdf_path)
        out_doc = fitz.open()
        logging.info(f"PDF abierto correctamente: {len(src_doc)} pagina(s)")
    except Exception as e:
        logging.error(f"Error abriendo PDF: {e}")
        print(f"[ERROR] No se puede abrir PDF: {e}")
        return False

    total_pages = len(src_doc)
    total_splits = 0

    # Procesar páginas
    logging.info("Procesando paginas...")
    
    for pno in range(total_pages):
        try:
            logging.info(f"Pagina {pno + 1}/{total_pages}")
            page = src_doc[pno]
            
            # Renderizar y detectar líneas
            img, pix, zoom = render_page_to_image(page, dpi=dpi)
            y_pixels = detect_horizontal_lines_refinado(img)
            
            if not y_pixels:
                # Sin líneas detectadas, copiar página completa
                logging.info("  - Sin lineas detectadas, copiando pagina completa")
                out_doc.insert_pdf(src_doc, from_page=pno, to_page=pno)
            else:
                # Líneas detectadas, recortar
                logging.info(f"  - {len(y_pixels)} linea(s) detectada(s)")
                rects = pixel_lines_to_pdf_rects(y_pixels, pix.height, zoom)
                
                for idx, (y0, y1) in enumerate(rects, 1):
                    rect = fitz.Rect(0, y0, page.rect.width, y1)
                    new_page = out_doc.new_page(width=rect.width, height=rect.height)
                    new_page.show_pdf_page(new_page.rect, src_doc, pno, clip=rect)
                    logging.info(f"  - Recorte #{idx} creado")
                
                total_splits += len(rects)
                
        except Exception as e:
            logging.warning(f"  - Error procesando pagina {pno + 1}: {e}")
            continue

    # Guardar PDF resultante
    try:
        out_doc.save(out_path)
        logging.info(f"OK: PDF guardado exitosamente: {out_path}")
        logging.info(f"Resumen: {total_pages} pagina(s) -> {total_splits} recorte(s)")
        print(f"[OK] {cliente} procesado: {total_pages} pagina(s) -> {total_splits} recorte(s)")
        success = True
    except Exception as e:
        logging.error(f"ERROR: Error guardando PDF: {e}")
        print(f"[ERROR] No se pudo guardar PDF: {e}")
        success = False
    finally:
        out_doc.close()
        src_doc.close()

    # Mover archivo original
    destino_dir = procesados_dir if success else error_dir
    try:
        shutil.move(pdf_path, os.path.join(destino_dir, fname))
        logging.info(f"Archivo movido a: {'PROCESADOS' if success else 'ERRORES'}")
    except Exception as e:
        logging.warning(f"No se pudo mover archivo: {e}")

    return success

# ================================================================================
# MODO BATCH (PROCESAR CARPETA COMPLETA)
# ================================================================================

def procesar_carpeta_batch(cliente):
    """
    Procesa todos los PDFs en la carpeta de entrada de un cliente (modo --watch).
    
    Args:
        cliente: Nombre del cliente (Galicia o Bilbao)
    """
    setup_logging(cliente)
    
    logging.info("=" * 80)
    logging.info(f"MODO BATCH: Procesando carpeta {cliente}")
    logging.info("=" * 80)
    
    in_dir = os.path.join(BASE_WORK_DIR, IN_DIR_NAME, cliente)
    
    # Buscar archivos
    patron = os.path.join(in_dir, "*.pdf")
    archivos_pdf = sorted(glob.glob(patron))
    
    total_archivos = len(archivos_pdf)
    logging.info(f"Archivos encontrados: {total_archivos}")
    
    if total_archivos == 0:
        logging.info("No hay archivos para procesar")
        print(f"[INFO] No hay archivos en la carpeta de {cliente}")
        return

    archivos_exitosos = 0
    archivos_fallidos = 0

    # Procesar cada archivo
    for idx, ruta in enumerate(archivos_pdf, 1):
        nombre_archivo = os.path.basename(ruta)
        logging.info(f"\n[{idx}/{total_archivos}] Procesando: {nombre_archivo}")
        print(f"[{idx}/{total_archivos}] Procesando: {nombre_archivo}")
        
        exito = cortar_pdf(ruta)
        
        if exito:
            archivos_exitosos += 1
        else:
            archivos_fallidos += 1

    # Resumen final
    logging.info("=" * 80)
    logging.info("RESUMEN DE PROCESAMIENTO")
    logging.info("=" * 80)
    logging.info(f"Total archivos: {total_archivos}")
    logging.info(f"Exitosos: {archivos_exitosos}")
    logging.info(f"Fallidos: {archivos_fallidos}")
    logging.info("=" * 80)
    
    print(f"\n[RESUMEN {cliente}]")
    print(f"Total archivos: {total_archivos}")
    print(f"Procesados exitosamente: {archivos_exitosos}")
    print(f"Fallidos: {archivos_fallidos}")


def procesar_todas_carpetas_batch():
    """
    Procesa carpetas de Galicia y Bilbao en modo batch.
    """
    print("[INFO] Procesando Air Liquide Galicia y Bilbao")
    
    for cliente in ['Galicia', 'Bilbao']:
        print(f"\n{'='*80}")
        print(f"Procesando {cliente}")
        print('='*80)
        procesar_carpeta_batch(cliente)

# ================================================================================
# MODO API (PROCESAR ARCHIVO INDIVIDUAL)
# ================================================================================

def procesar_archivo_api(folder_name, filename, metadata):
    """
    Procesa un archivo individual llamado desde la API.
    
    Args:
        folder_name: Nombre de la carpeta (airliquide_galicia o airliquide_bilbao)
        filename: Nombre del archivo
        metadata: JSON string con metadatos
    """
    # Determinar cliente desde folder_name
    if 'galicia' in folder_name.lower():
        cliente = 'Galicia'
    elif 'bilbao' in folder_name.lower():
        cliente = 'Bilbao'
    else:
        print(f"[ERROR] No se puede determinar el cliente desde: {folder_name}")
        sys.exit(1)
    
    setup_logging(cliente)
    
    logging.info("=" * 80)
    logging.info(f"MODO API: Archivo individual")
    logging.info(f"Folder: {folder_name} | File: {filename}")
    logging.info("=" * 80)
    
    in_dir = os.path.join(BASE_WORK_DIR, IN_DIR_NAME, cliente)
    ruta = os.path.join(in_dir, filename)
    
    if not os.path.exists(ruta):
        logging.error(f"Archivo no encontrado: {ruta}")
        print(f"[ERROR] Archivo no encontrado: {ruta}")
        sys.exit(1)
    
    exito = cortar_pdf(ruta)
    sys.exit(0 if exito else 1)

# ================================================================================
# PUNTO DE ENTRADA
# ================================================================================

if __name__ == "__main__":
    if len(sys.argv) == 4:
        # Modo API: folder, filename, metadata
        folder_name = sys.argv[1]
        filename = sys.argv[2]
        metadata = sys.argv[3]
        procesar_archivo_api(folder_name, filename, metadata)
        
    elif len(sys.argv) == 2 and sys.argv[1] == "--watch":
        # Modo batch: procesar carpetas Galicia y Bilbao
        procesar_todas_carpetas_batch()
        
    else:
        # Uso incorrecto
        print("USO:")
        print("  Modo API:   python airliquide.py <folder> <filename> <metadata>")
        print("  Modo Batch: python airliquide.py --watch")
        sys.exit(1)