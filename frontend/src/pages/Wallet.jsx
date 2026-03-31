import { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import './Wallet.css';

function formatINR(amount) {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `₹${Number(amount || 0).toFixed(2)}`;
  }
}

export default function Wallet() {
  const { balanceINR, transactions, topup, withdraw } = useWallet();
  const [topupAmount, setTopupAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const onTopup = async (e) => {
    e.preventDefault();
    setMsg('');
    setBusy(true);
    try {
      await topup(Number(topupAmount));
      setTopupAmount('');
      setMsg('Top-up successful.');
    } catch (err) {
      setMsg(err.response?.data?.message || 'Top-up failed');
    } finally {
      setBusy(false);
    }
  };

  const onWithdraw = async (e) => {
    e.preventDefault();
    setMsg('');
    setBusy(true);
    try {
      await withdraw(Number(withdrawAmount));
      setWithdrawAmount('');
      setMsg('Withdrawal requested.');
    } catch (err) {
      setMsg(err.response?.data?.message || 'Withdrawal failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wallet-page">
      <div className="wallet-hero">
        <div>
          <h1>Wallet</h1>
          <p className="page-sub">Your platform balance in INR.</p>
        </div>
        <div className="wallet-balance">
          <div className="wallet-balance-label">Available balance</div>
          <div className="wallet-balance-value">{formatINR(balanceINR)}</div>
        </div>
      </div>

      {msg && <div className="wallet-msg">{msg}</div>}

      <div className="wallet-grid">
        <section className="wallet-card">
          <h2>Add money</h2>
          <form onSubmit={onTopup} className="wallet-form">
            <label>Amount (INR)</label>
            <input
              type="number"
              min="1"
              step="1"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              placeholder="e.g. 1000"
              required
            />
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Processing...' : 'Top up (demo)'}
            </button>
          </form>
          <p className="hint">Demo top-up for now. Later we can connect Stripe/UPI.</p>
        </section>

        <section className="wallet-card">
          <h2>Withdraw</h2>
          <form onSubmit={onWithdraw} className="wallet-form">
            <label>Amount (INR)</label>
            <input
              type="number"
              min="1"
              step="1"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="e.g. 500"
              required
            />
            <button type="submit" className="btn btn-ghost" disabled={busy}>
              {busy ? 'Processing...' : 'Withdraw (demo)'}
            </button>
          </form>
          <p className="hint">Demo withdrawal. In production this would go to a bank/UPI account.</p>
        </section>
      </div>

      <section className="wallet-card wallet-txns">
        <div className="wallet-txns-head">
          <h2>Recent transactions</h2>
        </div>
        {transactions.length === 0 ? (
          <div className="empty-state">No transactions yet.</div>
        ) : (
          <div className="txns">
            {transactions.map((t) => (
              <div key={t._id} className="txn">
                <div>
                  <div className="txn-title">{t.title || t.type}</div>
                  <div className="txn-sub">{new Date(t.createdAt).toLocaleString()}</div>
                </div>
                <div className={`txn-amt ${t.direction === 'credit' ? 'credit' : 'debit'}`}>
                  {t.direction === 'credit' ? '+' : '-'}{formatINR((t.amountPaise || 0) / 100)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

