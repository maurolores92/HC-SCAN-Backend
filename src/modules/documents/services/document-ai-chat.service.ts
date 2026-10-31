import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Document, DocumentStatus } from '../document.model';
import { ChatDocumentDto } from '../dto/chat-document.dto';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/audit.model';
import { TenantQuotasService } from '../../plans/services/tenant-quotas.service';
import { requireTenantCompanyId } from '../../../common/utils/tenant-scope.util';
import { buildDocumentSearchWhere } from '../helpers/document-search.helper';

export interface DocumentChatResponse {
  reply: string;
  referencedDocuments: Array<{
    id: number;
    originalName: string;
    documentType: string | null;
    issuerName: string | null;
    totalAmount: number | null;
    currency: string | null;
    documentDate: string | null;
    summary: string | null;
  }>;
  quota: {
    current: number;
    max: number | null;
    unlimited: boolean;
    percentage: number;
  };
}

@Injectable()
export class DocumentAiChatService {
  private readonly logger = new Logger(DocumentAiChatService.name);

  constructor(
    @InjectModel(Document)
    private readonly documentModel: typeof Document,
    private readonly auditService: AuditService,
    private readonly tenantQuotasService: TenantQuotasService,
  ) {}

  /**
   * Procesa una consulta conversacional en lenguaje natural sobre los documentos del tenant,
   * consume 1 cupo mensual de IA y audita la acción.
   */
  async chat(dto: ChatDocumentDto, user: any): Promise<DocumentChatResponse> {
    const companyId = requireTenantCompanyId(user);
    await this.tenantQuotasService.assertCanExecuteAiQuery(companyId);

    const { contextDocs, specificDoc } = await this.resolveContextDocuments(
      companyId,
      dto,
    );

    const { reply, tokensUsed } = await this.generateAiResponse(
      dto,
      contextDocs,
      specificDoc,
    );

    await this.tenantQuotasService.consumeAiQuery(companyId, {
      actorUserId: user.id,
      tokensUsed,
    });

    await this.auditService.log({
      action: AuditAction.AI_QUERY,
      entity: 'Document',
      entityId: dto.documentId ?? (contextDocs[0]?.id ? String(contextDocs[0].id) : undefined),
      companyId,
      userId: user.id,
      description: `Consulta IA documental: "${dto.message.slice(0, 75)}"`,
      payload: {
        message: dto.message,
        documentId: dto.documentId ?? null,
        referencedDocCount: contextDocs.length,
        tokensUsed,
      },
    });

    const quotaSummary = await this.tenantQuotasService.getCompanyQuotaSummary(companyId);

    return {
      reply,
      referencedDocuments: contextDocs.map((d) => ({
        id: d.id,
        originalName: d.originalName,
        documentType: d.documentType,
        issuerName: d.issuerName,
        totalAmount: d.totalAmount ? Number(d.totalAmount) : null,
        currency: d.currency,
        documentDate: d.documentDate,
        summary: d.summary,
      })),
      quota: quotaSummary.aiQueries,
    };
  }

  /**
   * Retorna una lista rápida de documentos recientes para sugerencias en el chat.
   */
  async getRecentDocumentsForChat(user: any) {
    const companyId = requireTenantCompanyId(user);
    return this.documentModel.findAll({
      where: { companyId, status: DocumentStatus.PROCESSED },
      limit: 15,
      order: [['createdAt', 'DESC']],
      attributes: [
        'id',
        'originalName',
        'documentType',
        'documentNumber',
        'documentDate',
        'issuerName',
        'totalAmount',
        'currency',
        'summary',
      ],
    });
  }

  private async resolveContextDocuments(
    companyId: number,
    dto: ChatDocumentDto,
  ): Promise<{ contextDocs: Document[]; specificDoc: Document | null }> {
    if (dto.documentId) {
      const doc = await this.documentModel.findOne({
        where: { id: dto.documentId, companyId },
      });
      if (!doc) {
        throw new NotFoundException(
          `Documento #${dto.documentId} no encontrado o no pertenece a su compañía.`,
        );
      }
      return { contextDocs: [doc], specificDoc: doc };
    }

    const keywordMatches: Document[] = [];
    if (dto.message.trim().length >= 3) {
      try {
        const searchWhere = buildDocumentSearchWhere(companyId, { search: dto.message });
        const matches = await this.documentModel.findAll({
          where: searchWhere,
          limit: 6,
          order: [['createdAt', 'DESC']],
        });
        keywordMatches.push(...matches);
      } catch (err: any) {
        this.logger.debug(`Búsqueda de contexto textual: ${err?.message}`);
      }
    }

    const recentDocs = await this.documentModel.findAll({
      where: { companyId, status: { [Op.in]: [DocumentStatus.PROCESSED, DocumentStatus.PENDING] } },
      limit: 12,
      order: [['createdAt', 'DESC']],
    });

    const docMap = new Map<number, Document>();
    for (const d of [...keywordMatches, ...recentDocs]) {
      docMap.set(d.id, d);
    }

    return { contextDocs: Array.from(docMap.values()).slice(0, 15), specificDoc: null };
  }

  private async generateAiResponse(
    dto: ChatDocumentDto,
    contextDocs: Document[],
    specificDoc: Document | null,
  ): Promise<{ reply: string; tokensUsed: number }> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

    const systemPrompt = this.buildSystemPrompt(contextDocs, specificDoc);

    if (!apiKey) {
      this.logger.debug('[DocumentAiChat] Sin GEMINI_API_KEY; usando respuesta heurística contextual.');
      return {
        reply: this.buildLocalFallbackReply(dto.message, contextDocs, specificDoc),
        tokensUsed: 150,
      };
    }

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const historyContents: any[] = [];
      if (Array.isArray(dto.conversationHistory)) {
        for (const item of dto.conversationHistory.slice(-8)) {
          historyContents.push({
            role: item.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: item.content }],
          });
        }
      }

      historyContents.push({
        role: 'user',
        parts: [{ text: dto.message }],
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: historyContents,
          generationConfig: {
            temperature: 0.0,
            maxOutputTokens: 2048,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API HTTP ${response.status}: ${errText.slice(0, 200)}`);
      }

      const json: any = await response.json();
      const reply =
        json?.candidates?.[0]?.content?.parts?.[0]?.text ||
        'No fue posible generar una respuesta para esta consulta.';
      const tokensUsed = Number(json?.usageMetadata?.totalTokenCount || 250);

      return { reply, tokensUsed };
    } catch (error: any) {
      this.logger.warn(`[DocumentAiChat] Falló llamada a Gemini: ${error?.message}. Aplicando fallback local.`);
      return {
        reply: this.buildLocalFallbackReply(dto.message, contextDocs, specificDoc),
        tokensUsed: 120,
      };
    }
  }

  private buildSystemPrompt(contextDocs: Document[], specificDoc: Document | null): string {
    const contextData = contextDocs.map((d) => ({
      id: d.id,
      nombre_archivo: d.originalName,
      tipo_documento: d.documentType,
      numero: d.documentNumber,
      fecha: d.documentDate,
      emisor_proveedor: d.issuerName,
      cuit_emisor: d.issuerTaxId,
      destinatario_cliente: d.recipientName,
      responsable: d.responsiblePerson,
      monto_total: d.totalAmount,
      moneda: d.currency,
      resumen: d.summary,
      etiquetas: d.tags,
      datos_extraidos: d.extractedData,
      fragmento_texto: d.rawText ? d.rawText.slice(0, 2500) : null,
    }));

    return `Eres el Asistente IA Oficial de Gestión Documental de HC-SCAN para la empresa actual.
Tu función es responder consultas del usuario EXCLUSIVAMENTE analizando los registros de documentos provistos a continuación, los cuales fueron extraídos de los archivos PDF y almacenados en la base de datos PostgreSQL de la empresa.

REGLAS ESTRICTAS DE SEGURIDAD Y FACTUALIDAD (ANTI-ALUCINACIÓN):
1. CONOCIMIENTO EXTERNO DESHABILITADO:
   Tienes terminantemente PROHIBIDO responder usando conocimientos generales, eventos mundiales, internet, cultura pop, noticias o datos de empresas ajenas. Tu único universo de conocimiento son los documentos listados abajo.
2. POLÍTICA DE NEGACIÓN ANTE INFORMACIÓN FALTANTE:
   Si el usuario pregunta por un dato, proveedor, persona, fecha o comprobante que NO está presente en el repositorio provisto, o formula preguntas no relacionadas con los documentos cargados, tu respuesta DEBE SER OBLIGATORIAMENTE:
   "No dispongo de información sobre ese tema en los documentos cargados de su empresa."
   Bajo ninguna circunstancia inventes o supongas información.
3. CITACIÓN OBLIGATORIA DEL DOCUMENTO:
   Siempre que des una respuesta afirmativa, cita el nombre del archivo y número de comprobante que la respalda (ej: "Según la Factura #0001-00234 de Proveedor Acme (archivo Factura_Acme.pdf)...").
4. CÁLCULOS EXACTOS:
   Para consultas de importes o gastos acumulados, opera únicamente sobre los valores numéricos monetarios registrados en estos documentos.
5. CONTEXTO ACTIVO:
   ${specificDoc ? `La consulta está enfocada en el documento #${specificDoc.id} (${specificDoc.originalName}). Profundiza en sus campos y texto extraído.` : 'Analiza el conjunto de documentos disponibles de la empresa para responder la consulta.'}

REPOSITORIO DE DOCUMENTOS DE LA EMPRESA (POSTGRESQL / OCR):
${JSON.stringify(contextData, null, 2)}`;
  }

  private buildLocalFallbackReply(
    message: string,
    contextDocs: Document[],
    specificDoc: Document | null,
  ): string {
    if (contextDocs.length === 0) {
      return 'No encontré documentos cargados en su compañía para responder esta consulta. Puede subir archivos PDF desde la sección de Documentos o por sincronización SFTP.';
    }

    if (specificDoc) {
      return `📄 **Análisis del documento ${specificDoc.originalName}:**
- **Tipo:** ${specificDoc.documentType || 'No especificado'}
- **Número:** ${specificDoc.documentNumber || 'Sin número detectado'}
- **Emisor:** ${specificDoc.issuerName || 'No identificado'}
- **Fecha:** ${specificDoc.documentDate || 'Sin fecha'}
- **Monto total:** ${specificDoc.currency || '$'} ${specificDoc.totalAmount ? Number(specificDoc.totalAmount).toLocaleString('es-AR') : '0.00'}
- **Resumen:** ${specificDoc.summary || 'Sin resumen disponible.'}`;
    }

    const totalDocs = contextDocs.length;
    const totalMonto = contextDocs.reduce((acc, d) => acc + (Number(d.totalAmount) || 0), 0);
    const tipos = Array.from(new Set(contextDocs.map((d) => d.documentType).filter(Boolean)));

    return `📊 **Resumen de Documentos Analizados (${totalDocs} documentos encontrados):**
- **Tipos detectados:** ${tipos.join(', ') || 'Varios'}
- **Suma de importes registrados:** $ ${totalMonto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
- **Documentos más relevantes:**
${contextDocs
  .slice(0, 5)
  .map(
    (d) =>
      `  • **${d.originalName}** (${d.documentType || 'documento'}) — ${d.issuerName ? `Emisor: ${d.issuerName}` : ''} ${d.totalAmount ? `[$ ${Number(d.totalAmount).toLocaleString('es-AR')}]` : ''}`,
  )
  .join('\n')}

*(Nota: Para respuestas semánticas en profundidad, asegúrese de tener configurada su \`GEMINI_API_KEY\` en el backend).*`;
  }
}
