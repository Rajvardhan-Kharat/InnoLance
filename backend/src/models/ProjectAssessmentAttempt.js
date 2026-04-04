import mongoose from 'mongoose';

const projectAssessmentAttemptSchema = new mongoose.Schema(
  {
    projectAssessment: { type: mongoose.Schema.Types.ObjectId, ref: 'ProjectAssessment', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    status: { type: String, enum: ['in_progress', 'submitted', 'expired'], default: 'in_progress', index: true },

    startedAt: { type: Date, default: Date.now, index: true },
    expiresAt: { type: Date, index: true },
    submittedAt: { type: Date },

    // Marks and tie-breaker fields.
    marks: { type: Number },
    correctCount: { type: Number },
    incorrectCount: { type: Number },
    timeUsedMs: { type: Number }, // submittedAt - startedAt
  },
  { timestamps: true }
);

// Keep separate attempts; we'll compute best marks at query time.
projectAssessmentAttemptSchema.index({ projectAssessment: 1, user: 1, status: 1 });

export default mongoose.model('ProjectAssessmentAttempt', projectAssessmentAttemptSchema);

