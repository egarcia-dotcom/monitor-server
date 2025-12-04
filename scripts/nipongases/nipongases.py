#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
PROCESADOR DE PDFS - NIPONGASES
================================================================================
Descripción:
    Recorta PDFs de Nipongases detectando códigos de barras y generando
    albaranes individuales por cada código encontrado.

Modo de uso:
    - API:   python nipongases.py <folder> <filename> <metadata>
    - Batch: python nipongases.py --watch

Autor: Esteban García
Empresa: Babé y Cía Transportes
Fecha: Noviembre 2025
================================================================================
"""

import os
import sys
import io
import glob
import logging
import shutil
import time

import fitz
from PIL import Image
import numpy as np
import cv2

# ================================================================================
# CONFIGURACIÓN GLOBAL
# ================================================================================

BASE_WORK_DIR = r"H:/BASEDATO/PDF_Conversor/"
IN_DIR_NAME = "entrada"
PROCESADOS_DIR_NAME = "procesados"
ERROR_DIR_NAME = "errores"
LOG_DIR_NAME = "logs"
CLIENTE = "NIPONGASES"
OUT_DIR = r"H:/BASEDATO/PDF_Conversor/salida"
# OUT_DIR = r"\\192.168.1.40\dwcloud\NIPONGASES"

# Parámetros de procesamiento
DEFAULT_DPI = 200
DEFAULT_SCALE = 2.0
MARGEN_SUPERIOR_BARCODE = 300
MARGEN_INFERIOR_BARCODE = 300
REINTENTOS_ARCHIVO = 3
ESPERA_ARCHIVO = 2

# ================================================================================
# CONFIGURACIÓN DE LOGGING
# ================================================================================

log_dir = os.path.join(BASE_WORK_DIR, LOG_DIR_NAME, CLIENTE)
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, f"cortar_{CLIENTE.lower()}.log")

logging.basicConfig(
    filename=log_file,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    force=True
)
logger = logging.getLogger("nipongases_processor")

# ================================================================================
# VALIDACIÓN DE DEPENDENCIAS
# ================================================================================

try:
    from pyzbar.pyzbar import decode as zbar_decode
except ImportError:
    logger.error("DEPENDENCIA FALTANTE: pyzbar no está instalado")
    print("[ERROR] pyzbar no instalado. Ejecuta: pip install pyzbar")
    sys.exit(1)

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
    logger.info(f"Verificando acceso al archivo: {os.path.basename(pdf_path)}")
    
    for intento in range(1, reintentos + 1):
        if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0:
            try:
                with open(pdf_path, "rb") as f:
                    logger.info(f"✓ Archivo accesible (intento {intento}/{reintentos})")
                    return True
            except (PermissionError, OSError) as e:
                logger.warning(f"Intento {intento}/{reintentos}: Archivo bloqueado - {e}")
        else:
            logger.warning(f"Intento {intento}/{reintentos}: Archivo no existe o está vacío")
        
        if intento < reintentos:
            time.sleep(espera)
    
    logger.error(f"✗ Archivo no accesible tras {reintentos} intentos")
    return False


def preprocess_for_barcode(pix, scale=DEFAULT_SCALE):
    """
    Preprocesa una imagen para mejorar la detección de códigos de barras.
    
    Args:
        pix: Pixmap de PyMuPDF
        scale: Factor de escalado para mejorar resolución
        
    Returns:
        tuple: (imagen procesada, dimensiones)
    """
    img_pil = Image.open(io.BytesIO(pix.tobytes("png")))
    arr = np.array(img_pil.convert("RGB"))[:, :, :3]
    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
    h, w = gray.shape
    
    # Escalar imagen
    new_w, new_h = int(w * scale), int(h * scale)
    gray = cv2.resize(gray, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
    
    # Reducir ruido
    gray = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)
    
    # Mejorar contraste
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    gray = clahe.apply(gray)
    
    # Binarizar
    _, th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    return th, (new_w, new_h)


def detect_barcodes_on_page(page, dpi=DEFAULT_DPI, scale=DEFAULT_SCALE):
    """
    Detecta códigos de barras en una página PDF.
    
    Args:
        page: Página de PyMuPDF
        dpi: Resolución de renderizado
        scale: Factor de escalado
        
    Returns:
        tuple: (lista de códigos, zoom, scale, dimensiones)
    """
    pix = page.get_pixmap(dpi=dpi)
    zoom = dpi / 72.0
    cv_img, (img_w, img_h) = preprocess_for_barcode(pix, scale=scale)
    
    barcodes = []
    decoded = zbar_decode(cv_img)
    
    for d in decoded:
        (x, y, w, h) = d.rect
        barcode_data = d.data.decode("utf-8", errors="ignore")
        
        barcodes.append({
            "data": barcode_data,
            "bbox": (x, y, x + w, y + h),
            "y_center": y + h / 2,
            "y_top": y,
            "y_bottom": y + h
        })
        
        logger.info(f"  └─ Código detectado: '{barcode_data}' (Y={y+h/2:.1f})")
    
    return barcodes, zoom, scale, (img_w, img_h)


def image_coord_to_pdf(val, zoom, scale):
    """
    Convierte coordenadas de imagen a coordenadas PDF.
    
    Args:
        val: Valor en coordenadas de imagen
        zoom: Factor de zoom aplicado
        scale: Factor de escala aplicado
        
    Returns:
        float: Valor en coordenadas PDF
    """
    return val / (zoom * scale)


def create_clipped_page_from_rect(src_doc, out_doc, pno, rect_pdf):
    """
    Crea una página recortada en el documento de salida.
    
    Args:
        src_doc: Documento fuente
        out_doc: Documento destino
        pno: Número de página
        rect_pdf: Rectángulo de recorte
        
    Returns:
        bool: True si se creó correctamente, False en caso contrario
    """
    if rect_pdf.is_empty or rect_pdf.is_infinite:
        return False
    
    newp = out_doc.new_page(width=rect_pdf.width, height=rect_pdf.height)
    newp.show_pdf_page(newp.rect, src_doc, pno, clip=rect_pdf)
    return True

# ================================================================================
# FUNCIÓN PRINCIPAL DE PROCESAMIENTO
# ================================================================================

def cortar_pdf_nipongases(pdf_path):
    """
    Procesa un PDF de Nipongases recortando por códigos de barras.
    
    Args:
        pdf_path: Ruta del archivo PDF a procesar
        
    Returns:
        bool: True si el procesamiento fue exitoso, False en caso contrario
    """
    logger.info("=" * 80)
    logger.info(f"INICIO PROCESAMIENTO: {os.path.basename(pdf_path)}")
    logger.info("=" * 80)
    
    # Validar acceso al archivo
    if not esperar_archivo(pdf_path):
        logger.error(f"Procesamiento abortado: archivo no accesible")
        return False

    # Abrir documento
    try:
        src = fitz.open(pdf_path)
        logger.info(f"PDF abierto correctamente: {len(src)} página(s)")
    except Exception as e:
        logger.error(f"Error abriendo PDF: {e}")
        return False

    out = fitz.open()
    used_barcodes = set()
    total_recortes = 0

    # Procesar páginas
    try:
        logger.info("Escaneando páginas en busca de códigos de barras...")
        
        for pno, page in enumerate(src):
            logger.info(f"Página {pno + 1}/{len(src)}")
            
            barcodes, zoom, scale_used, img_size = detect_barcodes_on_page(page)
            
            if not barcodes:
                logger.info("  └─ Sin códigos de barras detectados")
                continue
            
            logger.info(f"  └─ {len(barcodes)} código(s) encontrado(s)")
            barcodes_sorted = sorted(barcodes, key=lambda b: b["y_center"])
            
            for bc in barcodes_sorted:
                # Evitar duplicados
                if bc["data"] in used_barcodes:
                    logger.info(f"  └─ Código '{bc['data']}' ya procesado, omitiendo")
                    continue
                
                used_barcodes.add(bc["data"])
                
                # Calcular región de recorte
                y_top_img = max(0, bc["y_top"] - MARGEN_SUPERIOR_BARCODE)
                y_bottom_img = min(img_size[1], bc["y_bottom"] + MARGEN_INFERIOR_BARCODE)
                
                rect_pdf = fitz.Rect(
                    0,
                    image_coord_to_pdf(y_top_img, zoom, scale_used),
                    page.rect.width,
                    image_coord_to_pdf(y_bottom_img, zoom, scale_used)
                )
                
                # Crear página recortada
                if create_clipped_page_from_rect(src, out, pno, rect_pdf):
                    total_recortes += 1
                    logger.info(f"  └─ Recorte #{total_recortes} creado para código '{bc['data']}'")
                else:
                    logger.warning(f"  └─ No se pudo crear recorte para código '{bc['data']}'")
        
    except Exception as e:
        logger.exception(f"Error durante procesamiento de páginas: {e}")
        return False
    finally:
        src.close()

    # Validar resultados
    if total_recortes == 0:
        logger.warning("No se crearon recortes - sin códigos de barras válidos")
        out.close()
        return False

    logger.info(f"Total de recortes generados: {total_recortes}")

    # Guardar PDF final
    os.makedirs(OUT_DIR, exist_ok=True)
    base_name = os.path.splitext(os.path.basename(pdf_path))[0]
    out_path = os.path.join(OUT_DIR, f"{base_name}_recortado.pdf")
    
    try:
        out.save(out_path)
        logger.info(f"✓ PDF guardado exitosamente: {out_path}")
        return True
    except Exception as e:
        logger.error(f"✗ Error guardando PDF: {e}")
        return False
    finally:
        out.close()

# ================================================================================
# MODO BATCH (PROCESAR CARPETA COMPLETA)
# ================================================================================

def procesar_carpeta_batch():
    """
    Procesa todos los PDFs en la carpeta de entrada (modo --watch).
    """
    logger.info("=" * 80)
    logger.info("MODO BATCH: Procesando carpeta completa")
    logger.info("=" * 80)
    
    in_dir = os.path.join(BASE_WORK_DIR, IN_DIR_NAME, CLIENTE)
    procesados_dir = os.path.join(BASE_WORK_DIR, PROCESADOS_DIR_NAME, CLIENTE)
    revisar_dir = os.path.join(BASE_WORK_DIR, ERROR_DIR_NAME, CLIENTE)
    
    # Crear directorios
    os.makedirs(procesados_dir, exist_ok=True)
    os.makedirs(revisar_dir, exist_ok=True)

    # Buscar archivos
    patron = os.path.join(in_dir, "*.pdf")
    archivos_pdf = sorted(glob.glob(patron))
    
    total_archivos = len(archivos_pdf)
    logger.info(f"Archivos encontrados: {total_archivos}")
    
    if total_archivos == 0:
        logger.info("No hay archivos para procesar")
        print("[INFO] No hay archivos en la carpeta de entrada")
        return

    archivos_exitosos = 0
    archivos_fallidos = 0

    # Procesar cada archivo
    for idx, ruta in enumerate(archivos_pdf, 1):
        nombre_archivo = os.path.basename(ruta)
        logger.info(f"\n[{idx}/{total_archivos}] Procesando: {nombre_archivo}")
        
        exito = cortar_pdf_nipongases(ruta)
        
        # Mover archivo según resultado
        if exito:
            archivos_exitosos += 1
            destino = os.path.join(procesados_dir, nombre_archivo)
            carpeta_destino = "PROCESADOS"
        else:
            archivos_fallidos += 1
            destino = os.path.join(revisar_dir, nombre_archivo)
            carpeta_destino = "ERRORES"
        
        try:
            shutil.move(ruta, destino)
            logger.info(f"Archivo movido a: {carpeta_destino}")
        except Exception as e:
            logger.warning(f"No se pudo mover archivo: {e}")

    # Resumen final
    logger.info("=" * 80)
    logger.info("RESUMEN DE PROCESAMIENTO")
    logger.info("=" * 80)
    logger.info(f"Total archivos: {total_archivos}")
    logger.info(f"✓ Exitosos: {archivos_exitosos}")
    logger.info(f"✗ Fallidos: {archivos_fallidos}")
    logger.info("=" * 80)
    
    print(f"\n[RESUMEN]")
    print(f"Total archivos: {total_archivos}")
    print(f"Procesados exitosamente: {archivos_exitosos}")
    print(f"Fallidos: {archivos_fallidos}")

# ================================================================================
# MODO API (PROCESAR ARCHIVO INDIVIDUAL)
# ================================================================================

def procesar_archivo_api(folder, filename, metadata):
    """
    Procesa un archivo individual llamado desde la API.
    
    Args:
        folder: Nombre de la carpeta (folder del cliente)
        filename: Nombre del archivo
        metadata: JSON string con metadatos
    """
    logger.info("=" * 80)
    logger.info(f"MODO API: Archivo individual")
    logger.info(f"Folder: {folder} | File: {filename}")
    logger.info("=" * 80)
    
    in_dir = os.path.join(BASE_WORK_DIR, IN_DIR_NAME, CLIENTE)
    procesados_dir = os.path.join(BASE_WORK_DIR, PROCESADOS_DIR_NAME, CLIENTE)
    revisar_dir = os.path.join(BASE_WORK_DIR, ERROR_DIR_NAME, CLIENTE)
    
    os.makedirs(procesados_dir, exist_ok=True)
    os.makedirs(revisar_dir, exist_ok=True)
    
    ruta = os.path.join(in_dir, filename)
    
    if not os.path.exists(ruta):
        logger.error(f"Archivo no encontrado: {ruta}")
        print(f"[ERROR] Archivo no encontrado: {ruta}")
        sys.exit(1)
    
    exito = cortar_pdf_nipongases(ruta)
    
    # Mover archivo según resultado
    destino = procesados_dir if exito else revisar_dir
    try:
        shutil.move(ruta, os.path.join(destino, filename))
        logger.info(f"Archivo movido a: {'PROCESADOS' if exito else 'ERRORES'}")
    except Exception as e:
        logger.warning(f"No se pudo mover archivo: {e}")
    
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
        # Modo batch: procesar carpeta completa
        procesar_carpeta_batch()
        
    else:
        # Uso incorrecto
        print("USO:")
        print("  Modo API:   python nipongases.py <folder> <filename> <metadata>")
        print("  Modo Batch: python nipongases.py --watch")
        sys.exit(1)