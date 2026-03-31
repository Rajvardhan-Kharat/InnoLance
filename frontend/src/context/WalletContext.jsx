import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import { useAuth } from './AuthContext';

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const { user } = useAuth();
  const [balancePaise, setBalancePaise] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  const balanceINR = useMemo(() => (balancePaise / 100), [balancePaise]);

  const refreshWallet = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [b, t] = await Promise.all([
        api.get('/wallet/balance'),
        api.get('/wallet/transactions', { params: { limit: 10 } }),
      ]);
      setBalancePaise(b.data.balancePaise || 0);
      setTransactions(t.data.transactions || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setBalancePaise(0);
      setTransactions([]);
      return;
    }
    refreshWallet().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id]);

  const topup = async (amountINR) => {
    const { data } = await api.post('/wallet/topup', { amountINR });
    setBalancePaise(data.balancePaise || 0);
    await refreshWallet();
    return data;
  };

  const withdraw = async (amountINR) => {
    const { data } = await api.post('/wallet/withdraw', { amountINR });
    setBalancePaise(data.balancePaise || 0);
    await refreshWallet();
    return data;
  };

  return (
    <WalletContext.Provider value={{
      balancePaise,
      balanceINR,
      transactions,
      loading,
      refreshWallet,
      topup,
      withdraw,
    }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

