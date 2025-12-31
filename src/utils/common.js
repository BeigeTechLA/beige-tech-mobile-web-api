const { updateCredentials, uploadFile } = require('s3-bucket');
const util = require('util');
const path = require('path'); 

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

      const fileObject = {
        path: file.path,   // IMPORTANT: use multer file path
        public_id: file.public_id,
        fileName: file.filename
      };

      await s3Upload(fileObject);

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
