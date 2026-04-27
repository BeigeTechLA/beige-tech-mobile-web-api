const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { saveSignature, getSignatureByQuote } = require('../services/signature.service');
const { getSignedDownloadUrl } = require('../utils/awsS3Client');

const signatureUploadDir = path.join(__dirname, '../../public/uploads/media');
fs.ensureDirSync(signatureUploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, signatureUploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jfif', 'image/jpg'];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Invalid file type. Only JPEG, PNG, WEBP, and JFIF are allowed.'));
        }
        cb(null, true);
    }
});

router.post('/sign', upload.single('signature'), async (req, res) => {
    try {
        const { quote_id, signer_name, signer_email } = req.body;

        if (!quote_id || !signer_name || !req.file) {
            return res.status(400).json({
                success: false,
                message: 'quote_id, signer_name, and signature file are required'
            });
        }

        const record = await saveSignature({
            quote_id,
            signer_name,
            signer_email,
            signature_file: req.file
        });

        res.json({
            success: true,
            message: 'Signature saved successfully!',
            data: {
                id: record.id,
                quote_id: record.quote_id,
                signer_name: record.signer_name,
                signed_at: record.signed_at,
                signature_url: record.signature_url || record.signature_base64,
                pdf_path: record.pdf_path,
                pdf_url: record.pdf_url || record.pdf_path,
                quote_acceptance: record.quote_acceptance || null
            }
        });
    } catch (err) {
        console.error('Signature error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});


router.get('/quote/:quote_id', async (req, res) => {
    try {
        const record = await getSignatureByQuote(req.params.quote_id);
        if (!record) {
            return res.status(404).json({
                success: false,
                message: 'Signature not found'
            });
        }
        res.json({ success: true, data: record });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


router.get('/download/:quote_id', async (req, res) => {
    try {
        const record = await getSignatureByQuote(req.params.quote_id);
        if (!record) {
            return res.status(404).json({
                success: false,
                message: 'Signature not found'
            });
        }

        if (!record.pdf_path) {
            return res.status(404).json({
                success: false,
                message: 'PDF file not found'
            });
        }

        const downloadUrl = /^https?:\/\//i.test(record.pdf_path)
            ? record.pdf_path
            : record.pdf_url
                ? record.pdf_url
            : await getSignedDownloadUrl(record.pdf_path, 3600, {
                responseContentDisposition: `attachment; filename="quote_${req.params.quote_id}_signed.pdf"`
            });

        res.json({
            success: true,
            data: {
                download_url: downloadUrl,
                expires_in_seconds: 3600,
                pdf_path: record.pdf_path
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
