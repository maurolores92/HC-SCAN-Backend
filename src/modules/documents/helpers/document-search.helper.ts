import { ForbiddenException } from '@nestjs/common';
import { literal, Op, WhereOptions } from 'sequelize';
import { Document } from '../document.model';
import { QueryDocumentDto } from '../dto/query-document.dto';

/**
 * Construye condiciones de filtrado multitenant estricto por `companyId` y búsqueda universal profunda
 * en PostgreSQL abarcando columnas estructuradas, JSONB libre (`extracted_data`) y texto completo (`raw_text`).
 */
export const buildDocumentSearchWhere = (
  companyId: number,
  query: QueryDocumentDto,
): WhereOptions<Document> => {
  const scopedCompanyId = Number(companyId);
  if (!Number.isInteger(scopedCompanyId) || scopedCompanyId <= 0) {
    throw new ForbiddenException(
      'Acceso denegado: El filtro de compañía es obligatorio para consultar documentos.',
    );
  }

  const { search, status, source, documentType, dateFrom, dateTo } = query;
  const andConditions: any[] = [{ companyId: scopedCompanyId }];

  if (status) {
    andConditions.push({ status });
  }

  if (source) {
    andConditions.push({ source });
  }

  if (documentType) {
    andConditions.push({ documentType: documentType.toLowerCase().trim() });
  }

  if (dateFrom || dateTo) {
    const dateRange: Record<symbol, string> = {};
    if (dateFrom) dateRange[Op.gte] = dateFrom;
    if (dateTo) dateRange[Op.lte] = dateTo;
    andConditions.push({ documentDate: dateRange });
  }

  if (search && search.trim().length > 0) {
    const cleanTerm = search.trim();
    const wildcard = `%${cleanTerm}%`;
    const likeOp = Op.iLike ? Op.iLike : Op.like;
    const escapedLiteralTerm = cleanTerm.replace(/'/g, "''");

    const orClauses: any[] = [
      { originalName: { [likeOp]: wildcard } },
      { fileName: { [likeOp]: wildcard } },
      { fileHash: { [likeOp]: wildcard } },
      { documentType: { [likeOp]: wildcard } },
      { documentNumber: { [likeOp]: wildcard } },
      { issuerName: { [likeOp]: wildcard } },
      { issuerTaxId: { [likeOp]: wildcard } },
      { recipientName: { [likeOp]: wildcard } },
      { responsiblePerson: { [likeOp]: wildcard } },
      { summary: { [likeOp]: wildcard } },
      { rawText: { [likeOp]: wildcard } },
      literal(`CAST("Document"."extracted_data" AS TEXT) ILIKE '%${escapedLiteralTerm}%'`),
      literal(`CAST("Document"."tags" AS TEXT) ILIKE '%${escapedLiteralTerm}%'`),
      literal(
        `to_tsvector('spanish', coalesce("Document"."raw_text", '') || ' ' || coalesce("Document"."summary", '')) @@ plainto_tsquery('spanish', '${escapedLiteralTerm}')`,
      ),
    ];

    andConditions.push({ [Op.or]: orClauses });
  }

  return { [Op.and]: andConditions };
};
