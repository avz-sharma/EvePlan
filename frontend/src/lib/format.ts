const numberFormat = new Intl.NumberFormat("en-IN");
const moneyFormat = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const lakhFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

/** Format counts using Indian digit grouping. */
export const formatNumber = (value: number) => numberFormat.format(value);
/** Format rupee amounts using Indian grouping and whole-rupee display precision. */
export const formatMoney = (value: number) => moneyFormat.format(value);
/** Use lakh notation for large rupee amounts and full currency formatting otherwise. */
export const formatCompactMoney = (value: number) => value >= 100000 ? `₹${lakhFormat.format(value / 100000)}L` : formatMoney(value);
