import express from 'express';
import User from '../models/User.js';
import Project from '../models/Project.js';
import Proposal from '../models/Proposal.js';
import Payment from '../models/Payment.js';
import EnterpriseProject from '../models/EnterpriseProject.js';
import MicroJob from '../models/MicroJob.js';
import PlatformSettings from '../models/PlatformSettings.js';
import CmsPage from '../models/CmsPage.js';
import { protect, restrictTo } from '../middleware/auth.js';

const router = express.Router();

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
    const project = await EnterpriseProject.findById(req.params.id)
      .populate({
        path: 'microJobs',
        options: { sort: { createdAt: 1 } },
        populate: [
          { path: 'hiredUser', select: 'firstName lastName email' },
          { path: 'marketplaceProject', select: 'status title' },
        ],
      })
      .populate('clientUser', 'firstName lastName email companyName')
      .lean();
    if (!project) return res.status(404).json({ message: 'EnterpriseProject not found' });
    res.json({ project });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
      });

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
      .populate({
        path: 'microJobs',
        options: { sort: { createdAt: 1 } },
        populate: [
          { path: 'hiredUser', select: 'firstName lastName email' },
          { path: 'marketplaceProject', select: 'status title' },
        ],
      })
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
      .populate('marketplaceProject', 'status title')
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

export default router;
