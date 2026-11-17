const FIRST_FACTORS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const SECOND_FACTORS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function normalizeCnpj(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidCnpj(value: string): boolean {
  const digits = normalizeCnpj(value);
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) {
    return false;
  }
  const first = checkDigit(digits.slice(0, 12), FIRST_FACTORS);
  const second = checkDigit(`${digits.slice(0, 12)}${first}`, SECOND_FACTORS);
  return digits.endsWith(`${first}${second}`);
}

function checkDigit(base: string, factors: number[]): number {
  const total = factors.reduce((sum, factor, index) => sum + Number(base[index]) * factor, 0);
  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}
