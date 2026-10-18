import { Router } from 'express';
import mongoose from 'mongoose';
import HeroSlide from '../models/HeroSlide.js';
import Setting from '../models/Setting.js';
import { requireAuth, requireAdmin, asyncH } from '../middleware/auth.js';
import { parseImage } from './tournaments.js';

const router = Router();
const isId = (id) => mongoose.isValidObjectId(id);
const MODES = ['default', 'custom', 'both']; // built-in slides only, admin slides only, admin slides then built-in
const MAX_SLIDES = 6;

async function setMode(mode) {
  const s = (await Setting.findOne({ key: 'heroMode' })) || new Setting({ key: 'heroMode' });
  s.value = mode;
  s.markModified('value');
  await s.save();
}

async function getMode() {
  const s = await Setting.findOne({ key: 'heroMode' });
  return MODES.includes(s?.value) ? s.value : 'default';
}

function serializeSlide(s) {
  return {
    id: s._id.toString(),
    layout: s.layout,
    title: s.title,
    text: s.text,
    ctaLabel: s.ctaLabel,
    ctaTo: s.ctaTo,
    theme: s.theme,
    order: s.order,
    active: s.active,
    imageUrl: `/api/hero/slides/${s._id}/image?v=${s.imageVersion}`,
    mobileImageUrl: s.mobileImageVersion ? `/api/hero/slides/${s._id}/image?variant=mobile&v=${s.mobileImageVersion}` : null,
  };
}

// Button links: a page on this site ("/tournaments") or a full https:// address.
function cleanLink(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^\/(?!\/)[^\s]*$/.test(s)) return s;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function readFields(body, { partial = false } = {}) {
  const out = {};
  const str = (k, max) => {
    if (body[k] === undefined) return;
    out[k] = String(body[k] ?? '').trim().slice(0, max);
  };
  str('title', 80);
  str('text', 200);
  str('ctaLabel', 30);
  if (body.ctaTo !== undefined) {
    const link = cleanLink(body.ctaTo);
    if (link === null) return { error: 'Button link must be a page like /tournaments or a full https:// address' };
    out.ctaTo = link;
  }
  if (body.theme !== undefined) {
    if (!['court', 'ink', 'ttt', 'sps', 'c4'].includes(body.theme)) return { error: 'Unknown colour' };
    out.theme = body.theme;
  }
  if (body.layout !== undefined && !partial) {
    if (!['side', 'banner'].includes(body.layout)) return { error: 'Unknown layout' };
    out.layout = body.layout;
  }
  if (body.active !== undefined) out.active = Boolean(body.active);
  return { fields: out };
}

function validateSlide(s) {
  if (s.layout === 'side' && !s.title) return 'A picture-and-text slide needs a headline';
  if (s.ctaLabel && !s.ctaTo) return 'Add a link for the button';
  if (s.ctaTo && !s.ctaLabel && s.layout === 'side') return 'Add a label for the button';
  return null;
}

// ---------- Public ----------
router.get(
  '/',
  asyncH(async (req, res) => {
    const mode = await getMode();
    const slides = mode === 'default' ? [] : await HeroSlide.find({ active: true }).sort({ order: 1, createdAt: 1 });
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ mode, slides: slides.map(serializeSlide) });
  })
);

router.get(
  '/slides/:id/image',
  asyncH(async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).end();
    const mobile = req.query.variant === 'mobile';
    const s = await HeroSlide.findById(req.params.id).select(mobile ? '+mobileImageData mobileImageType' : '+imageData imageType');
    const data = mobile ? s?.mobileImageData : s?.imageData;
    if (!data) return res.status(404).end();
    res.set({
      'Content-Type': mobile ? s.mobileImageType : s.imageType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(Buffer.from(data, 'base64'));
  })
);

// ---------- Admin ----------
router.get(
  '/admin',
  requireAuth,
  requireAdmin,
  asyncH(async (req, res) => {
    const slides = await HeroSlide.find({}).sort({ order: 1, createdAt: 1 });
    res.json({ mode: await getMode(), slides: slides.map(serializeSlide), maxSlides: MAX_SLIDES });
  })
);

router.post(
  '/settings',
  requireAuth,
  requireAdmin,
  asyncH(async (req, res) => {
    const mode = req.body.mode;
    if (!MODES.includes(mode)) return res.status(400).json({ error: 'Unknown option' });
    if (mode !== 'default' && !(await HeroSlide.countDocuments({ active: true }))) {
      return res.status(400).json({ error: 'Add at least one slide (and keep it switched on) before showing your own slides' });
    }
    await setMode(mode);
    res.json({ mode });
  })
);

router.post(
  '/slides',
  requireAuth,
  requireAdmin,
  asyncH(async (req, res) => {
    if ((await HeroSlide.countDocuments({})) >= MAX_SLIDES) {
      return res.status(400).json({ error: `You can have up to ${MAX_SLIDES} slides. Delete one first.` });
    }
    const { fields, error } = readFields(req.body);
    if (error) return res.status(400).json({ error });
    const slide = { layout: 'side', theme: 'court', ...fields };
    const invalid = validateSlide(slide);
    if (invalid) return res.status(400).json({ error: invalid });
    const image = parseImage(req.body.image);
    if (image.error) return res.status(400).json({ error: image.error.replace('cover image', 'picture') });
    let mobile = null;
    if (slide.layout === 'banner' && req.body.imageMobile) {
      mobile = parseImage(req.body.imageMobile);
      if (mobile.error) return res.status(400).json({ error: `Phone picture: ${mobile.error.replace('cover image', 'picture')}` });
    }
    const last = await HeroSlide.findOne({}).sort({ order: -1 });
    const s = await HeroSlide.create({
      ...slide,
      order: (last?.order ?? -1) + 1,
      imageType: image.contentType,
      imageData: image.data.toString('base64'),
      ...(mobile ? { mobileImageVersion: 1, mobileImageType: mobile.contentType, mobileImageData: mobile.data.toString('base64') } : {}),
    });
    res.status(201).json({ slide: serializeSlide(s) });
  })
);

router.post(
  '/slides/:id/update',
  requireAuth,
  requireAdmin,
  asyncH(async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ error: 'Slide not found' });
    const s = await HeroSlide.findById(req.params.id);
    if (!s) return res.status(404).json({ error: 'Slide not found' });
    const { fields, error } = readFields(req.body, { partial: true });
    if (error) return res.status(400).json({ error });
    Object.assign(s, fields);
    if (req.body.image) {
      const image = parseImage(req.body.image);
      if (image.error) return res.status(400).json({ error: image.error.replace('cover image', 'picture') });
      s.imageType = image.contentType;
      s.imageData = image.data.toString('base64');
      s.imageVersion += 1;
    }
    if (s.layout === 'banner' && req.body.imageMobile) {
      const mobile = parseImage(req.body.imageMobile);
      if (mobile.error) return res.status(400).json({ error: `Phone picture: ${mobile.error.replace('cover image', 'picture')}` });
      s.mobileImageType = mobile.contentType;
      s.mobileImageData = mobile.data.toString('base64');
      s.mobileImageVersion += 1;
    } else if (req.body.removeMobileImage) {
      s.mobileImageType = '';
      s.mobileImageData = '';
      s.mobileImageVersion = 0;
    }
    const invalid = validateSlide(s);
    if (invalid) return res.status(400).json({ error: invalid });
    await s.save();
    res.json({ slide: serializeSlide(s) });
  })
);

router.post(
  '/order',
  requireAuth,
  requireAdmin,
  asyncH(async (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(isId) : [];
    await Promise.all(ids.map((id, i) => HeroSlide.updateOne({ _id: id }, { $set: { order: i } })));
    res.json({ ok: true });
  })
);

router.post(
  '/slides/:id/delete',
  requireAuth,
  requireAdmin,
  asyncH(async (req, res) => {
    if (!isId(req.params.id)) return res.status(404).json({ error: 'Slide not found' });
    await HeroSlide.deleteOne({ _id: req.params.id });
    // Nothing left to show: fall back to the built-in slides.
    if (!(await HeroSlide.countDocuments({ active: true }))) {
      await setMode('default');
    }
    res.json({ ok: true, mode: await getMode() });
  })
);

export default router;
