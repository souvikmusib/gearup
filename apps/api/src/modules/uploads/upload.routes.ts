import { Router } from 'express';
import { asyncHandler } from '../../common/utils/async-handler';
import multer from 'multer';

const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /upload — stub: accepts file, returns metadata (Supabase Storage integration TODO)
router.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
  const bucket = req.body.bucket || 'uploads';
  const file = req.file;
  if (!file) return res.status(400).json({ success: false, error: 'No file provided' });

  const filePath = `${bucket}/${Date.now()}-${file.originalname}`;

  // TODO: Upload to Supabase Storage
  // const { data, error } = await supabase.storage.from(bucket).upload(filePath, file.buffer, { contentType: file.mimetype });

  res.json({
    success: true,
    data: { filePath, fileName: file.originalname, mimeType: file.mimetype, fileSize: file.size },
  });
}));

export default router;
