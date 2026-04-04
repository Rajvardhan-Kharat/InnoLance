import mongoose from 'mongoose';

const proposalSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    coverLetter: { type: String, required: true },
    bidAmount: { type: Number, required: true },
    estimatedDays: { type: Number },
    status: { type: String, enum: ['pending', 'accepted', 'rejected', 'withdrawn'], default: 'pending' },
    resume: {
      url: String,
      name: String,
      mime: String,
      size: Number,
    },
    attachments: [{ url: String, name: String }],
    aiScore: { type: Number, min: 1, max: 100 },
    aiFeedback: { type: String },

    // Assessment (quiz) marks used for ranking test setter.
    assessmentMarks: { type: Number },
    assessmentTimeUsedMs: { type: Number },
    assessmentAttempt: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectAssessmentAttempt' },
  },
  { timestamps: true }
);

proposalSchema.index({ project: 1, freelancer: 1 }, { unique: true });
proposalSchema.index({ freelancer: 1, status: 1 });

const Proposal = mongoose.model('Proposal', proposalSchema);
export default Proposal;
