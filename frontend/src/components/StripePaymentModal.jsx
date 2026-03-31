import { useEffect, useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useElements, useStripe } from '@stripe/react-stripe-js';
import api from '../utils/api';
import './StripePaymentModal.css';

function CheckoutForm({ milestoneId, amount, onSuccess, onClose }) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePay = async (e) => {
    e.preventDefault();
    setError('');
    if (!stripe || !elements) return;

    setLoading(true);
    try {
      const { data } = await api.post(`/payments/milestone/${milestoneId}/create-intent`);
      const clientSecret = data.clientSecret;
      const card = elements.getElement(CardElement);
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card },
      });

      if (result.error) {
        setError(result.error.message || 'Payment failed');
        setLoading(false);
        return;
      }
      onSuccess?.();
      onClose?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Payment failed');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handlePay} className="spm-form">
      <div className="spm-row">
        <div className="spm-label">Card details</div>
        <div className="spm-card">
          <CardElement options={{ hidePostalCode: true }} />
        </div>
      </div>
      {error && <div className="spm-error">{error}</div>}
      <div className="spm-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={!stripe || loading}>
          {loading ? 'Processing...' : `Pay ₹${Number(amount).toFixed(2)}`}
        </button>
      </div>
      <p className="spm-footnote">
        This uses Stripe test/live mode depending on your keys.
      </p>
    </form>
  );
}

export default function StripePaymentModal({ open, milestoneId, amount, onPaid, onClose }) {
  const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  const stripePromise = useMemo(() => (stripeKey ? loadStripe(stripeKey) : null), [stripeKey]);
  const [mode, setMode] = useState('demo');
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState('');

  useEffect(() => {
    if (!open) {
      setMode('demo');
      setDemoLoading(false);
      setDemoError('');
    }
  }, [open]);

  if (!open) return null;

  const handleDemoPay = async () => {
    setDemoError('');
    setDemoLoading(true);
    try {
      await api.post(`/payments/milestone/${milestoneId}/demo-pay`);
      onPaid?.();
      onClose?.();
    } catch (err) {
      setDemoError(err.response?.data?.message || 'Payment failed');
      setDemoLoading(false);
    }
  };

  return (
    <div className="spm-overlay" role="dialog" aria-modal="true">
      <div className="spm-modal">
        <div className="spm-head">
          <div>
            <h3>Pay milestone</h3>
            <p className="spm-sub">Choose a payment method</p>
          </div>
          <button type="button" className="spm-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="spm-modes">
          <button
            type="button"
            className={`spm-mode ${mode === 'demo' ? 'active' : ''}`}
            onClick={() => setMode('demo')}
          >
            <div className="spm-mode-title">Demo</div>
            <div className="spm-mode-desc">Instantly marks milestone as paid (for demo)</div>
          </button>
          <button
            type="button"
            className={`spm-mode ${mode === 'card' ? 'active' : ''}`}
            onClick={() => setMode('card')}
            disabled={!stripePromise}
            title={!stripePromise ? 'Set VITE_STRIPE_PUBLISHABLE_KEY to enable card payments' : ''}
          >
            <div className="spm-mode-title">Card (Stripe)</div>
            <div className="spm-mode-desc">Pay securely with card via Stripe</div>
          </button>
        </div>

        {mode === 'demo' && (
          <div className="spm-panel">
            {demoError && <div className="spm-error">{demoError}</div>}
            <div className="spm-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={demoLoading}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleDemoPay} disabled={demoLoading}>
                {demoLoading ? 'Processing...' : `Demo pay ₹${Number(amount).toFixed(2)}`}
              </button>
            </div>
            <p className="spm-footnote">Use this for presentations when Stripe keys aren’t configured.</p>
          </div>
        )}

        {mode === 'card' && stripePromise && (
          <div className="spm-panel">
            <Elements stripe={stripePromise}>
              <CheckoutForm milestoneId={milestoneId} amount={amount} onSuccess={onPaid} onClose={onClose} />
            </Elements>
          </div>
        )}
      </div>
    </div>
  );
}

