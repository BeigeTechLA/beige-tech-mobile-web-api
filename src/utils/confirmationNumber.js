/**
 * Generate confirmation number in format: #BG-YYYYMMDD-NNN
 * @returns {string} Confirmation number
 */
const generateConfirmationNumber = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  // Generate random 3-digit number
  const randomNum = String(Math.floor(Math.random() * 900) + 100);

  return `#BG-${year}${month}${day}-${randomNum}`;
};

module.exports = { generateConfirmationNumber };
