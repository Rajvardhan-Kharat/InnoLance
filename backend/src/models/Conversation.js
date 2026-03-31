import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1 });
conversationSchema.index({ project: 1 });

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;
