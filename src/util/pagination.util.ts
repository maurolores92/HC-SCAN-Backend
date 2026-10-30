export interface PaginationResponse<T = any> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  category?: string;
}

export interface PaginationOptions {
  order: [string, 'asc' | 'desc'][];
  offset: number;
  limit: number;
  attributes?: any;
}

export class PaginationUtil {
  static toPaginationResponse<T>(
    data: { rows: T[]; count: number },
    page: number,
    pageSize: number,
  ): PaginationResponse<T> {
    return {
      data: data.rows,
      total: data.count,
      page,
      pageSize,
      totalPages: Math.ceil(data.count / pageSize),
    };
  }

  static getByQuery(query: PaginationQuery): PaginationOptions {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 25;
    const sortBy = query.sortBy || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';

    // 1-indexed: Page 1 = Offset 0
    const offset = (page - 1) * pageSize;
    const limit = pageSize;

    return {
      order: [[sortBy, sortOrder]],
      offset,
      limit,
    };
  }
}
