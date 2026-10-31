const numberFormat = new Intl.NumberFormat("en-IN");
const moneyFormat = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const lakhFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

export const formatNumber = (value: number) => numberFormat.format(value);
export const formatMoney = (value: number) => moneyFormat.format(value);
export const formatCompactMoney = (value: number) => value >= 100000 ? `₹${lakhFormat.format(value / 100000)}L` : formatMoney(value);
