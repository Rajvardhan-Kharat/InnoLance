import mongoose from 'mongoose';

const enterpriseProjectSchema = new mongoose.Schema(
  {
    // Optional: link to an actual client User account for marketplace posting.
    clientUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },

    // The assigned project manager overseeing the broken-down tasks
    projectManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },

    // External identifier for the client submitting this RFP (e.g., client account reference or requester id).
    clientReference: { type: String, trim: true, index: true },

    // Original RFP provided to admins. The incoming email parser service should provide either/both.
    originalRfpDocumentUrl: { type: String, trim: true },
    originalRfpText: { type: String, trim: true },

    // Overall total budget for the entire parent project.
    overallTotalBudget: { type: Number, required: true, min: 0 },

    // Parent status controls the assembly lifecycle.
    status: {
      type: String,
      enum: ['RFP_Submitted', 'Pending Breakdown', 'In Progress', 'Assembling', 'Completed'],
      default: 'Pending Breakdown',
      index: true,
    },

    // How the RFP was submitted
    submissionType: { type: String, enum: ['email', 'direct', 'idea'], default: 'email' },

    // Budget range string (e.g. "₹5,00,000 – ₹15,00,000")
    budgetRange: { type: String, trim: true },

    // Timeline fields for direct submissions
    startDate: { type: Date },
    finalDeadline: { type: Date },

    // MicroJobs are the admin-created JD chunks for hiring.
    microJobs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MicroJob' }],

    // Tasks suggested by the client during RFP submission
    suggestedTasks: [
      {
        title: { type: String, trim: true },
        description: { type: String, trim: true },
        budget: { type: Number, min: 0 },
        skills: [{ type: String }],
      }
    ],

    // Email Message-ID (or stable hash) from intake — prevents duplicate projects on IMAP re-processing / restarts.
    intakeMessageId: { type: String, trim: true, sparse: true, unique: true },
  },
  { timestamps: true }
);

enterpriseProjectSchema.index({ clientReference: 1, status: 1 });
enterpriseProjectSchema.index({ clientUser: 1, status: 1 });

const EnterpriseProject = mongoose.model('EnterpriseProject', enterpriseProjectSchema);
export default EnterpriseProject;

