require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5001,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  db: {
    host: process.env.DATABASE_HOST,
    port: process.env.DATABASE_PORT,
    database: process.env.DATABASE_NAME,
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASS
  },
  s3: {
    accessKeyId: process.env.S3_BUCKET_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_BUCKET_SECRET_ACCESS_KEY,
    bucketName: process.env.S3_BUCKET_NAME,
    region: process.env.S3_BUCKET_REGION,
    subFolder: process.env.S3_SUB_FOLDER
  },
  email: {
    user: process.env.EMAIL_USER,
    appPassword: process.env.EMAIL_APP_PASSWORD,
    fromName: process.env.EMAIL_FROM_NAME
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
  }
};
  