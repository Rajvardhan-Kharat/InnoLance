import mongoose from 'mongoose';

const microJobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },

    // Admin can specify the skill requirements for the chunk.
    requiredTechStack: {
      type: [String],
      required: true,
      validate: {
        validator: function validateRequiredTechStack(v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: 'requiredTechStack must include at least 1 tech item',
      },
    },

    // Allocated budget for this micro deliverable.
    allocatedBudget: { type: Number, required: true, min: 0 },

    // Status lifecycle for the chunk.
    status: {
      type: String,
      enum: ['Open', 'Assigned', 'Submitted', 'Approved'],
      default: 'Open',
      index: true,
    },

    // Parent project reference.
    parentProject: { type: mongoose.Schema.Types.ObjectId, ref: 'EnterpriseProject', required: true, index: true },

    // Users who applied for this micro-job (e.g., freelancer applicants).
    applicants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: [] }],

    // Single hired user reference.
    hiredUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // When published to the existing marketplace, this links to the public Project posting.
    marketplaceProject: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
  },
  { timestamps: true }
);

microJobSchema.index({ parentProject: 1, status: 1 });
microJobSchema.index({ marketplaceProject: 1 });

const MicroJob = mongoose.model('MicroJob', microJobSchema);
export default MicroJob;

