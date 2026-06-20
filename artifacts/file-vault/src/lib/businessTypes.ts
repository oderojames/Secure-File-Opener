export const BUSINESS_TYPES = [
  'Grocery & FMCG',
  'Electronics & Tech',
  'Clothing & Fashion',
  'Hardware & Construction',
  'Pharmacy & Healthcare',
  'Agriculture & Farming',
  'Food & Beverages',
  'Education & Stationery',
  'Beauty & Cosmetics',
  'Other',
] as const;

export type BusinessType = typeof BUSINESS_TYPES[number] | string;
