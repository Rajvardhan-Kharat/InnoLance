import mongoose from 'mongoose';

const quizAttemptSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },

  status: {
    type: String,
    enum: ['in_progress', 'submitted', 'expired'],
    default: 'in_progress',
    index: true,
  },

  // Server-side timing fields for timed quiz enforcement.
  startedAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, index: true },
  submittedAt: { type: Date },

  scorePercentage: { type: Number },
  passed: { type: Boolean },
}, { timestamps: true });

// Only one active attempt at a time per quiz/user.
quizAttemptSchema.index(
  { user: 1, quiz: 1, status: 1 },
  { unique: false }
);

export default mongoose.model('QuizAttempt', quizAttemptSchema);

