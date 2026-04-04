import express from 'express';
import { body, validationResult } from 'express-validator';
import Project from '../models/Project.js';
import ProjectAssessment from '../models/ProjectAssessment.js';
import ProjectAssessmentAttempt from '../models/ProjectAssessmentAttempt.js';
import { protect, restrictTo } from '../middleware/auth.js';
import User from '../models/User.js';

const router = express.Router();

function sanitizeQuestionsForFreelancer(assessment) {
  return assessment.questions.map((q) => ({
    questionText: q.questionText,
    options: q.options,
  }));
}

function sanitizeQuestionForSetter(q) {
  const options = Array.isArray(q?.options) ? q.options.map((o) => String(o)) : [];
  const correctOptionIndex = Number(q?.correctOptionIndex);
  return {
    questionText: String(q?.questionText || '').trim(),
    options,
    correctOptionIndex,
  };
}

function validateQuestionsInput(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return { ok: false };

  const normalized = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const questionText = String(q?.questionText || '').trim();
    const options = Array.isArray(q?.options) ? q.options.map((o) => String(o).trim()) : [];
    const correctOptionIndex = Number(q?.correctOptionIndex);

    if (!questionText) return { ok: false };
    if (options.length !== 4) return { ok: false };
    if (options.some((o) => !o)) return { ok: false };
    if (!Number.isInteger(correctOptionIndex)) return { ok: false };
    if (correctOptionIndex < 0 || correctOptionIndex > 3) return { ok: false };

    normalized.push({ questionText, options, correctOptionIndex });
  }

  return { ok: true, questions: normalized };
}

async function getBestAttempt({ assessmentId, userId }) {
  return ProjectAssessmentAttempt.findOne({
    projectAssessment: assessmentId,
    user: userId,
    status: 'submitted',
  })
    .sort({ marks: -1, timeUsedMs: 1, submittedAt: 1 })
    .lean();
}

// Create/update assessment definition
router.post(
  '/project/:projectId',
  protect,
  [
    body('enabled').isBoolean(),
    body('questions').optional().isArray(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { enabled } = req.body;
      const project = await Project.findById(req.params.projectId).populate('client', '_id');
      if (!project) return res.status(404).json({ message: 'Project not found' });

      const isSetter = project.client?.toString() === req.user._id.toString() || req.user.role === 'admin';
      if (!isSetter) return res.status(403).json({ message: 'Not allowed' });

      if (!enabled) {
        await ProjectAssessment.deleteOne({ project: project._id }).catch(() => {});
        project.assessmentEnabled = false;
        project.assessment = null;
        await project.save();
        return res.json({ message: 'Assessment disabled' });
      }

      const { ok, questions } = validateQuestionsInput(req.body.questions);
      if (!ok) return res.status(400).json({ message: 'Invalid questions payload' });

      // Fixed rule: totalTimeSeconds = questionCount * 120 seconds (2 minutes each)
      const totalTimeSeconds = questions.length * 120;

      let assessment = await ProjectAssessment.findOne({ project: project._id });
      if (!assessment) {
        assessment = await ProjectAssessment.create({
          project: project._id,
          questions,
          totalTimeSeconds,
          createdBy: req.user._id,
        });
      } else {
        assessment.questions = questions;
        assessment.totalTimeSeconds = totalTimeSeconds;
        assessment.createdBy = req.user._id;
        await assessment.save();
      }

      project.assessmentEnabled = true;
      project.assessment = assessment._id;
      await project.save();

      // Remove old attempts for safety (definition changed).
      await ProjectAssessmentAttempt.deleteMany({ projectAssessment: assessment._id }).catch(() => {});

      res.json({ assessmentId: assessment._id, questionCount: questions.length, totalTimeSeconds });
    } catch (err) {
      res.status(500).json({ message: err.message || 'Failed to update assessment' });
    }
  }
);

// Start assessment attempt (Freelancer)
router.post('/project/:projectId/start', protect, restrictTo('freelancer'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!project.assessmentEnabled || !project.assessment) {
      return res.status(400).json({ message: 'Assessment not enabled for this project' });
    }

    const assessment = await ProjectAssessment.findById(project.assessment).lean();
    if (!assessment) return res.status(400).json({ message: 'Assessment config missing' });

    const now = new Date();

    // Mark expired in-progress attempts so attempts are capped by 3.
    await ProjectAssessmentAttempt.updateMany(
      {
        projectAssessment: assessment._id,
        user: req.user._id,
        status: 'in_progress',
        expiresAt: { $lte: now },
      },
      { $set: { status: 'expired' } }
    ).catch(() => {});

    // Reuse an existing in-progress attempt for simplicity.
    const existing = await ProjectAssessmentAttempt.findOne({
      projectAssessment: assessment._id,
      user: req.user._id,
      status: 'in_progress',
      expiresAt: { $gt: now },
    }).lean();

    const attemptCount = await ProjectAssessmentAttempt.countDocuments({
      projectAssessment: assessment._id,
      user: req.user._id,
      status: { $in: ['submitted', 'expired'] },
    });

    if (!existing && attemptCount >= 3) {
      return res.status(400).json({ message: 'Maximum 3 attempts reached' });
    }
    const totalTimeMs = Number(assessment.totalTimeSeconds) * 1000;

    let attempt = existing;
    if (!attempt) {
      attempt = await ProjectAssessmentAttempt.create({
        projectAssessment: assessment._id,
        user: req.user._id,
        status: 'in_progress',
        startedAt: now,
        expiresAt: new Date(now.getTime() + totalTimeMs),
      });
    }

    res.json({
      attemptId: attempt._id,
      startedAt: attempt.startedAt,
      expiresAt: attempt.expiresAt,
      questions: sanitizeQuestionsForFreelancer(assessment),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Submit assessment attempt (Freelancer)
router.post(
  '/project/:projectId/submit',
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

      const project = await Project.findById(req.params.projectId);
      if (!project) return res.status(404).json({ message: 'Project not found' });
      if (!project.assessmentEnabled || !project.assessment) {
        return res.status(400).json({ message: 'Assessment not enabled for this project' });
      }

      const assessment = await ProjectAssessment.findById(project.assessment).lean();
      if (!assessment) return res.status(400).json({ message: 'Assessment config missing' });

      const { attemptId, answers } = req.body;
      const attempt = await ProjectAssessmentAttempt.findById(attemptId).lean();
      if (!attempt) return res.status(404).json({ message: 'Attempt not found' });
      if (attempt.user.toString() !== req.user._id.toString()) return res.status(403).json({ message: 'Access denied' });
      if (attempt.projectAssessment.toString() !== assessment._id.toString()) {
        return res.status(400).json({ message: 'Attempt does not match this project assessment' });
      }
      if (attempt.status !== 'in_progress') {
        return res.status(400).json({ message: `Attempt is not active (${attempt.status})` });
      }

      if (attempt.expiresAt && new Date() > attempt.expiresAt) {
        await ProjectAssessmentAttempt.findByIdAndUpdate(attemptId, {
          status: 'expired',
        });
        return res.status(400).json({ message: 'Time limit exceeded' });
      }

      if (!Array.isArray(answers)) return res.status(400).json({ message: 'answers must be an array' });
      if (answers.length !== assessment.questions.length) {
        return res.status(400).json({ message: `answers must have exactly ${assessment.questions.length} items` });
      }

      let correctCount = 0;
      for (let i = 0; i < assessment.questions.length; i++) {
        const q = assessment.questions[i];
        const selected = answers[i];
        if (!Number.isInteger(selected)) return res.status(400).json({ message: `Invalid answer at index ${i}` });
        if (selected < 0 || selected > 3) return res.status(400).json({ message: `Answer out of range at index ${i}` });
        if (selected === q.correctOptionIndex) correctCount++;
      }

      const incorrectCount = assessment.questions.length - correctCount;
      const marks = correctCount * 4 - incorrectCount * 1;
      const submittedAt = new Date();
      const startedAt = attempt.startedAt ? new Date(attempt.startedAt) : new Date();
      const timeUsedMs = submittedAt.getTime() - startedAt.getTime();

      // Persist attempt result.
      await ProjectAssessmentAttempt.findByIdAndUpdate(attemptId, {
        status: 'submitted',
        submittedAt,
        marks,
        correctCount,
        incorrectCount,
        timeUsedMs,
      });

      // Return result to freelancer (they may retry up to 3 times).
      res.json({ marks, correctCount, incorrectCount, timeUsedMs });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// My best assessment attempt (Freelancer)
router.get('/project/:projectId/me', protect, restrictTo('freelancer'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!project.assessmentEnabled || !project.assessment) {
      return res.status(400).json({ message: 'Assessment not enabled for this project' });
    }

    const assessmentId = project.assessment;
    const attemptCount = await ProjectAssessmentAttempt.countDocuments({
      projectAssessment: assessmentId,
      user: req.user._id,
      status: 'submitted',
    });

    const best = await getBestAttempt({ assessmentId, userId: req.user._id });
    res.json({ attemptsUsed: attemptCount, best });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Results for test setter (Admin or Project client)
router.get('/project/:projectId/results', protect, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!project.assessmentEnabled || !project.assessment) return res.status(400).json({ message: 'Assessment not enabled' });

    const isSetter = project.client?.toString() === req.user._id.toString() || req.user.role === 'admin';
    if (!isSetter) return res.status(403).json({ message: 'Not allowed' });

    const assessmentId = project.assessment;
    const attempts = await ProjectAssessmentAttempt.find({ projectAssessment: assessmentId, status: 'submitted' })
      .populate('user', 'firstName lastName email')
      .lean();

    // Compute best per user by (marks desc, timeUsedMs asc).
    const bestByUserId = new Map();
    for (const a of attempts) {
      const userId = a.user._id.toString();
      const prev = bestByUserId.get(userId);
      if (!prev) {
        bestByUserId.set(userId, a);
      } else {
        const prevMarks = Number(prev.marks) || -Infinity;
        const nextMarks = Number(a.marks) || -Infinity;
        if (nextMarks > prevMarks) bestByUserId.set(userId, a);
        else if (nextMarks === prevMarks) {
          const prevTime = Number(prev.timeUsedMs) || Number.POSITIVE_INFINITY;
          const nextTime = Number(a.timeUsedMs) || Number.POSITIVE_INFINITY;
          if (nextTime < prevTime) bestByUserId.set(userId, a);
        }
      }
    }

    const bestEntries = Array.from(bestByUserId.values()).sort((a, b) => {
      const am = Number(a.marks) || -Infinity;
      const bm = Number(b.marks) || -Infinity;
      if (bm !== am) return bm - am;
      const at = Number(a.timeUsedMs) || Number.POSITIVE_INFINITY;
      const bt = Number(b.timeUsedMs) || Number.POSITIVE_INFINITY;
      return at - bt;
    });

    res.json({ bestEntries, allAttempts: attempts });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;

