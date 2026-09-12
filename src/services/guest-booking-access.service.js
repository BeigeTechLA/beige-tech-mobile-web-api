const jwt = require('jsonwebtoken');

const PURPOSE = 'guest_booking_access';

const getSecret = () => process.env.GUEST_BOOKING_ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

function issueGuestBookingAccessToken({ bookingId, guestEmail }) {
  const normalizedGuestEmail = normalizeEmail(guestEmail);
  const secret = getSecret();

  if (!bookingId || !normalizedGuestEmail || !secret) {
    throw new Error('Guest booking access token cannot be issued without booking, email, and signing secret');
  }

  return jwt.sign(
    {
      purpose: PURPOSE,
      bookingId: Number(bookingId),
      guestEmail: normalizedGuestEmail
    },
    secret,
    { expiresIn: process.env.GUEST_BOOKING_ACCESS_TOKEN_EXPIRY || '30d' }
  );
}

function verifyGuestBookingAccessToken(token) {
  const secret = getSecret();
  if (!token || !secret) return null;

  try {
    const payload = jwt.verify(String(token), secret);
    if (
      payload?.purpose !== PURPOSE ||
      !Number.isInteger(Number(payload.bookingId)) ||
      Number(payload.bookingId) <= 0 ||
      !normalizeEmail(payload.guestEmail)
    ) {
      return null;
    }

    return {
      bookingId: Number(payload.bookingId),
      guestEmail: normalizeEmail(payload.guestEmail)
    };
  } catch (_) {
    return null;
  }
}

module.exports = {
  issueGuestBookingAccessToken,
  verifyGuestBookingAccessToken,
  normalizeEmail
};
