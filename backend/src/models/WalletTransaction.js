import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    direction: { type: String, enum: ['credit', 'debit'], required: true },
    amountPaise: { type: Number, required: true, min: 1 },
    balanceAfterPaise: { type: Number, required: true },
    type: {
      type: String,
      enum: ['topup', 'withdraw', 'proposal_accept_debit', 'proposal_accept_credit', 'platform_fee'],
      required: true,
      index: true,
    },
    title: { type: String, default: '' },
    meta: { type: Object, default: {} },
  },
  { timestamps: true }
);

walletTransactionSchema.index({ user: 1, createdAt: -1 });

const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);
export default WalletTransaction;

