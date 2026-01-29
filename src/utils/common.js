const { updateCredentials, uploadFile } = require('s3-bucket');
const util = require('util');
const path = require('path'); 
const sharp = require('sharp');
const fs = require('fs');

// Function to process and compress images
const processImage = async (filePath, outputPath) => {
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(filePath);
  if (!isImage) return filePath; // Return original path if not an image

  try {
    await sharp(filePath)
      .resize(800, null, { // Max width 800px, maintain aspect ratio
        withoutEnlargement: true // Don't enlarge if smaller
      })
      .jpeg({ quality: 80 }) // Compress to 80% quality
      .png({ quality: 80 })
      .toFile(outputPath);

    return outputPath; // Return processed image path
  } catch (error) {
    console.error('Error processing image:', error);
    return filePath; // Return original path on error
  }
};

const s3Upload = (media, callback = null) => {
    return new Promise((resolve, reject) => {
        try {
            const credentials = {
                accessKeyId: process.env.S3_BUCKET_ACCESS_KEY_ID, //config.get("multers3.key"),
                secretAccessKey: process.env.S3_BUCKET_SECRET_ACCESS_KEY //config.get("multers3.secret")
            };
            updateCredentials(credentials);
            uploadFile({
                Bucket: process.env.S3_BUCKET_NAME, //config.get("multers3.bucket"),
                filePath: media.path,
                Key: (process.env.S3_SUB_FOLDER ? process.env.S3_SUB_FOLDER + "/" : "") + media.public_id
            }).then(res => {
                console.log("S3 Upload", res);
                if (res.url) {
                    if (callback) {
                        console.log("Media Status Callback 1");
                        callback(media);
                    }
                } else {
                    if (callback) {
                        console.log("Media Status Callback 2");
                        callback(media);
                    }
                }
                resolve();
            }).catch(error => {
                console.log(error)
                if (callback) {
                    callback(media);
                }
                reject(error);
            });
        } catch (error) {
            console.error(util.format("Error Occured while copying files, Error: %O", error));
            reject(error);
        }
    });
}

const uploadS3File = async (files, field) => {
  const file = files[field]?.[0];
  if (!file) return null;

  const currentImageVersion = Date.now();
  const ext = path.extname(file.filename).replace('.', '');
  const randomNumber = Math.floor(Math.random() * 101);

  file.public_id = `${field}_${randomNumber}_${currentImageVersion}.${ext}`;

  await s3Upload({
    path: path.join(process.cwd(), process.env.FILEPATH_MEDIA, file.filename),
    public_id: file.public_id,
    fileName: file.filename
  });

  return file.public_id;
};

const S3UploadFiles = async (files) => {
  let filePaths = [];

  if (!files) return filePaths;

  for (let field in files) {

    for (let file of files[field]) {

      const currentImageVersion = Date.now();
      const ext = path.extname(file.filename).replace('.', '');
      const randomNumber = Math.floor(Math.random() * 101);

      file.public_id = `${field}_${randomNumber}_${currentImageVersion}.${ext}`;

      // Process image if it's an image file
      let uploadPath = file.path;
      if (/\.(jpg|jpeg|png|gif|webp)$/i.test(file.filename)) {
        const processedPath = path.join(path.dirname(file.path), `processed_${file.filename}`);
        uploadPath = await processImage(file.path, processedPath);
      }

      const fileObject = {
        path: uploadPath,   // Use processed path for images
        public_id: file.public_id,
        fileName: file.filename
      };

      await s3Upload(fileObject);

      // Clean up processed file if it was created
      if (uploadPath !== file.path && fs.existsSync(uploadPath)) {
        fs.unlinkSync(uploadPath);
      }

      filePaths.push({
        file_type: field,
        file_path: file.public_id,
      });
    }
  }

  return filePaths;
};

module.exports = {
  s3Upload,
  uploadS3File,
  S3UploadFiles
};
