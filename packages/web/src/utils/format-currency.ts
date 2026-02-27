/**
 * Format a numeric amount as Italian EUR currency string.
 * Examples:
 *   formatCurrency(1234.56) => "1.234,56 EUR"
 *   formatCurrency(0)       => "0,00 EUR"
 *   formatCurrency(1000000) => "1.000.000,00 EUR"
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Parse an Italian-formatted currency string back to a number.
 * Examples:
 *   parseCurrency("1.234,56 EUR") => 1234.56
 *   parseCurrency("0,00 EUR")     => 0
 */
export function parseCurrency(value: string): number {
  const cleaned = value
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}
