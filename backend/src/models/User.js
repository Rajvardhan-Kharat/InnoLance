import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ['admin', 'client', 'freelancer'], required: true },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    avatar: { type: String },
    phone: { type: String },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    companyName: { type: String },
    headline: { type: String },
    bio: { type: String },
    skills: [{ type: String }],
    hourlyRate: { type: Number },
    portfolio: [{ url: String, title: String, description: String }],
    experience: [{ title: String, company: String, from: Date, to: Date, current: Boolean, description: String }],
    education: [{ school: String, degree: String, field: String, from: Date, to: Date }],
    certifications: [{ name: String, issuer: String, date: Date, url: String }],
    availability: { type: String, enum: ['full-time', 'part-time', 'as-needed'], default: 'as-needed' },

    // Spendable wallet balance (INR, paise). Legacy field name unchanged for backward compatibility.
    walletBalancePaise: { type: Number, default: 0, min: 0 },
    // Funds locked in internal escrow (e.g. client-side while work is in progress). Default 0 for all existing users.
    escrowBalancePaise: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

userSchema.index({ role: 1 });
userSchema.index({ skills: 1 });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

const User = mongoose.model('User', userSchema);
export default User;
