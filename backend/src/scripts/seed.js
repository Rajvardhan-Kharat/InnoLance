import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Project from '../models/Project.js';

dotenv.config();

const categories = ['Web Development', 'Mobile App', 'Design', 'Writing', 'Marketing', 'Data Science', 'DevOps', 'Other'];
const skills = ['React', 'Node.js', 'MongoDB', 'Python', 'UI/UX', 'Content Writing', 'SEO', 'AWS', 'Docker'];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/freelance_platform');
  await User.deleteMany({});
  await Project.deleteMany({});

  const admin = await User.create({
    email: 'admin@platform.com',
    password: 'admin123',
    role: 'admin',
    firstName: 'Admin',
    lastName: 'User',
  });

  const client = await User.create({
    email: 'client@example.com',
    password: 'client123',
    role: 'client',
    firstName: 'Alice',
    lastName: 'Client',
    companyName: 'Acme Corp',
  });

  const freelancer = await User.create({
    email: 'freelancer@example.com',
    password: 'free123',
    role: 'freelancer',
    firstName: 'Bob',
    lastName: 'Freelancer',
    headline: 'Full Stack Developer',
    bio: 'Experienced in MERN stack and cloud solutions.',
    skills: ['React', 'Node.js', 'MongoDB'],
    hourlyRate: 50,
    availability: 'part-time',
  });

  await Project.create({
    client: client._id,
    title: 'Build a React Dashboard',
    description: 'Need a responsive admin dashboard with charts and user management.',
    category: 'Web Development',
    skills: ['React', 'Node.js'],
    budgetType: 'fixed',
    budget: 2000,
    duration: '1-4weeks',
    status: 'open',
  });

  await Project.create({
    client: client._id,
    title: 'API Integration and Documentation',
    description: 'Integrate third-party API and write clear API docs.',
    category: 'Web Development',
    skills: ['Node.js', 'REST'],
    budgetType: 'hourly',
    budget: 40,
    budgetMax: 60,
    duration: '1-4weeks',
    status: 'open',
  });

  console.log('Seed done. Created admin, client, freelancer, and 2 sample projects.');
  console.log('Admin:', admin.email, '| Client:', client.email, '| Freelancer:', freelancer.email);
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
