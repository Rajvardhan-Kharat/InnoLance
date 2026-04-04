import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  options: [{ type: String, required: true }],
  correctOptionIndex: { type: Number, required: true },
});

const quizSchema = new mongoose.Schema({
  title: { type: String, required: true },
  skillCategory: { type: String, required: true },
  questions: [questionSchema],
  passThreshold: { type: Number, default: 70 }, // percentage
  timeLimitMinutes: { type: Number, default: 15 },
}, { timestamps: true });

export default mongoose.model('Quiz', quizSchema);

