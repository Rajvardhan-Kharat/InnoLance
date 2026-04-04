import express from 'express';
import { body, query, validationResult } from 'express-validator';
import Project from '../models/Project.js';
import Proposal from '../models/Proposal.js';
import Notification from '../models/Notification.js';
import { protect, restrictTo } from '../middleware/auth.js';
import ProjectAssessment from '../models/ProjectAssessment.js';
import ProjectAssessmentAttempt from '../models/ProjectAssessmentAttempt.js';

const router = express.Router();

router.get(
  '/',
  async (req, res) => {
    try {
      const {
        status = 'open',
        category,
        skills,
        budgetType,
        duration,
        search,
        minBudget,
        maxBudget,
        sort = 'newest',
        page = 1,
        limit = 12,
      } = req.query;
      const q = { status };
      if (category) q.category = category;
      if (budgetType) q.budgetType = budgetType;
      if (duration) q.duration = duration;
      if (skills) q.skills = { $in: skills.split(',').map((s) => s.trim()) };
      if (search) q.$or = [{ title: new RegExp(search, 'i') }, { description: new RegExp(search, 'i') }];

      const min = minBudget !== undefined && minBudget !== '' ? Number(minBudget) : null;
      const max = maxBudget !== undefined && maxBudget !== '' ? Number(maxBudget) : null;
      if ((min !== null && Number.isNaN(min)) || (max !== null && Number.isNaN(max))) {
        return res.status(400).json({ message: 'minBudget/maxBudget must be numbers' });
      }
      if (min !== null || max !== null) {
        // Works for both fixed (budget) and hourly (budget + optional budgetMax).
        // For hourly ranges, we match projects where either end of the range intersects.
        const budgetClauses = [];
        if (min !== null && max !== null) {
          budgetClauses.push(
            { budget: { $gte: min, $lte: max } },
            { budgetMax: { $gte: min, $lte: max } },
            { $and: [{ budget: { $lte: min } }, { budgetMax: { $gte: max } }] }
          );
        } else if (min !== null) {
          budgetClauses.push(
            { budget: { $gte: min } },
            { budgetMax: { $gte: min } }
          );
        } else if (max !== null) {
          budgetClauses.push(
            { budget: { $lte: max } },
            { budgetMax: { $lte: max } }
          );
        }
        if (budgetClauses.length > 0) q.$and = [...(q.$and || []), { $or: budgetClauses }];
      }

      const sortMap = {
        newest: { createdAt: -1 },
        budget_low: { budget: 1, createdAt: -1 },
        budget_high: { budget: -1, createdAt: -1 },
      };
      const sortObj = sortMap[sort] || sortMap.newest;
      const projects = await Project.find(q)
        .populate('client', 'firstName lastName companyName avatar')
        .sort(sortObj)
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean();
      const total = await Project.countDocuments(q);
      res.json({ projects, total, page: Number(page), pages: Math.ceil(total / limit) });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

router.get('/my', protect, async (req, res) => {
  try {
    const isClient = req.user.role === 'client' || req.user.role === 'admin';
    const q = isClient ? { client: req.user._id } : { freelancer: req.user._id };
    const projects = await Project.find(q)
      .populate(isClient ? 'freelancer' : 'client', 'firstName lastName companyName avatar headline')
      .sort({ updatedAt: -1 })
      .lean();
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('client', 'firstName lastName companyName avatar')
      .populate('freelancer', 'firstName lastName avatar headline skills hourlyRate')
      .lean();
    if (!project) return res.status(404).json({ message: 'Project not found' });
    const proposalCount = await Proposal.countDocuments({ project: project._id, status: 'pending' });
    res.json({ project, proposalCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post(
  '/',
  protect,
  restrictTo('client'),
  [
    body('title').trim().notEmpty(),
    body('description').trim().notEmpty(),
    body('category').trim().notEmpty(),
    body('budgetType').isIn(['fixed', 'hourly']),
    body('budget').optional().isNumeric(),
    body('budgetMax').optional().isNumeric(),
    body('duration').optional().isIn(['<1week', '1-4weeks', '1-3months', '3+months']),
    body('deadline').optional().isISO8601(),
    body('skills').optional().isArray(),
    body('weeklyMinMinutes').optional().isInt({ min: 0 }),
    body('weeklyMaxMinutes').optional().isInt({ min: 0 }),

    body('assessmentEnabled').optional().isBoolean(),
    body('assessmentQuestions').optional().isArray(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      if (req.body.weeklyMinMinutes !== undefined && req.body.weeklyMaxMinutes !== undefined) {
        if (Number(req.body.weeklyMinMinutes) > Number(req.body.weeklyMaxMinutes)) {
          return res.status(400).json({ message: 'weeklyMinMinutes cannot be greater than weeklyMaxMinutes' });
        }
      }
      const {
        assessmentEnabled,
        assessmentQuestions,
        ...projectBody
      } = req.body;

      const project = await Project.create({ ...projectBody, client: req.user._id });

      // Optional: create assessment definition (questions + correct answers).
      if (assessmentEnabled === true) {
        const questions = Array.isArray(assessmentQuestions) ? assessmentQuestions : [];
        if (questions.length === 0) {
          return res.status(400).json({ message: 'assessmentQuestions must be provided when assessmentEnabled is true' });
        }

        // Validate each question quickly (assumes 4-option MCQ).
        const normalized = [];
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i] || {};
          const questionText = String(q.questionText || '').trim();
          const options = Array.isArray(q.options) ? q.options.map((o) => String(o).trim()) : [];
          const correctOptionIndex = Number(q.correctOptionIndex);
          if (!questionText) return res.status(400).json({ message: `Invalid questionText at index ${i}` });
          if (options.length !== 4 || options.some((o) => !o)) return res.status(400).json({ message: `Invalid options at index ${i}` });
          if (!Number.isInteger(correctOptionIndex) || correctOptionIndex < 0 || correctOptionIndex > 3) {
            return res.status(400).json({ message: `Invalid correctOptionIndex at index ${i}` });
          }
          normalized.push({ questionText, options, correctOptionIndex });
        }

        const totalTimeSeconds = normalized.length * 120; // 2 minutes each
        const assessment = await ProjectAssessment.create({
          project: project._id,
          questions: normalized,
          totalTimeSeconds,
          createdBy: req.user._id,
        });

        project.assessmentEnabled = true;
        project.assessment = assessment._id;
        await project.save();

        // No attempts yet on creation; but keep it safe.
        await ProjectAssessmentAttempt.deleteMany({ projectAssessment: assessment._id }).catch(() => {});
      }
      const populated = await Project.findById(project._id).populate('client', 'firstName lastName companyName avatar');
      res.status(201).json({ project: populated });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

router.patch('/:id', protect, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    const isClient = project.client.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isClient && !isAdmin) return res.status(403).json({ message: 'Not allowed' });
    const allowed = ['title', 'description', 'category', 'skills', 'budgetType', 'budget', 'budgetMax', 'weeklyMinMinutes', 'weeklyMaxMinutes', 'duration', 'deadline', 'status', 'attachments'];
    Object.keys(req.body).forEach((k) => { if (allowed.includes(k)) project[k] = req.body[k]; });
    await project.save();
    if (req.body.status === 'completed' && project.freelancer) {
      await Notification.create({
        user: project.freelancer,
        type: 'project_completed',
        title: 'Project completed',
        body: `"${project.title}" has been marked as completed.`,
        link: `/projects/${project._id}`,
        meta: { projectId: project._id },
      });
    }
    const updated = await Project.findById(project._id).populate('client', 'firstName lastName companyName avatar').populate('freelancer', 'firstName lastName avatar headline');
    res.json({ project: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (project.client.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not allowed' });
    }
    project.status = 'cancelled';
    await project.save();
    res.json({ message: 'Project cancelled' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
