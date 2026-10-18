import mongoose from 'mongoose';

// A homepage hero slide uploaded by an admin. The built-in slides live in the client code.
const heroSlideSchema = new mongoose.Schema(
  {
    // side: picture next to the headline (4:3).
    // banner: the picture is the whole slide — computer picture 14:5, optional phone picture 3:2.
    layout: { type: String, enum: ['side', 'banner'], default: 'side' },
    title: { type: String, default: '', trim: true, maxlength: 80 },
    text: { type: String, default: '', trim: true, maxlength: 200 },
    ctaLabel: { type: String, default: '', trim: true, maxlength: 30 },
    ctaTo: { type: String, default: '', trim: true, maxlength: 300 },
    theme: { type: String, enum: ['court', 'ink', 'ttt', 'sps', 'c4'], default: 'court' },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    imageVersion: { type: Number, default: 1 },
    imageType: { type: String, required: true },
    imageData: { type: String, required: true, select: false }, // base64
    mobileImageVersion: { type: Number, default: 0 }, // 0 = no phone picture (banners only)
    mobileImageType: { type: String, default: '' },
    mobileImageData: { type: String, default: '', select: false },
  },
  { timestamps: true }
);

export default mongoose.model('HeroSlide', heroSlideSchema);
