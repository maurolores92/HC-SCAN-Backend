import pdfParse = require('pdf-parse');
import { DocumentAiExtractorService } from './document-ai-extractor.service';

jest.mock('pdf-parse', () => jest.fn());

describe('DocumentAiExtractorService', () => {
  let service: DocumentAiExtractorService;
  const mockedPdfParse = pdfParse as unknown as jest.Mock;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    service = new DocumentAiExtractorService();
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (originalApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalApiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    global.fetch = originalFetch;
  });

  it('debe extraer metadatos universales con el motor heurístico local cuando no hay GEMINI_API_KEY', async () => {
    // Arrange
    mockedPdfParse.mockResolvedValueOnce({
      numpages: 2,
      text: `
        FACTURA A N° 0004-00018923
        Razón Social: Papelera Industrial del Sur S.A.
        CUIT: 30-71234567-9
        Fecha: 15/10/2026
        Responsable: Martín Gómez
        Total: $ 145.200,50
      `,
    });

    // Act
    const result = await service.extractFromBuffer(
      Buffer.from('%PDF-1.4 fake'),
      'factura_octubre.pdf',
    );

    // Assert
    expect(result.extractionEngine).toBe('local_parser');
    expect(result.documentType).toBe('factura');
    expect(result.issuerTaxId).toBe('30-71234567-9');
    expect(result.documentDate).toBe('2026-10-15');
    expect(result.responsiblePerson).toBe('Martín Gómez');
    expect(result.totalAmount).toBe(145200.5);
    expect(result.pageCount).toBe(2);
  });

  it('debe invocar Gemini en modo gemini_text cuando el PDF tiene capa de texto digital suficiente', async () => {
    // Arrange
    process.env.GEMINI_API_KEY = 'fake-gemini-key';
    const richNativeText =
      'CONTRATO DE LOCACIÓN DE SERVICIOS TÉCNICOS celebrado entre HelpCopies S.R.L. y Clínica Central S.A. por mantenimiento mensual de equipos multifunción.';
    mockedPdfParse.mockResolvedValueOnce({
      numpages: 4,
      text: richNativeText,
    });

    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        usageMetadata: { totalTokenCount: 620 },
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    documentType: 'contrato_servicios',
                    summary: 'Contrato anual de mantenimiento de impresoras multifunción.',
                    documentNumber: 'CONT-2026-88',
                    documentDate: '2026-10-01',
                    issuerName: 'HelpCopies S.R.L.',
                    recipientName: 'Clínica Central S.A.',
                    responsiblePerson: 'Dra. Laura Méndez',
                    currency: 'ARS',
                    totalAmount: 380000,
                    tags: ['contrato', 'mantenimiento'],
                    attributes: { vigencia_meses: 12, cantidad_equipos: 6 },
                    items: [],
                    involvedParties: [{ name: 'Dra. Laura Méndez', role: 'firmante', identifier: null }],
                    rawText: richNativeText,
                    aiConfidence: 0.96,
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    global.fetch = fetchMock as any;

    // Act
    const result = await service.extractFromBuffer(
      Buffer.from('%PDF-1.4 digital'),
      'contrato_clinica.pdf',
    );

    // Assert
    expect(result.extractionEngine).toBe('gemini_text');
    expect(result.documentType).toBe('contrato_servicios');
    expect(result.responsiblePerson).toBe('Dra. Laura Méndez');
    expect(result.extractedData.attributes.vigencia_meses).toBe(12);
    expect(result.tokensUsed).toBe(620);
  });

  it('debe usar gemini_vision multimodal cuando el PDF proviene de un escáner HP sin texto embebido', async () => {
    // Arrange
    process.env.GEMINI_API_KEY = 'fake-gemini-key';
    mockedPdfParse.mockResolvedValueOnce({
      numpages: 1,
      text: '   ',
    });

    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        usageMetadata: { totalTokenCount: 1120 },
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    documentType: 'remito',
                    summary: 'Remito escaneado de entrega de insumos firmado en recepción.',
                    documentNumber: 'R-0001-00004412',
                    documentDate: '2026-10-29',
                    issuerName: 'Insumos Gráficos Norte',
                    responsiblePerson: 'Carlos Pereyra',
                    tags: ['remito', 'escaneo'],
                    attributes: { bultos: 3, estado_firma: 'firmado_manuscrito' },
                    rawText: 'REMITO R-0001-00004412 Recibió conforme: Carlos Pereyra',
                    aiConfidence: 0.93,
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    global.fetch = fetchMock as any;

    // Act
    const result = await service.extractFromBuffer(
      Buffer.from('%PDF-1.4 scanned image'),
      'HP_Scan_004412.pdf',
    );

    // Assert
    expect(result.extractionEngine).toBe('gemini_vision');
    expect(result.documentType).toBe('remito');
    expect(result.responsiblePerson).toBe('Carlos Pereyra');
    const requestPayload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestPayload.contents[0].parts[0].inlineData.mimeType).toBe('application/pdf');
  });
});

