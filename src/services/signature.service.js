const AWS = require('aws-sdk');
const models = require('../models');
const { toAbsoluteBeigeAssetUrl } = require('../utils/common');
const { acceptQuoteOnSignature } = require('./sales-quote.service');

async function uploadSignatureAssetToS3({ buffer, key, contentType = 'image/png' }) {
    if (!buffer || !key) {
        throw new Error('buffer and key are required for signature S3 upload');
    }

    const s3 = new AWS.S3({
        accessKeyId: process.env.S3_BUCKET_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_BUCKET_SECRET_ACCESS_KEY,
        region: process.env.S3_BUCKET_REGION
    });

    const fullKey = (process.env.S3_SUB_FOLDER ? `${process.env.S3_SUB_FOLDER}/` : '') + key;
    await s3.putObject({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: fullKey,
        Body: buffer,
        ContentType: contentType
    }).promise();

    return {
        key: fullKey,
        url: `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/${fullKey}`
    };
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
    if (signature_file?.buffer) {
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
            buffer: signature_file.buffer
        };
    }

    return parseSignatureImage(signature_base64);
}

async function saveSignature({ quote_id, signer_name, signer_email, signature_base64, signature_file }) {
    const timestamp = Date.now();
    const signatureImage = await loadSignatureImage({ signature_base64, signature_file });
    const signaturePath = `signatures/${quote_id}/signature_${timestamp}.${signatureImage.extension}`;
    const uploadedSignature = await uploadSignatureAssetToS3({
        buffer: signatureImage.buffer,
        key: signaturePath,
        contentType: signatureImage.mimeType
    });

    const record = await models.signatures.create({
        quote_id,
        signer_name,
        signer_email,
        signature_base64: toStoredAssetPath(uploadedSignature?.url, signaturePath),
        status: 'signed',
        signed_at: new Date(),
    });

    if (!record.signature_url) {
        record.setDataValue('signature_url', toAbsoluteBeigeAssetUrl(record.signature_base64));
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

    return record;
}

module.exports = { saveSignature, getSignatureByQuote };
