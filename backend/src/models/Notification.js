import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: [
        'proposal_received',
        'proposal_accepted',
        'proposal_rejected',
        'new_message',
        'milestone_submitted',
        'milestone_released',
        'project_completed',
        'wallet_credit',
        'wallet_debit',
      ],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String },
    link: { type: String }, // e.g. /projects/xxx or /messages
    read: { type: Boolean, default: false },
    meta: { type: mongoose.Schema.Types.Mixed }, // projectId, proposalId, etc.
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
