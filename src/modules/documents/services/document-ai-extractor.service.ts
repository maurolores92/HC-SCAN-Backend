import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import pdfParse = require('pdf-parse');
import {
  extractUniversalHeuristicsFromText,
  UniversalDocumentExtractionResult,
} from '../helpers/local-pdf-heuristics.helper';

const MIN_NATIVE_TEXT_LENGTH = 80;

const EXTRACTION_SYSTEM_PROMPT = `Eres un motor experto de análisis documental y extracción semántica empresarial multirubro.
Cada empresa puede subir cualquier tipo de PDF (facturas, remitos, notas de pedido, contratos, órdenes de servicio, recibos de sueldo, legajos, presupuestos, oficios, etc.).
Analiza el documento y devuelve ESTRICTAMENTE un objeto JSON válido (sin bloques markdown ni texto adicional) con esta estructura exacta:
{
  "documentType": "string en snake_case minúscula (ej: factura, remito, nota_pedido, contrato, orden_servicio, recibo_sueldo, informe_medico, presupuesto, etc.)",
  "summary": "resumen ejecutivo claro en español (1 a 2 oraciones) con los datos más importantes",
  "documentNumber": "string o null (número de comprobante, contrato, expediente o remito)",
  "documentDate": "YYYY-MM-DD o null (fecha principal del documento)",
  "issuerName": "string o null (nombre/razón social del proveedor, emisor o entidad de origen)",
  "issuerTaxId": "string o null (CUIT, RUT, DNI o identificador fiscal del emisor)",
  "recipientName": "string o null (cliente, destinatario o receptor)",
  "responsiblePerson": "string o null (persona responsable, firmante, solicitante o quien recibió)",
  "currency": "ARS | USD | EUR | null (solo si existen importes monetarios)",
  "totalAmount": "number o null (monto total numérico, ej: 125430.50)",
  "tags": ["etiquetas clave en español minúscula"],
  "attributes": { "clave_dinamica_snake_case": "cualquier dato propio relevante (CAE, patente, bultos, etc.)" },
  "items": [ { "code": "string|null", "description": "string", "quantity": "number|null", "unitPrice": "number|null", "subtotal": "number|null" } ],
  "involvedParties": [ { "name": "string", "role": "string", "identifier": "string|null" } ],
  "dates": { "vencimiento": "YYYY-MM-DD" },
  "amounts": { "subtotal": 0, "impuestos": 0 },
  "aiConfidence": 0.95
}`;

/**
 * Servicio de extracción documental de alto rendimiento:
 * 1) Inspecciona y extrae capa de texto nativo con `pdf-parse` en milisegundos.
 * 2) Si EXTRACTION_MODE='local' o sin GEMINI_API_KEY: usa extracción 100% local instantánea (~50ms).
 * 3) Si EXTRACTION_MODE='hybrid' con GEMINI_API_KEY: usa Gemini solo para clasificar metadatos clave en un JSON liviano
 *    sin re-transcribir todo el texto nativo (reduce el tiempo de 45s a ~1.5s).
 */
@Injectable()
export class DocumentAiExtractorService {
  private readonly logger = new Logger(DocumentAiExtractorService.name);

  async extractFromFile(
    fullFilePath: string,
    originalFileName: string,
  ): Promise<UniversalDocumentExtractionResult> {
    const fileBuffer = readFileSync(fullFilePath);
    return this.extractFromBuffer(fileBuffer, originalFileName);
  }

  async extractFromBuffer(
    fileBuffer: Buffer,
    originalFileName: string,
  ): Promise<UniversalDocumentExtractionResult> {
    const { nativeText, pageCount } = await this.parseNativePdf(fileBuffer);
    const printableChars = nativeText.replace(/\s+/g, '').length;
    const hasCleanNativeText = printableChars >= MIN_NATIVE_TEXT_LENGTH;

    const extractionMode = (process.env.EXTRACTION_MODE || 'hybrid').toLowerCase().trim();
    const apiKey = process.env.GEMINI_API_KEY?.trim();

    // 100% Local / Biblioteca pdf-parse (Ultra rápido: ~50ms, 0 costo de IA)
    if (extractionMode === 'local' || !apiKey) {
      this.logger.log(
        `[DocumentAiExtractor] Extracción rápida 100% local (pdf-parse) para '${originalFileName}' (modo=${extractionMode})`,
      );
      return extractUniversalHeuristicsFromText(nativeText, originalFileName, pageCount);
    }

    try {
      if (hasCleanNativeText) {
        return await this.callGeminiExtractor({
          apiKey,
          mode: 'gemini_text',
          nativeText,
          fileBuffer,
          originalFileName,
          pageCount,
        });
      }

      return await this.callGeminiExtractor({
        apiKey,
        mode: 'gemini_vision',
        nativeText,
        fileBuffer,
        originalFileName,
        pageCount,
      });
    } catch (error: any) {
      this.logger.warn(
        `[DocumentAiExtractor] Falló extracción Gemini para '${originalFileName}' (${error?.message}). Aplicando fallback local inmediato.`,
      );
      return extractUniversalHeuristicsFromText(nativeText, originalFileName, pageCount);
    }
  }

  private async parseNativePdf(
    buffer: Buffer,
  ): Promise<{ nativeText: string; pageCount: number }> {
    try {
      const parsed = await pdfParse(buffer);
      return {
        nativeText: (parsed?.text || '').trim(),
        pageCount: Number(parsed?.numpages || 1),
      };
    } catch (err: any) {
      this.logger.warn(`No se pudo extraer capa nativa con pdf-parse: ${err?.message}`);
      return { nativeText: '', pageCount: 1 };
    }
  }

  private async callGeminiExtractor(params: {
    apiKey: string;
    mode: 'gemini_text' | 'gemini_vision';
    nativeText: string;
    fileBuffer: Buffer;
    originalFileName: string;
    pageCount: number;
  }): Promise<UniversalDocumentExtractionResult> {
    const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${params.apiKey}`;

    const parts: any[] =
      params.mode === 'gemini_text'
        ? [
            {
              text: `${EXTRACTION_SYSTEM_PROMPT}\n\nNombre del archivo: ${params.originalFileName}\nCantidad de páginas: ${params.pageCount}\n\nTexto digital nativo del PDF:\n${params.nativeText.slice(0, 50000)}`,
            },
          ]
        : [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: params.fileBuffer.toString('base64'),
              },
            },
            {
              text: `${EXTRACTION_SYSTEM_PROMPT}\n\nNombre original del archivo escaneado: ${params.originalFileName}`,
            },
          ];

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`HTTP ${response.status}: ${errBody.slice(0, 250)}`);
    }

    const json: any = await response.json();
    const rawCandidate = json?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const tokensUsed = Number(json?.usageMetadata?.totalTokenCount || 0);
    const parsed = this.safeParseJsonObject(rawCandidate);

    const normalizedType = String(parsed.documentType || 'documento_general')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 80);

    const parsedTotal =
      parsed.totalAmount !== null && parsed.totalAmount !== undefined && parsed.totalAmount !== ''
        ? Number(parsed.totalAmount)
        : null;

    return {
      documentType: normalizedType || 'documento_general',
      summary: String(parsed.summary || `Documento ${params.originalFileName} procesado.`),
      documentNumber: parsed.documentNumber ? String(parsed.documentNumber).slice(0, 100) : null,
      documentDate:
        typeof parsed.documentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.documentDate)
          ? parsed.documentDate
          : null,
      issuerName: parsed.issuerName ? String(parsed.issuerName).slice(0, 200) : null,
      issuerTaxId: parsed.issuerTaxId ? String(parsed.issuerTaxId).slice(0, 50) : null,
      recipientName: parsed.recipientName ? String(parsed.recipientName).slice(0, 200) : null,
      responsiblePerson: parsed.responsiblePerson
        ? String(parsed.responsiblePerson).slice(0, 200)
        : null,
      currency: parsed.currency ? String(parsed.currency).slice(0, 10) : null,
      totalAmount: parsedTotal !== null && Number.isFinite(parsedTotal) ? parsedTotal : null,
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map((t: any) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 15)
        : [normalizedType],
      extractedData: {
        attributes:
          parsed.attributes && typeof parsed.attributes === 'object' ? parsed.attributes : {},
        items: Array.isArray(parsed.items) ? parsed.items : [],
        involvedParties: Array.isArray(parsed.involvedParties) ? parsed.involvedParties : [],
        dates: parsed.dates && typeof parsed.dates === 'object' ? parsed.dates : {},
        amounts: parsed.amounts && typeof parsed.amounts === 'object' ? parsed.amounts : {},
      },
      // Usamos directamente el texto nativo ya extraído por pdf-parse en milisegundos
      rawText: params.nativeText || String(parsed.rawText || '').trim(),
      pageCount: params.pageCount,
      aiConfidence:
        typeof parsed.aiConfidence === 'number'
          ? Math.max(0, Math.min(1, parsed.aiConfidence))
          : 0.9,
      extractionEngine: params.mode,
      tokensUsed,
    };
  }

  private safeParseJsonObject(raw: string): Record<string, any> {
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    return JSON.parse(cleaned);
  }
}
