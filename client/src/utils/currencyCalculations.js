/**
* Calculate Buy and Sell rates for a currency pair with margin
* 
* This function computes the exchange rates considering margin application
* on both currencies in a cross-currency pair (e.g., USD → AUD via EUR).
* 
* @param {number} baseTo - Exchange rate from EUR to target currency (e.g., EUR→AUD)
* @param {number} baseFrom - Exchange rate from EUR to source currency (e.g., EUR→USD)
* @param {number} marginTo - Margin value for target currency (0-1, e.g., 0.05 = 5%)    |
* @param {number} marginFrom - Margin value for source currency (0-1, e.g., 0.05 = 5%)  |
* 
* @returns {Object} Object containing:
*   - buy: Rate at which bank sells source currency (client buys source, pays target)
*   - sell: Rate at which bank buys source currency (client sells source, gets target)
*   - origin: Original rate without margin (baseTo / baseFrom)
**/

export function calculatePairRates(baseTo, baseFrom, marginTo, marginFrom) {
  // Ensure valid inputs
  if (!baseTo || !baseFrom || baseTo <= 0 || baseFrom <= 0) {
    return { buy: null, sell: null, origin: null };
  }

  // Default margins to 0 if not provided (there should not be such case)
  const mTo = marginTo || 0;
  const mFrom = marginFrom || 0;

  // Calculate origin rate (without margin)
  const origin = baseTo / baseFrom;

  // If margins are equal (NOW it is the only one case), use optimized formula
  if (mTo === mFrom) {
    const halfMargin = mTo / 2;
    const multiplier = (1 + halfMargin) / (1 - halfMargin);
    
    return {
      buy: Number(origin * multiplier),
      sell: Number(origin / multiplier),
      origin: Number(origin)
    };
  }

  // Different margins: use full formula
  // Buy: client buys source currency (pays more target currency)
  const eurTo_sell = baseTo * (1 + mTo / 2);
  const eurFrom_buy = baseFrom * (1 - mFrom / 2);
  const buy = eurTo_sell / eurFrom_buy;

  // Sell: client sells source currency (gets less target currency)
  const eurTo_buy = baseTo * (1 - mTo / 2);
  const eurFrom_sell = baseFrom * (1 + mFrom / 2);
  const sell = eurTo_buy / eurFrom_sell;

  return {
    buy: Number(buy),
    sell: Number(sell),
    origin: Number(origin)
  };
}


/**
* Calculate only Sell rate (for Converter component)
* This is optimized version when only sell rate is needed
* 
* @param {number} baseTo - Exchange rate from EUR to target currency
* @param {number} baseFrom - Exchange rate from EUR to source currency
* @param {number} marginTo - Margin value for target currency
* @param {number} marginFrom - Margin value for source currency
* @returns {number|null} Sell rate or null if invalid inputs
**/
export function calculateSellRate(baseTo, baseFrom, marginTo, marginFrom) {
  if (!baseTo || !baseFrom || baseTo <= 0 || baseFrom <= 0) {
    return null;
  }

  const mTo = marginTo || 0;
  const mFrom = marginFrom || 0;

  const eurTo_buy = baseTo * (1 - mTo / 2);
  const eurFrom_sell = baseFrom * (1 + mFrom / 2);
  
  return Number(eurTo_buy / eurFrom_sell);
}
