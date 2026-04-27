const { PDFDocument } = require('pdf-lib');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { updateCredentials, uploadFile } = require('s3-bucket');
const models = require('../models');
const { toAbsoluteBeigeAssetUrl } = require('../utils/common');
const { acceptQuoteOnSignature } = require('./sales-quote.service');

async function uploadSignatureAssetToS3({ filePath, key }) {
    if (!filePath || !key) {
        throw new Error('filePath and key are required for signature S3 upload');
    }

    updateCredentials({
        accessKeyId: process.env.S3_BUCKET_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_BUCKET_SECRET_ACCESS_KEY
    });

    const res = await uploadFile({
        Bucket: process.env.S3_BUCKET_NAME,
        filePath,
        Key: (process.env.S3_SUB_FOLDER ? `${process.env.S3_SUB_FOLDER}/` : '') + key,
        ACL: undefined
    });

    console.log("S3 Upload", res);
    return res;
}

function toStoredAssetPath(urlOrKey, fallbackKey) {
    const rawValue = String(urlOrKey || fallbackKey || '').trim();
    if (!rawValue) {
        return rawValue;
    }

    const beigePrefix = `${process.env.S3_SUB_FOLDER || 'beige'}/`;
    const beigeMarker = `/${beigePrefix}`;

    if (/^https?:\/\//i.test(rawValue)) {
        const markerIndex = rawValue.indexOf(beigeMarker);
        if (markerIndex >= 0) {
            return rawValue.slice(markerIndex + beigeMarker.length);
        }
    }

    if (rawValue.startsWith(beigePrefix)) {
        return rawValue.slice(beigePrefix.length);
    }

    return rawValue;
}

function parseSignatureImage(signature_base64) {
    const matches = String(signature_base64 || '').match(/^data:(image\/png|image\/jpeg|image\/jpg);base64,(.+)$/i);

    if (!matches) {
        throw new Error('Invalid signature image format. Only PNG or JPG base64 images are supported');
    }

    const mimeType = matches[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : matches[1].toLowerCase();
    const extension = mimeType === 'image/png' ? 'png' : 'jpg';

    return {
        mimeType,
        extension,
        buffer: Buffer.from(matches[2], 'base64')
    };
}

async function loadSignatureImage({ signature_base64, signature_file }) {
    if (signature_file?.path) {
        const mimeType = String(signature_file.mimetype || '').toLowerCase();
        if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/jfif'].includes(mimeType)) {
            throw new Error('Invalid signature image format. Only PNG, JPG, JPEG, WEBP, and JFIF files are supported');
        }

        const normalizedMimeType = mimeType === 'image/jpg' || mimeType === 'image/jfif'
            ? 'image/jpeg'
            : mimeType === 'image/webp'
                ? 'image/png'
                : mimeType;
        const extension = normalizedMimeType === 'image/png' ? 'png' : 'jpg';

        return {
            mimeType: normalizedMimeType,
            extension,
            buffer: await fs.readFile(signature_file.path),
            uploadedFilePath: signature_file.path
        };
    }

    return parseSignatureImage(signature_base64);
}

async function saveSignature({ quote_id, signer_name, signer_email, signature_base64, signature_file }) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const timestamp = Date.now();
    const signatureImage = await loadSignatureImage({ signature_base64, signature_file });

    page.drawText(`Quote ID: ${quote_id}`, { x: 50, y: 780, size: 18 });
    page.drawText(`Signed by: ${signer_name}`, { x: 50, y: 750, size: 14 });
    page.drawText(`Email: ${signer_email || 'N/A'}`, { x: 50, y: 725, size: 12 });
    page.drawText(`Date: ${new Date().toLocaleString()}`, { x: 50, y: 700, size: 12 });
    page.drawText('Signature:', { x: 50, y: 200, size: 12 });

    const sigImage = signatureImage.mimeType === 'image/png'
        ? await pdfDoc.embedPng(signatureImage.buffer)
        : await pdfDoc.embedJpg(signatureImage.buffer);

    page.drawImage(sigImage, {
        x: 50,
        y: 100,
        width: 200,
        height: 80,
    });

    const pdfBytes = await pdfDoc.save();
    const pdfPath = `signatures/${quote_id}/quote_signed_${timestamp}.pdf`;
    const signaturePath = `signatures/${quote_id}/signature_${timestamp}.${signatureImage.extension}`;
    const tempPdfFilePath = path.join(os.tmpdir(), `quote_${quote_id}_signed_${timestamp}.pdf`);
    await fs.writeFile(tempPdfFilePath, Buffer.from(pdfBytes));

    const tempSignatureFilePath = signatureImage.uploadedFilePath
        ? signatureImage.uploadedFilePath
        : path.join(os.tmpdir(), `signature_${quote_id}_${timestamp}.${signatureImage.extension}`);

    if (!signatureImage.uploadedFilePath) {
        await fs.writeFile(tempSignatureFilePath, signatureImage.buffer);
    }

    let uploadedPdf;
    let uploadedSignature;

    try {
        [uploadedPdf, uploadedSignature] = await Promise.all([
            uploadSignatureAssetToS3({
                filePath: tempPdfFilePath,
                key: pdfPath
            }),
            uploadSignatureAssetToS3({
                filePath: tempSignatureFilePath,
                key: signaturePath
            })
        ]);
    } finally {
        if (await fs.pathExists(tempPdfFilePath)) {
            await fs.remove(tempPdfFilePath);
        }
        if (await fs.pathExists(tempSignatureFilePath)) {
            await fs.remove(tempSignatureFilePath);
        }
    }

    const record = await models.signatures.create({
        quote_id,
        signer_name,
        signer_email,
        signature_base64: toStoredAssetPath(uploadedSignature?.url, signaturePath),
        pdf_path: toStoredAssetPath(uploadedPdf?.url, pdfPath),
        status: 'signed',
        signed_at: new Date(),
    });

    if (!record.signature_url) {
        record.setDataValue('signature_url', toAbsoluteBeigeAssetUrl(record.signature_base64));
    }
    if (!record.pdf_url) {
        record.setDataValue('pdf_url', toAbsoluteBeigeAssetUrl(record.pdf_path));
    }

    const quoteAcceptance = await acceptQuoteOnSignature(quote_id, {
        signer_name,
        signer_email
    });
    record.setDataValue('quote_acceptance', quoteAcceptance);

    return record;
}

async function getSignatureByQuote(quote_id) {
    const record = await models.signatures.findOne({
        where: { quote_id },
        order: [['signed_at', 'DESC'], ['id', 'DESC']]
    });

    if (record && record.signature_base64) {
        record.setDataValue('signature_url', toAbsoluteBeigeAssetUrl(record.signature_base64));
    }
    if (record && record.pdf_path) {
        record.setDataValue('pdf_url', toAbsoluteBeigeAssetUrl(record.pdf_path));
    }

    return record;
}

module.exports = { saveSignature, getSignatureByQuote };
