const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs-extra');
const { saveSignature, getSignatureByQuote } = require('../services/signature.service');

router.post('/sign', async (req, res) => {
    try {
        const { quote_id, signer_name, signer_email, signature_base64 } = req.body;

        if (!quote_id || !signer_name || !signature_base64) {
            return res.status(400).json({
                success: false,
                message: 'quote_id, signer_name aur signature_base64 required hain'
            });
        }

        const record = await saveSignature({
            quote_id,
            signer_name,
            signer_email,
            signature_base64
        });

        res.json({
            success: true,
            message: 'Signature saved successfully!',
            data: {
                id: record.id,
                quote_id: record.quote_id,
                signer_name: record.signer_name,
                signed_at: record.signed_at,
                pdf_path: record.pdf_path
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

        const filePath = path.join(__dirname, '..', record.pdf_path);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'PDF file not found'
            });
        }

        res.download(filePath);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;