/** Menu prices are Regular prices; round each portion to the nearest paise. */
export function portionPrice(price: string | number, size: string): number {
  const paise = Math.round(Number(price) * 100);
  return (size === "Large" ? Math.round((paise * 3) / 2) : paise) / 100;
}
