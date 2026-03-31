import mongoose from 'mongoose';

const timeEntrySchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    freelancer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String },
    minutes: { type: Number, required: true, min: 1 },
    hourlyRate: { type: Number, required: true },
    amount: { type: Number, required: true }, // (minutes/60) * hourlyRate
    date: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'approved', 'paid', 'disputed'], default: 'pending' },
  },
  { timestamps: true }
);

timeEntrySchema.index({ project: 1, date: -1 });
timeEntrySchema.index({ freelancer: 1, date: -1 });

const TimeEntry = mongoose.model('TimeEntry', timeEntrySchema);
export default TimeEntry;
