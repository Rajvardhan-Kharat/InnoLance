import express from 'express';
import User from '../models/User.js';
import Project from '../models/Project.js';
import Proposal from '../models/Proposal.js';
import Payment from '../models/Payment.js';
import EnterpriseProject from '../models/EnterpriseProject.js';
import MicroJob from '../models/MicroJob.js';
import PlatformSettings from '../models/PlatformSettings.js';
import CmsPage from '../models/CmsPage.js';
import ProjectAssessment from '../models/ProjectAssessment.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateWithGroq, isTransientGeminiError } from '../services/llmFallback.js';

const router = express.Router();

function safeJsonParse(text) {
  if (!text) return null;
  let cleaned = String(text).trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    const firstArray = cleaned.indexOf('[');
    if (firstArray < 0) return null;
    const candidate = cleaned.slice(firstArray);
    const lastBracket = candidate.lastIndexOf(']');
    if (lastBracket < 0) return null;
    try {
      return JSON.parse(candidate.slice(0, lastBracket + 1));
    } catch {
      return null;
    }
  }
}

/** Keep assembly Kanban in sync: hired marketplace project → microJob.hiredUser + Assigned when still Open. */
async function syncMicroJobsWithMarketplaceProjects(parentProjectId) {
  const microJobs = await MicroJob.find({
    parentProject: parentProjectId,
    marketplaceProject: { $ne: null },
  }).lean();
  if (!microJobs.length) return;

  const projectIds = [...new Set(microJobs.map((m) => m.marketplaceProject).filter(Boolean))];
  const projects = await Project.find({ _id: { $in: projectIds } })
    .select('freelancer status')
    .lean();
  const byId = new Map(projects.map((p) => [String(p._id), p]));

  for (const mj of microJobs) {
    const mp = byId.get(String(mj.marketplaceProject));
    if (!mp?.freelancer) continue;

    const set = {};
    if (!mj.hiredUser || String(mj.hiredUser) !== String(mp.freelancer)) {
      set.hiredUser = mp.freelancer;
    }
    if (mj.status === 'Open' && mp.status === 'in_progress') {
      set.status = 'Assigned';
    }
    if (Object.keys(set).length) {
      await MicroJob.updateOne({ _id: mj._id }, { $set: set });
    }
  }
}

const enterpriseMicroJobPopulate = {
  path: 'microJobs',
  options: { sort: { createdAt: 1 } },
  populate: [
    { path: 'hiredUser', select: 'firstName lastName email' },
    {
      path: 'marketplaceProject',
      select: 'status title freelancer',
      populate: { path: 'freelancer', select: 'firstName lastName email' },
    },
  ],
};

// Public CMS page (no auth)
router.get('/cms/public/:slug', async (req, res) => {
  try {
    const page = await CmsPage.findOne({ slug: req.params.slug, published: true }).lean();
    if (!page) return res.status(404).json({ message: 'Page not found' });
    res.json({ page });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.use(protect);
router.use(restrictTo('admin'));

router.get('/dashboard', async (req, res) => {
  try {
    const [userCount, projectCount, proposalCount, paymentCount] = await Promise.all([
      User.countDocuments(),
      Project.countDocuments(),
      Proposal.countDocuments(),
      Payment.countDocuments({ status: { $in: ['held', 'released'] } }),
    ]);
    const projectsByStatus = await Project.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const recentProjects = await Project.find()
      .populate('client', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    res.json({
      stats: { userCount, projectCount, proposalCount, paymentCount },
      projectsByStatus,
      recentProjects,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    const { role, page = 1, limit = 20 } = req.query;
    const q = role ? { role } : {};
    const users = await User.find(q).select('-password').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit)).lean();
    const total = await User.countDocuments(q);
    res.json({ users, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/settings', async (req, res) => {
  try {
    const settings = await PlatformSettings.find().lean();
    const map = {};
    settings.forEach((s) => { map[s.key] = s.value; });
    res.json({ settings: map });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ message: 'key required' });
    await PlatformSettings.findOneAndUpdate({ key }, { value }, { upsert: true, new: true });
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/cms/pages', async (req, res) => {
  try {
    const pages = await CmsPage.find().sort({ updatedAt: -1 }).lean();
    res.json({ pages });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/cms/pages/:slug', async (req, res) => {
  try {
    const page = await CmsPage.findOne({ slug: req.params.slug }).lean();
    if (!page) return res.status(404).json({ message: 'Page not found' });
    res.json({ page });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/cms/pages', async (req, res) => {
  try {
    const { slug, title, content, published } = req.body;
    if (!slug || !title) return res.status(400).json({ message: 'slug and title required' });
    const page = await CmsPage.create({
      slug,
      title,
      content: content || '',
      published: published || false,
      updatedBy: req.user._id,
    });
    res.status(201).json({ page });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/cms/pages/:slug', async (req, res) => {
  try {
    const page = await CmsPage.findOneAndUpdate(
      { slug: req.params.slug },
      { ...req.body, updatedBy: req.user._id },
      { new: true }
    );
    if (!page) return res.status(404).json({ message: 'Page not found' });
    res.json({ page });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// -----------------------------
// Enterprise RFP Deconstruction
// -----------------------------

// List enterprise projects (admin)
router.get('/enterprise-projects', async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const q = {};
    if (status) q.status = status;
    if (search) {
      q.$or = [
        { clientReference: new RegExp(String(search), 'i') },
      ];
    }
    const items = await EnterpriseProject.find(q)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();
    const total = await EnterpriseProject.countDocuments(q);
    res.json({ projects: items, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get one enterprise project (admin) + populate microJobs
router.get('/enterprise-projects/:id', async (req, res) => {
  try {
    const epId = req.params.id;
    const exists = await EnterpriseProject.findById(epId).select('_id').lean();
    if (!exists) return res.status(404).json({ message: 'EnterpriseProject not found' });

    await syncMicroJobsWithMarketplaceProjects(epId);

    const project = await EnterpriseProject.findById(epId)
      .populate(enterpriseMicroJobPopulate)
      .populate('clientUser', 'firstName lastName email companyName')
      .lean();
    res.json({ project });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Auto-generate microjobs from PRD text via Gemini AI
router.post('/enterprise-projects/:id/suggest-microjobs', async (req, res) => {
  try {
    const project = await EnterpriseProject.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'EnterpriseProject not found' });
    if (!project.originalRfpText) {
      return res.status(400).json({ message: 'No RFP text available to analyze' });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ message: 'GEMINI_API_KEY/GOOGLE_API_KEY not configured on server' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash'];

    const prompt = `You are an expert technical project manager and software architect.
I have a Product Requirements Document (PRD) from a client for a new project. 
The total budget for this project is roughly ${project.overallTotalBudget || 'unknown'}.

I need to break this large project down into a series of smaller, distinct "micro-deliverables" to be posted on a freelancing platform.
Analyze the following PRD text and generate these micro-deliverables. 
For each, provide:
- A descriptive title
- A comprehensive description of the work, constraints, and acceptance criteria
- A comma-separated list of required technologies/frameworks
- An estimated allocated budget (ensure the sum roughly matches the total budget, but do not exceed it).

Return ONLY a valid JSON array of objects with the exact keys: 'title', 'description', 'requiredTechStackText', 'allocatedBudget'. No markdown formatting blocks like \`\`\`json, just the raw JSON text.

PRD TEXT:
${project.originalRfpText.slice(0, 30000)}`;

    let suggestions = null;
    let lastErr = null;
    for (const modelName of modelsToTry) {
      const model = genAI.getGenerativeModel({ model: modelName });
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await model.generateContent(prompt);
          const text = result?.response?.text?.()?.trim() || '';
          suggestions = safeJsonParse(text);
          if (Array.isArray(suggestions)) break;
          throw new Error('AI returned invalid suggestions format');
        } catch (err) {
          lastErr = err;
          const transient = isTransientGeminiError(err);
          if (!transient || attempt === 3) break;
          await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** (attempt - 1))));
        }
      }
      if (Array.isArray(suggestions)) break;
    }

    if (!Array.isArray(suggestions)) {
      const groqText = await generateWithGroq(prompt);
      if (groqText) suggestions = safeJsonParse(groqText);
    }

    if (!Array.isArray(suggestions)) {
      throw (lastErr || new Error('Failed to generate suggestions'));
    }
    
    // Ensure all attributes exist safely
    const normalized = suggestions.map(s => ({
      title: s.title || 'Untitled Task',
      description: s.description || '',
      requiredTechStackText: s.requiredTechStackText || '',
      allocatedBudget: Number(s.allocatedBudget) || 0
    }));

    res.json({ suggestions: normalized });
  } catch (err) {
    console.error('Gemini Suggest Error:', err);
    res.status(500).json({ message: err.message || 'Failed to generate suggestions' });
  }
});

// Bulk create microjobs + publish each as marketplace Project
router.post('/enterprise-projects/:id/microjobs/bulk', async (req, res) => {
  try {
    const ep = await EnterpriseProject.findById(req.params.id);
    if (!ep) return res.status(404).json({ message: 'EnterpriseProject not found' });

    const { microJobs, clientUserId } = req.body || {};
    if (!Array.isArray(microJobs) || microJobs.length === 0) {
      return res.status(400).json({ message: 'microJobs array is required' });
    }

    // Determine marketplace client user
    const clientUser = req.user;
    if (!clientUser) return res.status(401).json({ message: 'Unauthorized' });

    // Create microjobs + marketplace projects
    const createdMicroJobs = [];
    const createdMarketplaceProjects = [];

    for (const mj of microJobs) {
      const title = String(mj?.title || '').trim();
      const description = String(mj?.description || '').trim();
      const requiredTechStack = Array.isArray(mj?.requiredTechStack)
        ? mj.requiredTechStack.map((s) => String(s).trim()).filter(Boolean)
        : [];
      const allocatedBudget = Number(mj?.allocatedBudget);

      const assessmentPayload = mj?.assessment && typeof mj.assessment === 'object' ? mj.assessment : null;

      if (!title || !description) return res.status(400).json({ message: 'Each microJob requires title and description' });
      if (requiredTechStack.length === 0) return res.status(400).json({ message: 'Each microJob requires requiredTechStack (>=1 item)' });
      if (!Number.isFinite(allocatedBudget) || allocatedBudget < 0) return res.status(400).json({ message: 'Each microJob requires allocatedBudget (number >= 0)' });

      const micro = await MicroJob.create({
        title,
        description,
        requiredTechStack,
        allocatedBudget,
        parentProject: ep._id,
        applicants: [],
        hiredUser: null,
        status: 'Open',
      });

      // Publish to marketplace as a standard Project posting
      const marketplaceProject = await Project.create({
        client: clientUser._id,
        title,
        description,
        category: 'Enterprise',
        skills: requiredTechStack,
        budgetType: 'fixed',
        budget: allocatedBudget,
        status: 'open',
        attachments: ep.originalRfpDocumentUrl ? [{ url: ep.originalRfpDocumentUrl, name: 'RFP' }] : [],

        assessmentEnabled: assessmentPayload?.enabled === true,
      });

      if (assessmentPayload?.enabled === true) {
        const assessmentQuestions = Array.isArray(assessmentPayload.questions) ? assessmentPayload.questions : [];
        if (assessmentQuestions.length === 0) {
          return res.status(400).json({ message: 'assessment.questions must be provided when assessment.enabled is true' });
        }

        const normalized = [];
        for (let i = 0; i < assessmentQuestions.length; i++) {
          const q = assessmentQuestions[i] || {};
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

        const totalTimeSeconds = normalized.length * 120;
        const assessment = await ProjectAssessment.create({
          project: marketplaceProject._id,
          questions: normalized,
          totalTimeSeconds,
          createdBy: req.user._id,
        });
        marketplaceProject.assessment = assessment._id;
        await marketplaceProject.save();
      }

      micro.marketplaceProject = marketplaceProject._id;
      await micro.save();

      createdMicroJobs.push(micro);
      createdMarketplaceProjects.push(marketplaceProject);
      ep.microJobs.push(micro._id);
    }

    // Parent is now active
    ep.clientUser = ep.clientUser || clientUser._id;
    if (ep.status === 'Pending Breakdown') ep.status = 'In Progress';
    
    // Update overall budget if modified by Admin
    if (req.body.overallTotalBudget !== undefined) {
      ep.overallTotalBudget = Number(req.body.overallTotalBudget);
    }
    
    await ep.save();

    const populated = await EnterpriseProject.findById(ep._id)
      .populate(enterpriseMicroJobPopulate)
      .populate('clientUser', 'firstName lastName email companyName');

    res.status(201).json({
      project: populated,
      created: {
        microJobs: createdMicroJobs.map((m) => m._id),
        marketplaceProjects: createdMarketplaceProjects.map((p) => p._id),
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Update microjob status (admin) and auto-update parent when all approved
router.patch('/microjobs/:id/status', async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!['Open', 'Assigned', 'Submitted', 'Approved'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const micro = await MicroJob.findById(req.params.id);
    if (!micro) return res.status(404).json({ message: 'MicroJob not found' });

    micro.status = status;
    await micro.save();

    // If all children are approved, auto-set parent to Assembling.
    const parentId = micro.parentProject;
    if (parentId) {
      const total = await MicroJob.countDocuments({ parentProject: parentId });
      const approved = await MicroJob.countDocuments({ parentProject: parentId, status: 'Approved' });
      if (total > 0 && approved === total) {
        await EnterpriseProject.findByIdAndUpdate(parentId, { status: 'Assembling' });
      }
    }

    const updated = await MicroJob.findById(micro._id)
      .populate('hiredUser', 'firstName lastName email')
      .populate({
        path: 'marketplaceProject',
        select: 'status title freelancer',
        populate: { path: 'freelancer', select: 'firstName lastName email' },
      })
      .lean();

    res.json({ microJob: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Finalize project to Completed
router.patch('/enterprise-projects/:id/complete', async (req, res) => {
  try {
    const ep = await EnterpriseProject.findById(req.params.id);
    if (!ep) return res.status(404).json({ message: 'EnterpriseProject not found' });
    if (ep.status !== 'Assembling') {
      return res.status(400).json({ message: 'Project must be in Assembling state to mark as complete.' });
    }

    ep.status = 'Completed';
    await ep.save();

    res.json({ project: ep });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete Enterprise Project
router.delete('/enterprise-projects/:id', async (req, res) => {
  try {
    const ep = await EnterpriseProject.findByIdAndDelete(req.params.id);
    if (!ep) return res.status(404).json({ message: 'EnterpriseProject not found' });
    
    // Optionally clean up orphan microJobs
    await MicroJob.deleteMany({ parentProject: ep._id });
    
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// -----------------------------
// Analytics Dashboard
// -----------------------------
router.get('/analytics/financial', async (req, res) => {
  try {
    // Total Escrow Balance
    const escrowAgg = await Payment.aggregate([
      { $match: { status: 'held' } },
      { $group: { _id: null, totalEscrow: { $sum: '$amount' } } }
    ]);
    const totalEscrow = escrowAgg[0]?.totalEscrow || 0;

    // Platform Revenue Estimation: 100 INR per accepted proposal (50 client + 50 freelancer)
    const acceptedProposalsCount = await Proposal.countDocuments({ status: { $in: ['accepted'] } });
    const completedProjectsCount = await Project.countDocuments({ status: 'completed' });
    // In our system, accepted projects become in_progress or completed.
    // Let's accurately count Projects where freelancer is set:
    const hiredProjectsCount = await Project.countDocuments({ freelancer: { $exists: true } });
    const totalRevenue = hiredProjectsCount * 100;

    // Freelancer Conversion Rate
    const totalFreelancers = await User.countDocuments({ role: 'freelancer' });
    const hiredFreelancersCount = await Project.distinct('freelancer', { freelancer: { $exists: true } });

    res.json({
      revenue: totalRevenue,
      escrow: totalEscrow,
      freelancers: {
        total: totalFreelancers,
        hired: hiredFreelancersCount.length
      },
      projects: {
        hired: hiredProjectsCount,
        completed: completedProjectsCount
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
