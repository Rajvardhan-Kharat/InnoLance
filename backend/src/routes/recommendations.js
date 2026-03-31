import express from 'express';
import Project from '../models/Project.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Recommended projects for freelancer (by skills match)
router.get('/projects', protect, async (req, res) => {
  try {
    if (req.user.role !== 'freelancer') {
      return res.json({ projects: [] });
    }
    const skills = req.user.skills?.length ? req.user.skills : ['Web Development', 'Design', 'Writing'];
    const projects = await Project.find({
      status: 'open',
      $or: [
        { skills: { $in: skills } },
        { category: { $in: skills } },
      ],
    })
      .populate('client', 'firstName lastName companyName avatar')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Recommended freelancers for a project (for client)
router.get('/freelancers/:projectId', protect, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (project.client.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not your project' });
    }
    const skills = project.skills?.length ? project.skills : [project.category];
    const freelancers = await User.find({
      role: 'freelancer',
      isActive: true,
      _id: { $ne: project.freelancer },
      $or: [
        { skills: { $in: skills } },
        { headline: new RegExp(skills.join('|'), 'i') },
      ],
    })
      .select('firstName lastName avatar headline skills hourlyRate')
      .limit(6)
      .lean();
    res.json({ freelancers });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
