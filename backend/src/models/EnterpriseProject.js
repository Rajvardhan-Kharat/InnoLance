import mongoose from 'mongoose';

const enterpriseProjectSchema = new mongoose.Schema(
  {
    // Optional: link to an actual client User account for marketplace posting.
    clientUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },

    // External identifier for the client submitting this RFP (e.g., client account reference or requester id).
    clientReference: { type: String, required: true, trim: true, index: true },

    // Original RFP provided to admins. The incoming email parser service should provide either/both.
    originalRfpDocumentUrl: { type: String, trim: true },
    originalRfpText: { type: String, trim: true },

    // Overall total budget for the entire parent project.
    overallTotalBudget: { type: Number, required: true, min: 0 },

    // Parent status controls the assembly lifecycle.
    status: {
      type: String,
      enum: ['Pending Breakdown', 'In Progress', 'Assembling', 'Completed'],
      default: 'Pending Breakdown',
      index: true,
    },

    // MicroJobs are the admin-created JD chunks for hiring.
    microJobs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MicroJob' }],
  },
  { timestamps: true }
);

enterpriseProjectSchema.index({ clientReference: 1, status: 1 });
enterpriseProjectSchema.index({ clientUser: 1, status: 1 });

const EnterpriseProject = mongoose.model('EnterpriseProject', enterpriseProjectSchema);
export default EnterpriseProject;

