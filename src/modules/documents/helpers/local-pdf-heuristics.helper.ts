export interface UniversalDocumentExtractionResult {
  documentType: string;
  summary: string;
  documentNumber: string | null;
  documentDate: string | null;
  issuerName: string | null;
  issuerTaxId: string | null;
  recipientName: string | null;
  responsiblePerson: string | null;
  currency: string | null;
  totalAmount: number | null;
  tags: string[];
  extractedData: {
    attributes: Record<string, string | number | boolean | null>;
    items: Array<Record<string, any>>;
    involvedParties: Array<{ name: string; role?: string; identifier?: string }>;
    dates: Record<string, string>;
    amounts: Record<string, number>;
  };
  rawText: string;
  pageCount: number;
  aiConfidence: number;
  extractionEngine: 'gemini_vision' | 'gemini_text' | 'local_parser';
  tokensUsed: number;
}

const KNOWN_TYPE_PATTERNS: Array<{ type: string; regex: RegExp }> = [
  { type: 'factura', regex: /\b(factura|invoice|comprobante\s+electr[oó]nico|cae\b)/i },
  { type: 'remito', regex: /\b(remito|gu[ií]a\s+de\s+despacho|entrega\s+de\s+mercader[ií]a)/i },
  { type: 'nota_pedido', regex: /\b(nota\s+de\s+pedido|orden\s+de\s+compra|solicitud\s+de\s+compra|purchase\s+order)/i },
  { type: 'presupuesto', regex: /\b(presupuesto|cotizaci[oó]n|quotation)/i },
  { type: 'recibo', regex: /\b(recibo|comprobante\s+de\s+pago|orden\s+de\s+pago)/i },
  { type: 'contrato', regex: /\b(contrato|acuerdo|convenio|cl[aá]usula)/i },
  { type: 'orden_servicio', regex: /\b(orden\s+de\s+servicio|parte\s+t[eé]cnico|informe\s+t[eé]cnico)/i },
  { type: 'legajo', regex: /\b(legajo|curr[ií]culum|recibo\s+de\s+haberes|alta\s+temprana)/i },
];

const parseSpanishOrIsoDate = (text: string): string | null => {
  const isoMatch = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) return isoMatch[0];

  const latamMatch = text.match(/\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](20\d{2})\b/);
  if (latamMatch) {
    const day = latamMatch[1].padStart(2, '0');
    const month = latamMatch[2].padStart(2, '0');
    const year = latamMatch[3];
    return `${year}-${month}-${day}`;
  }
  return null;
};

const parseAmountValue = (raw: string): number | null => {
  const cleaned = raw.replace(/[^\d.,]/g, '').trim();
  if (!cleaned) return null;

  // Formato 1.234.567,89 vs 1,234,567.89
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;

  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, '');
  }

  const num = Number(normalized);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) / 100 : null;
};

/**
 * Extractor heurístico universal para operación offline / entorno local sin API Key.
 * Analiza cualquier PDF con texto embebido y extrae atributos clave-valor dinámicos.
 */
export const extractUniversalHeuristicsFromText = (
  rawText: string,
  originalFileName: string,
  pageCount: number,
): UniversalDocumentExtractionResult => {
  const cleanText = (rawText || '').replace(/\r/g, '').trim();
  const combinedSource = `${originalFileName}\n${cleanText}`;

  let detectedType = 'documento_general';
  for (const candidate of KNOWN_TYPE_PATTERNS) {
    if (candidate.regex.test(combinedSource)) {
      detectedType = candidate.type;
      break;
    }
  }

  const taxIdMatch = cleanText.match(/\b(20|23|24|27|30|33|34)[-\s]?\d{8}[-\s]?\d\b/);
  const docNumMatch =
    cleanText.match(/(?:n[°ºro.\s]*|comprobante\s*[:#]?\s*)(\d{4,5}\s*-\s*\d{6,8})/i) ||
    cleanText.match(/(?:factura|remito|pedido|orden|contrato|nro\.?)\s*[#n°º:]*\s*([A-Z0-9-]{4,20})/i);

  const documentDate = parseSpanishOrIsoDate(cleanText);

  const currency = /\b(USD|U\$S|D[OÓ]LARES)\b/i.test(cleanText)
    ? 'USD'
    : /(\$|ARS|PESOS)/i.test(cleanText)
      ? 'ARS'
      : null;

  const totalMatch =
    cleanText.match(/(?:total(?:\s+general|\s+a\s+pagar)?|importe\s+total)\s*[:$]?\s*(?:ARS|USD|U\$S|\$)?\s*([\d.,]{2,18})/i) ||
    cleanText.match(/\$\s*([\d.]+,\d{2})/);
  const totalAmount = totalMatch ? parseAmountValue(totalMatch[1]) : null;

  const issuerMatch = cleanText.match(/(?:raz[oó]n\s+social|proveedor|emisor|empresa)\s*:\s*([^\n]{3,90})/i);
  const recipientMatch = cleanText.match(/(?:cliente|destinatario|se[ñn]or(?:es)?|paciente)\s*:\s*([^\n]{3,90})/i);
  const responsibleMatch = cleanText.match(
    /(?:responsable|recibi[oó]|solicitante|autorizado\s+por|atendido\s+por|firmante)\s*:\s*([^\n]{3,90})/i,
  );

  // Extraer pares dinámicos "Etiqueta: Valor" presentes en el documento (agnóstico al rubro)
  const attributes: Record<string, string | number | boolean | null> = {};
  const lines = cleanText.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 60)) {
    const kv = line.match(/^([A-Za-zÁÉÍÓÚáéíóúÑñ0-9\s./()-]{2,35}):\s*(.{1,100})$/);
    if (kv) {
      const key = kv[1].trim().toLowerCase().replace(/\s+/g, '_');
      if (!attributes[key] && Object.keys(attributes).length < 20) {
        attributes[key] = kv[2].trim();
      }
    }
  }

  const firstLines = lines.slice(0, 3).join(' · ').slice(0, 220);
  const summary = cleanText.length > 20
    ? `Documento clasificado como ${detectedType.replace(/_/g, ' ')}. ${firstLines}`
    : `Archivo PDF registrado (${originalFileName}). Sin capa de texto digital embebida; configure GEMINI_API_KEY para OCR visual completo.`;

  const tags = [detectedType];
  if (!cleanText) tags.push('escaneo_imagen');

  return {
    documentType: detectedType,
    summary,
    documentNumber: docNumMatch ? docNumMatch[1].replace(/\s+/g, '') : null,
    documentDate,
    issuerName: issuerMatch ? issuerMatch[1].trim() : null,
    issuerTaxId: taxIdMatch ? taxIdMatch[0].replace(/\s+/g, '') : null,
    recipientName: recipientMatch ? recipientMatch[1].trim() : null,
    responsiblePerson: responsibleMatch ? responsibleMatch[1].trim() : null,
    currency: totalAmount !== null ? currency : null,
    totalAmount,
    tags,
    extractedData: {
      attributes,
      items: [],
      involvedParties: [],
      dates: documentDate ? { fecha_principal: documentDate } : {},
      amounts: totalAmount !== null ? { total: totalAmount } : {},
    },
    rawText: cleanText,
    pageCount,
    aiConfidence: cleanText.length > 60 ? 0.65 : 0.25,
    extractionEngine: 'local_parser',
    tokensUsed: 0,
  };
};

