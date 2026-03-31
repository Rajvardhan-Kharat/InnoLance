import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    skills: [{ type: String }],
    budgetType: { type: String, enum: ['fixed', 'hourly'], required: true },
    budget: { type: Number },
    budgetMax: { type: Number },
    // Hourly-only controls (minutes per week). Optional; enforced when logging time.
    weeklyMinMinutes: { type: Number, min: 0 },
    weeklyMaxMinutes: { type: Number, min: 0 },
    duration: { type: String, enum: ['<1week', '1-4weeks', '1-3months', '3+months'], default: '1-4weeks' },
    deadline: { type: Date },
    status: { type: String, enum: ['open', 'in_progress', 'completed', 'cancelled'], default: 'open' },
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    attachments: [{ url: String, name: String }],
  },
  { timestamps: true }
);

projectSchema.index({ client: 1, status: 1 });
projectSchema.index({ status: 1, category: 1 });
projectSchema.index({ skills: 1 });
projectSchema.index({ createdAt: -1 });

const Project = mongoose.model('Project', projectSchema);
export default Project;
