export type ApiError = Error & { status?: number };

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api/v1';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  const payload = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && payload.error
        ? payload.error
        : 'Something went wrong. Please try again.';
    const error = new Error(message) as ApiError;
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

export interface User {
  id: string;
  phone: string;
  displayName?: string;
  role?: 'user' | 'admin';
}

export interface AuthResponse {
  user: User;
}

export interface AdminUser {
  id: string;
  phone: string;
  displayName: string;
  status: string;
  role: string;
  createdAt: string;
}

export interface AdminDashboard {
  users: number;
  activeSessions: number;
}

export interface AdminTransaction {
  id: string;
  userId: string;
  type: string;
  status: string;
  amountMinor: number;
  currency: string;
  createdAt: string;
}

export interface Wallet {
  id: string;
  currency: 'KES';
  availableMinor: string;
  lockedMinor: string;
  pendingMinor: string;
  status: 'active' | 'frozen' | 'closed';
}

export type DepositStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'requires_reconciliation'
  | 'requires_review'
  | 'cancelled';

export interface Deposit {
  id: string;
  transactionId: string;
  userId: string;
  walletId: string;
  amountMinor: string;
  currency: 'KES';
  phoneE164: string;
  provider: string;
  providerReference: string | null;
  status: DepositStatus;
  resultCode: number | null;
  resultDescription: string | null;
  journalEntryId: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface SavingsGoal {
  id: string;
  name: string;
  description: string;
  targetMinor: string;
  balanceMinor: string;
  status: string;
  lockUntil: string | null;
  createdAt: string;
}

export type WithdrawalStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'requires_reconciliation'
  | 'requires_review'
  | 'cancelled';

export interface Withdrawal {
  id: string;
  transactionId: string;
  userId: string;
  walletId: string;
  amountMinor: string;
  currency: 'KES';
  phoneE164: string;
  provider: string;
  providerReference: string | null;
  status: WithdrawalStatus;
  resultCode: number | null;
  resultDescription: string | null;
  journalEntryId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const reconcileDeposit = (depositId: string, receiptNumber: string) =>
  request<{ deposit: Deposit }>(`/deposits/${depositId}/reconcile`, {
    method: 'POST',
    body: JSON.stringify({ receiptNumber }),
  });

export const api = {
  getCurrentUser: () => request<AuthResponse>('/auth/me'),
  login: (phone: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password }),
    }),
  register: (displayName: string, phone: string, password: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ displayName, phone, password }),
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  getAdminDashboard: () => request<{ statistics: AdminDashboard }>('/admin/dashboard'),
  getAdminUsers: () => request<{ users: AdminUser[] }>('/admin/users'),
  getAdminUser: (userId: string) => request<{ user: AdminUser }>(`/admin/users/${userId}`),
  getAdminTransactions: () => request<{ transactions: AdminTransaction[] }>('/admin/transactions'),
  getWallet: () => request<{ wallet: Wallet }>('/wallet'),
  getDeposits: () => request<{ deposits: Deposit[] }>('/deposits'),
  createDeposit: (amountMinor: string, phone: string, idempotencyKey: string) =>
    request<{ deposit: Deposit }>('/deposits', {
      method: 'POST',
      body: JSON.stringify({ amountMinor, phone, idempotencyKey }),
    }),
  getSavingsGoals: () => request<{ goals: SavingsGoal[] }>('/savings'),
  createSavingsGoal: (input: { name: string; description: string; targetMinor: string; lockUntil: string | null }) =>
    request<{ goal: SavingsGoal }>('/savings', { method: 'POST', body: JSON.stringify(input) }),
  depositToSavingsGoal: (goalId: string, amountMinor: string) =>
    request<{ journalEntryId: string }>(`/savings/${goalId}/deposit`, { method: 'POST', body: JSON.stringify({ amountMinor }) }),
  withdrawFromSavingsGoal: (goalId: string, amountMinor: string) =>
    request<{ journalEntryId: string }>(`/savings/${goalId}/withdraw`, { method: 'POST', body: JSON.stringify({ amountMinor }) }),
  getWithdrawals: () => request<{ withdrawals: Withdrawal[] }>('/withdrawals'),
  createWithdrawal: (amountMinor: string, phone: string, idempotencyKey: string) =>
    request<{ withdrawal: Withdrawal }>('/withdrawals', {
      method: 'POST',
      body: JSON.stringify({ amountMinor, phone, idempotencyKey }),
    }),
  getWithdrawal: (withdrawalId: string) => request<{ withdrawal: Withdrawal }>(`/withdrawals/${withdrawalId}`),
  reconcileWithdrawal: (withdrawalId: string, receiptNumber: string) =>
    request<{ withdrawal: Withdrawal }>(`/withdrawals/${withdrawalId}/reconcile`, {
      method: 'POST',
      body: JSON.stringify({ receiptNumber }),
    }),
  reconcileDeposit: (depositId: string, receiptNumber: string) =>
    request<{ deposit: Deposit }>(`/deposits/${depositId}/reconcile`, {
      method: 'POST',
      body: JSON.stringify({ receiptNumber }),
    }),
};
