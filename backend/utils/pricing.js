// pricing.js
// Helper functions for applying commission/markup to prices and rounding

const COMMISSION_RATE = parseFloat(process.env.COMMISSION_RATE || '0.01'); // 1% by default

/**
 * Given a base price determine the commission amount and final price.
 * The final price is rounded up to the next multiple of 5 (so it ends in 0 or 5).
 *
 * @param {number} basePrice  The original price from the shop owner
 * @returns {{ basePrice:number, commission:number, finalPrice:number }}
 */
export function applyCommission(basePrice) {
  const priceNum = Number(basePrice) || 0;
  const commission = priceNum * COMMISSION_RATE;
  const raw = priceNum + commission;
  // round up to nearest 5
  const finalPrice = Math.ceil(raw / 5) * 5;
  console.log(`applyCommission: base=${priceNum}, rate=${COMMISSION_RATE}, commission=${commission}, raw=${raw}, final=${finalPrice}`);
  return { basePrice: priceNum, commission, finalPrice };
}

// optionally export rate constant for other modules
export { COMMISSION_RATE };
