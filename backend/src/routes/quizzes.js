import express from 'express';
import { body, validationResult } from 'express-validator';
import Quiz from '../models/Quiz.js';
import QuizAttempt from '../models/QuizAttempt.js';
import User from '../models/User.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { generateQuizQuestions } from '../services/aiQuizGenerator.js';

const router = express.Router();

// GET all quizzes (Admin)
router.get('/', protect, async (req, res) => {
  try {
    const quizzes = await Quiz.find().lean();
    res.json({ quizzes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET active quizzes available to take (Freelancers)
router.get('/available', protect, async (req, res) => {
  try {
    // Hide correct answers from freelancers.
    const quizzes = await Quiz.find().select('-questions.correctOptionIndex').lean();
    res.json({ quizzes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET single quiz details for taking
router.get('/:id/take', protect, async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id)
      .select('-questions.correctOptionIndex') // Hide answers
      .lean();
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });
    res.json({ quiz });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST Start a new quiz attempt (Freelancer)
router.post('/:id/start', protect, restrictTo('freelancer'), async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id).lean();
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    const timeLimitMinutes = Number(quiz.timeLimitMinutes || 0);
    if (!Number.isFinite(timeLimitMinutes) || timeLimitMinutes <= 0) {
      return res.status(400).json({ message: 'Quiz time limit is invalid' });
    }

    const now = new Date();
    const timeLimitMs = timeLimitMinutes * 60 * 1000;

    // Reuse an existing in-progress attempt if it hasn't expired yet.
    const existing = await QuizAttempt.findOne({
      user: req.user._id,
      quiz: quiz._id,
      status: 'in_progress',
      expiresAt: { $gt: now },
    }).lean();

    let attempt;
    if (existing) {
      attempt = existing;
    } else {
      attempt = await QuizAttempt.create({
        user: req.user._id,
        quiz: quiz._id,
        status: 'in_progress',
        startedAt: now,
        expiresAt: new Date(now.getTime() + timeLimitMs),
      });
    }

    // Send quiz content without correct answers.
    const quizWithoutAnswers = {
      _id: quiz._id,
      title: quiz.title,
      skillCategory: quiz.skillCategory,
      passThreshold: quiz.passThreshold,
      timeLimitMinutes: quiz.timeLimitMinutes,
      questions: (quiz.questions || []).map((q) => ({
        questionText: q.questionText,
        options: q.options,
      })),
    };

    res.json({
      attemptId: attempt._id,
      startedAt: attempt.startedAt,
      expiresAt: attempt.expiresAt,
      quiz: quizWithoutAnswers,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST AI-generate questions for a skill category (Admin)
router.post(
  '/ai/generate-questions',
  protect,
  restrictTo('admin', 'client'),
  [
    body('skillCategory').trim().notEmpty(),
    body('questionCount').optional().isInt({ min: 1, max: 20 }).toInt(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { skillCategory } = req.body;
      const questionCount = req.body.questionCount ?? 5;

      const questions = await generateQuizQuestions({ skillCategory, questionCount });
      res.json({ questions });
    } catch (err) {
      res.status(500).json({ message: err.message || 'Failed to generate quiz questions' });
    }
  }
);

// POST Create a new Quiz (Admin)
router.post('/', protect, restrictTo('admin'), async (req, res) => {
  try {
    const { title, skillCategory, questions, passThreshold, timeLimitMinutes } = req.body;
    if (!questions || questions.length === 0) {
      return res.status(400).json({ message: 'At least one question required' });
    }

    // Basic structural validation to prevent broken quizzes.
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q?.questionText || typeof q.questionText !== 'string') {
        return res.status(400).json({ message: `Question ${i + 1} is missing questionText` });
      }
      if (!Array.isArray(q.options) || q.options.length < 2) {
        return res.status(400).json({ message: `Question ${i + 1} must have at least 2 options` });
      }
      if (!Number.isInteger(q.correctOptionIndex) || q.correctOptionIndex < 0 || q.correctOptionIndex >= q.options.length) {
        return res.status(400).json({ message: `Question ${i + 1} has an invalid correctOptionIndex` });
      }
    }

    const pass = Number(passThreshold);
    if (!Number.isFinite(pass) || pass < 1 || pass > 100) {
      return res.status(400).json({ message: 'passThreshold must be between 1 and 100' });
    }

    const timeLimit = Number(timeLimitMinutes);
    if (!Number.isFinite(timeLimit) || timeLimit <= 0) {
      return res.status(400).json({ message: 'timeLimitMinutes must be a positive number' });
    }

    const quiz = await Quiz.create({
      title,
      skillCategory,
      questions,
      passThreshold: pass,
      timeLimitMinutes: timeLimit,
    });
    res.status(201).json({ quiz });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST Submit Quiz Attempt (Freelancer)
router.post(
  '/:id/attempt',
  protect,
  restrictTo('freelancer'),
  [
    body('attemptId').isMongoId(),
    body('answers').isArray(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { attemptId, answers } = req.body;

      const attempt = await QuizAttempt.findById(attemptId).populate('quiz');
      if (!attempt) return res.status(404).json({ message: 'Attempt not found' });
      if (attempt.quiz?._id.toString() !== req.params.id.toString()) {
        return res.status(400).json({ message: 'Attempt does not match this quiz' });
      }
      if (attempt.user.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
      if (attempt.status !== 'in_progress') {
        return res.status(400).json({ message: `Attempt is not active (${attempt.status})` });
      }

      if (attempt.expiresAt && new Date() > attempt.expiresAt) {
        attempt.status = 'expired';
        attempt.submittedAt = new Date();
        attempt.scorePercentage = 0;
        attempt.passed = false;
        await attempt.save();
        return res.status(400).json({ message: 'Time limit exceeded' });
      }

      const quiz = await Quiz.findById(req.params.id);
      if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

      if (!Array.isArray(answers)) return res.status(400).json({ message: 'answers must be an array' });
      if (answers.length !== quiz.questions.length) {
        return res.status(400).json({ message: `answers must have exactly ${quiz.questions.length} items` });
      }

      // Ensure answers are well-formed option indexes.
      for (let qi = 0; qi < quiz.questions.length; qi++) {
        const q = quiz.questions[qi];
        const selected = answers[qi];
        if (!Number.isInteger(selected)) {
          return res.status(400).json({ message: `Invalid answer for question ${qi + 1}` });
        }
        if (selected < 0 || selected >= (q.options?.length || 0)) {
          return res.status(400).json({ message: `Answer out of range for question ${qi + 1}` });
        }
      }

      let correctCount = 0;
      quiz.questions.forEach((q, idx) => {
        if (answers[idx] === q.correctOptionIndex) correctCount++;
      });

      const scorePercentage = (correctCount / quiz.questions.length) * 100;
      const passed = scorePercentage >= quiz.passThreshold;

      attempt.scorePercentage = scorePercentage;
      attempt.passed = passed;
      attempt.status = 'submitted';
      attempt.submittedAt = new Date();
      await attempt.save();

      // If passed, grant verified skill.
      if (passed) {
        await User.findByIdAndUpdate(req.user._id, {
          $addToSet: { verifiedSkills: quiz.skillCategory },
        });
      }

      res.json({
        score: scorePercentage,
        passed,
        message: passed
          ? `Congratulations, you are now verified in ${quiz.skillCategory}!`
          : 'You did not pass. Try again later.',
      });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

export default router;

