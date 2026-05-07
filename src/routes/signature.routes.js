const express = require('express');
const router = express.Router();
const multer = require('multer');
const { saveSignature, getSignatureByQuote } = require('../services/signature.service');

function toSignatureResponse(record) {
    return {
        id: record.id,
        quote_id: record.quote_id,
        signer_name: record.signer_name,
        signer_email: record.signer_email,
        signed_at: record.signed_at,
        status: record.status,
        signature_url: record.signature_url || record.signature_base64,
        quote_acceptance: record.quote_acceptance || null
    };
}

const upload = multer({
    storage: multer.memoryStorage(),
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
        const {
            quote_id,
            signer_name,
            signer_email,
            signature_base64,
            quoteId,
            signerName,
            signerEmail,
            signatureBase64
        } = req.body;

        const resolvedQuoteId = quote_id || quoteId;
        const resolvedSignerName = signer_name || signerName;
        const resolvedSignerEmail = signer_email || signerEmail;
        const resolvedSignatureBase64 = signature_base64 || signatureBase64;

        if (!resolvedQuoteId || !resolvedSignerName || (!req.file && !resolvedSignatureBase64)) {
            return res.status(400).json({
                success: false,
                message: 'quote_id, signer_name, and signature (file or base64) are required'
            });
        }

        const record = await saveSignature({
            quote_id: resolvedQuoteId,
            signer_name: resolvedSignerName,
            signer_email: resolvedSignerEmail,
            signature_base64: resolvedSignatureBase64,
            signature_file: req.file || null
        });

        res.json({
            success: true,
            message: 'Signature saved successfully!',
            data: toSignatureResponse(record)
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
        res.json({ success: true, data: toSignatureResponse(record) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
