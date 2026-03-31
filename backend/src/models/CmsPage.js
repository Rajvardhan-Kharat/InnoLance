import mongoose from 'mongoose';

const cmsPageSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    content: { type: String },
    published: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

cmsPageSchema.index({ slug: 1, published: 1 });

const CmsPage = mongoose.model('CmsPage', cmsPageSchema);
export default CmsPage;
