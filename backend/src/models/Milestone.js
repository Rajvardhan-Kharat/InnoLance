import mongoose from 'mongoose';

const milestoneSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true },
    description: { type: String },
    amount: { type: Number, required: true },
    dueDate: { type: Date },
    status: {
      type: String,
      enum: ['pending', 'funded', 'in_progress', 'in_review', 'released', 'disputed'],
      default: 'pending',
    },
    order: { type: Number, default: 0 },

    submissionText: { type: String, default: '' },
    submissionLinks: [{ type: String }],
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

milestoneSchema.index({ project: 1, order: 1 });

const Milestone = mongoose.model('Milestone', milestoneSchema);
export default Milestone;
