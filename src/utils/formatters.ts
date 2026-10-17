export function formatINR(val: number): string {
  return new Intl.NumberFormat('en-IN').format(Math.round(val || 0));
}

export function formatLakhs(val: number): string {
  const lakhs = (val || 0) / 100000;
  return `₹${lakhs.toFixed(1)}L`;
}

export function formatCrores(val: number): string {
  const cr = (val || 0) / 10000000;
  return `₹${cr.toFixed(2)} Cr`;
}

// Payment of Gratuity Act 1972 statutory tenure rounding:
// If service fraction >= 6 months (0.5 years), round UP to next completed year.
export function computeStatutoryGratuity(basicSalary: number, tenureYears: number): {
  gratuity: number;
  roundedTenure: number;
  eligible: boolean;
} {
  const fraction = tenureYears - Math.floor(tenureYears);
  const roundedTenure = fraction >= 0.5 ? Math.ceil(tenureYears) : Math.floor(tenureYears);
  
  if (roundedTenure < 5) {
    return { gratuity: 0, roundedTenure, eligible: false };
  }

  // Statutory Formula: (15 * Last Basic * Rounded Tenure) / 26
  const rawGratuity = Math.round((15 * basicSalary * roundedTenure) / 26);
  // Statutory ceiling cap of ₹20,00,000 (Payment of Gratuity Amendment Act 2018)
  const cappedGratuity = Math.min(rawGratuity, 2000000);

  return { gratuity: cappedGratuity, roundedTenure, eligible: true };
}
