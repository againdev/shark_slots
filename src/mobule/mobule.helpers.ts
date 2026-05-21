import { Decimal } from '@prisma/client/runtime/library';
import { Currency, Role } from 'prisma/generated/main-client';
import { RAKEBACK_DEPOSIT_TIERS_BY_CURRENCY } from 'src/currency/currency.constants';

export const MOBULE_PARTNER_YOUTUBER = 'so_yt20';
export const MOBULE_PARTNER_DEFAULT = 'ff4win';
export const DEFAULT_USER_CURRENCY = Currency.EUR;

const RAKEBACK_ACCRUAL_FACTOR = 0.06;

export function resolveUserCurrency(
  currency: Currency | null | undefined,
): Currency {
  return currency ?? DEFAULT_USER_CURRENCY;
}

export function balanceToMinorUnits(balance: number | Decimal): number {
  return Math.round(Number(balance) * 100);
}

export function amountFromMinorUnits(minor: number): number {
  return minor / 100;
}

export function validatePartnerAlias(
  role: Role,
  partnerAlias: string | undefined,
): { ok: true } | { ok: false; message: string } {
  if (!partnerAlias) {
    return { ok: false, message: 'Partner alias is required' };
  }
  if (role === Role.YOUTUBER) {
    if (partnerAlias !== MOBULE_PARTNER_YOUTUBER) {
      return {
        ok: false,
        message: 'Invalid partner alias for special role',
      };
    }
    return { ok: true };
  }
  if (partnerAlias === MOBULE_PARTNER_YOUTUBER) {
    return {
      ok: false,
      message: 'Invalid partner alias for non-special role',
    };
  }
  return { ok: true };
}

export function resolveAggregatorAlias(
  role: Role,
  partnerAlias: string | undefined,
): string {
  if (role === Role.YOUTUBER) {
    return MOBULE_PARTNER_YOUTUBER;
  }
  return partnerAlias ?? MOBULE_PARTNER_DEFAULT;
}

export function currencyMismatchMessage(expected: Currency): string {
  return `Ошибка: валюта должна быть ${expected}.`;
}

/** Как `UserService.calculateUserRakeBack` в main-proj-back. */
export function calculateUserRakeBackPercent(user: {
  deposit: Decimal | number | string | null;
  currency?: Currency | null;
}): number {
  let rakeBackPercent = 0.25;
  const depositNum = Number(user.deposit ?? 0);
  const currency = resolveUserCurrency(user.currency);
  const tiers = RAKEBACK_DEPOSIT_TIERS_BY_CURRENCY[currency];
  for (const tier of tiers) {
    if (depositNum >= tier.minDeposit) {
      rakeBackPercent += tier.addPercent;
    }
  }
  return rakeBackPercent;
}

/** Rakeback на ставку (slots bet) или на выигрыш (slots win) — ×0.06 как в main. */
export function computeRakeBackIncrement(
  amount: number,
  rakeBackPercent: number,
): number {
  const rakeBackAmount = new Decimal(amount)
    .mul(rakeBackPercent / 100)
    .toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
  return rakeBackAmount.toNumber() * RAKEBACK_ACCRUAL_FACTOR;
}
