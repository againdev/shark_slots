import { Currency } from 'prisma/generated/main-client';

/** Базовая конвертация для констант: 1 USD, 1 EUR = 1.1 USD, 40 UAH = 1 USD. */
const BASE_FX_EUR_IN_USD = 1.1;
const BASE_FX_UAH_PER_USD = 40;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function eurFromUsd(usdAmount: number): number {
  const v = usdAmount / BASE_FX_EUR_IN_USD;
  if (usdAmount <= 0.01) return v;
  if (usdAmount < 1) return Math.round(v * 10000) / 10000;
  return roundMoney(v);
}

export function nominalFromUsd(usdAmount: number, currency: Currency): number {
  switch (currency) {
    case Currency.USD:
      return roundMoney(usdAmount);
    case Currency.EUR:
      return eurFromUsd(usdAmount);
    case Currency.UAH:
      return roundMoney(usdAmount * BASE_FX_UAH_PER_USD);
  }
}

const RAKEBACK_TIERS_USD: readonly {
  minDeposit: number;
  addPercent: number;
}[] = [
  { minDeposit: 100, addPercent: 0.1 },
  { minDeposit: 500, addPercent: 0.2 },
  { minDeposit: 1000, addPercent: 0.3 },
  { minDeposit: 5000, addPercent: 0.5 },
  { minDeposit: 10000, addPercent: 1 },
  { minDeposit: 50000, addPercent: 2 },
  { minDeposit: 100000, addPercent: 3 },
];

function buildRakebackTiers(
  currency: Currency,
): ReadonlyArray<{ minDeposit: number; addPercent: number }> {
  return RAKEBACK_TIERS_USD.map((t) => ({
    minDeposit: nominalFromUsd(t.minDeposit, currency),
    addPercent: t.addPercent,
  }));
}

/** Пороги rakeback по сумме депозита — как в main-proj-back `user.service.calculateUserRakeBack`. */
export const RAKEBACK_DEPOSIT_TIERS_BY_CURRENCY: Record<
  Currency,
  ReadonlyArray<{ minDeposit: number; addPercent: number }>
> = {
  [Currency.USD]: buildRakebackTiers(Currency.USD),
  [Currency.EUR]: buildRakebackTiers(Currency.EUR),
  [Currency.UAH]: buildRakebackTiers(Currency.UAH),
};
