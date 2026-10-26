import { useState, useCallback } from 'react';
import { useAdjustTokens } from './useAdmin';
import { useToast } from './useToast';
import { getErrorMessage } from '../utils/errors';
import { LIMITS } from '../utils/constants';
import type { User } from '../types';

export function useTokenAdjustment() {
  const { showToast } = useToast();
  const adjustTokens = useAdjustTokens();

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const openModal = useCallback((user: User) => {
    setSelectedUser(user);
    setAmount('');
    setReason('');
  }, []);

  const closeModal = useCallback(() => {
    setSelectedUser(null);
    setAmount('');
    setReason('');
  }, []);

  const handleAdjust = useCallback(async () => {
    if (!selectedUser || !amount.trim() || !reason.trim()) return;

    const trimmedAmount = amount.trim();
    const parsedAmount = Number.parseInt(trimmedAmount, 10);

    // Validate the amount is a valid integer
    if (Number.isNaN(parsedAmount) || !/^-?\d+$/.test(trimmedAmount)) {
      showToast('Please enter a valid integer token amount', 'error');
      return;
    }

    // Check if amount is within acceptable range
    if (parsedAmount < LIMITS.TOKEN_ADJUST_MIN || parsedAmount > LIMITS.TOKEN_ADJUST_MAX) {
      showToast(
        `Amount must be between ${LIMITS.TOKEN_ADJUST_MIN.toLocaleString()} and ${LIMITS.TOKEN_ADJUST_MAX.toLocaleString()}`,
        'error'
      );
      return;
    }

    try {
      const result = await adjustTokens.mutateAsync({
        userId: selectedUser.id,
        data: {
          amount: parsedAmount,
          reason,
        },
      });

      // Check if the adjustment was clamped to zero
      const requestedNewBalance = result.previous_balance + parsedAmount;
      const wasClamped = requestedNewBalance < 0 && result.new_balance === 0;

      if (wasClamped) {
        showToast(
          `Tokens adjusted: ${result.previous_balance} → ${result.new_balance} (clamped to prevent negative balance)`,
          'success'
        );
      } else {
        showToast(
          `Tokens adjusted: ${result.previous_balance} → ${result.new_balance}`,
          'success'
        );
      }
      closeModal();
    } catch (error) {
      console.error('Failed to adjust tokens:', error);
      showToast(getErrorMessage(error), 'error');
    }
  }, [selectedUser, amount, reason, adjustTokens, showToast, closeModal]);

  const isValid = amount.trim().length > 0 && reason.trim().length > 0;

  return {
    selectedUser,
    amount,
    reason,
    setAmount,
    setReason,
    openModal,
    closeModal,
    handleAdjust,
    isLoading: adjustTokens.isPending,
    isValid,
  };
}
