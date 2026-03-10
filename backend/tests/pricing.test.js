import { applyCommission } from '../utils/pricing.js';

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    console.error('Assertion failed:', message, 'expected', expected, 'got', actual);
    process.exit(1);
  }
}

// simple sanity checks
console.log('Running pricing helper tests');

const base = 100;
const { basePrice, commission, finalPrice } = applyCommission(base);
assertEqual(basePrice, 100, 'basePrice should match input');
assertEqual(Math.round(commission * 1000) / 1000, 1.0, 'commission should be 1%');
// raw = 101, rounding up to nearest 5 -> 105
assertEqual(finalPrice, 105, 'finalPrice should round up to 105');

// edge cases
const small = applyCommission(0);
assertEqual(small.finalPrice, 0, 'zero price stays zero');

console.log('pricing helper tests passed');
process.exit(0);
