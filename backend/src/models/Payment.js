import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    milestone: { type: mongoose.Schema.Types.ObjectId, ref: 'Milestone' },
    payer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    payee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true }, // in smallest unit for gateway (paise for INR)
    currency: { type: String, default: 'inr' },
    type: { type: String, enum: ['milestone', 'hourly', 'bonus'], required: true },
    status: { type: String, enum: ['pending', 'held', 'released', 'refunded', 'failed'], default: 'pending' },
    stripePaymentIntentId: { type: String },
    stripeTransferId: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

paymentSchema.index({ project: 1 });
paymentSchema.index({ milestone: 1 });
paymentSchema.index({ stripePaymentIntentId: 1 });

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
