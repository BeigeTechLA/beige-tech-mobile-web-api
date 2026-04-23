const { PDFDocument } = require('pdf-lib');
const fs = require('fs-extra');
const path = require('path');
const models = require('../models');

fs.ensureDirSync(path.join(__dirname, '../signed'));

async function saveSignature({ quote_id, signer_name, signer_email, signature_base64 }) {

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);

    page.drawText(`Quote ID: ${quote_id}`, { x: 50, y: 780, size: 18 });
    page.drawText(`Signed by: ${signer_name}`, { x: 50, y: 750, size: 14 });
    page.drawText(`Email: ${signer_email || 'N/A'}`, { x: 50, y: 725, size: 12 });
    page.drawText(`Date: ${new Date().toLocaleString()}`, { x: 50, y: 700, size: 12 });
    page.drawText('Signature:', { x: 50, y: 200, size: 12 });

    const imgData = signature_base64.replace(/^data:image\/png;base64,/, '');
    const imgBytes = Buffer.from(imgData, 'base64');
    const sigImage = await pdfDoc.embedPng(imgBytes);

    page.drawImage(sigImage, {
        x: 50,
        y: 100,
        width: 200,
        height: 80,
    });

    const pdfBytes = await pdfDoc.save();
    const pdfPath = `signed/quote_${quote_id}_signed.pdf`;
    await fs.writeFile(path.join(__dirname, '..', pdfPath), pdfBytes);

    const record = await models.signatures.create({
        quote_id,
        signer_name,
        signer_email,
        signature_base64,
        pdf_path: pdfPath,
        status: 'signed',
        signed_at: new Date(),
    });

    return record;
}

async function getSignatureByQuote(quote_id) {
    return await models.signatures.findOne({
        where: { quote_id }
    });
}

module.exports = { saveSignature, getSignatureByQuote };