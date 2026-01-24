// src/hooks/useChapa.js
// Chapa integration removed — this hook now provides no-op functions
export const useChapa = () => {
  const initializePayment = async () => {
    return { success: false, error: 'Chapa integration removed' };
  };

  const verifyPayment = async () => {
    return { success: false, error: 'Chapa integration removed' };
  };

  return {
    initializePayment,
    verifyPayment,
    isProcessing: false,
    error: null,
    clearError: () => {}
  };
};