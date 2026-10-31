import { Injectable, Logger } from '@nestjs/common';
import { Plan } from '../plan.model';

export interface PlanPublicWithExchangeRate {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  priceMonthly: number; // Siempre en PESOS (ARS), redondeado hacia arriba
  currency: 'ARS';
  originalPrice: number;
  originalCurrency: 'ARS' | 'USD';
  exchangeRate: number;
  isTrial: boolean;
  trialDays: number | null;
  maxUsers: number | null;
  maxDocuments: number | null;
  maxStorageMb: number | null;
  maxAiQueriesMonthly: number | null;
  includedModules: string[];
  badgeColor: string;
  isDefault: boolean;
}

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  // Fallback por defecto si no hay conexión a internet o la API externa falla
  private readonly defaultRate = process.env.USD_EXCHANGE_RATE
    ? Number(process.env.USD_EXCHANGE_RATE)
    : 1250;

  private cachedRate: number | null = null;
  private lastFetchedAt = 0;
  private readonly cacheTtlMs = 30 * 60 * 1000; // 30 minutos

  /**
   * Obtiene la cotización oficial del dólar (venta) en Argentina.
   * Utiliza la API pública de dolarapi.com con caché en memoria y fallback seguro.
   */
  async getUsdRate(): Promise<number> {
    const now = Date.now();
    if (this.cachedRate && now - this.lastFetchedAt < this.cacheTtlMs) {
      return this.cachedRate;
    }

    try {
      // Usar AbortSignal con timeout de 3.5 segundos para evitar bloqueos
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const response = await fetch('https://dolarapi.com/v1/dolares/oficial', {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as { venta?: number; compra?: number };
        const rate = Number(data.venta || data.compra);
        if (rate && !isNaN(rate) && rate > 0) {
          this.cachedRate = rate;
          this.lastFetchedAt = now;
          this.logger.log(`[ExchangeRateService] Cotización USD Oficial obtenida con éxito: $${rate} ARS`);
          return rate;
        }
      }
    } catch (error: any) {
      this.logger.warn(
        `[ExchangeRateService] No se pudo consultar la API de cotización USD (${error.message}). Se usará cotización de referencia: $${this.defaultRate} ARS`,
      );
    }

    // Fallback si la API no respondió o dio error
    return this.cachedRate || this.defaultRate;
  }

  /**
   * Transforma un Plan para su visualización pública en la web,
   * garantizando que el precio mensual esté SIEMPRE expresado en PESOS (ARS),
   * aplicando la cotización y redondeado hacia arriba (Math.ceil).
   */
  async formatPlanForPublicWeb(plan: Plan): Promise<PlanPublicWithExchangeRate> {
    const usdRate = await this.getUsdRate();
    const rawPrice = Number(plan.priceMonthly || 0);
    const planCurrency = (plan.currency || 'ARS') as 'ARS' | 'USD';

    let finalPriceInPesos: number;
    if (planCurrency === 'USD') {
      // Multiplica el precio en dólares por la cotización y redondea hacia arriba
      finalPriceInPesos = Math.ceil(rawPrice * usdRate);
    } else {
      // Si ya está en pesos, redondea hacia arriba el valor
      finalPriceInPesos = Math.ceil(rawPrice);
    }

    return {
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      priceMonthly: finalPriceInPesos,
      currency: 'ARS',
      originalPrice: rawPrice,
      originalCurrency: planCurrency,
      exchangeRate: usdRate,
      isTrial: Boolean(plan.isTrial),
      trialDays: plan.trialDays ?? null,
      maxUsers: plan.maxUsers,
      maxDocuments: plan.maxDocuments,
      maxStorageMb: plan.maxStorageMb,
      maxAiQueriesMonthly: plan.maxAiQueriesMonthly,
      includedModules: plan.includedModules || [],
      badgeColor: plan.badgeColor || 'primary',
      isDefault: Boolean(plan.isDefault),
    };
  }
}

