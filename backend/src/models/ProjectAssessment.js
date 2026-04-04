import mongoose from 'mongoose';

const assessmentQuestionSchema = new mongoose.Schema(
  {
    questionText: { type: String, required: true },
    options: { type: [String], required: true, validate: [v => Array.isArray(v) && v.length === 4, 'options must be 4 items'] },
    correctOptionIndex: { type: Number, required: true, min: 0, max: 3 },
  },
  { _id: false }
);

const projectAssessmentSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, unique: true },

    // Store assessment questions + correct answers. Never send correct answers to freelancers.
    questions: { type: [assessmentQuestionSchema], required: true },

    // Enforced rule: 2 minutes per question (so total time = questionCount * 2 min).
    totalTimeSeconds: { type: Number, required: true, min: 60 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('ProjectAssessment', projectAssessmentSchema);

