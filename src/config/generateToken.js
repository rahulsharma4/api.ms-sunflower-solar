const jwt = require('jsonwebtoken');

const getJwtSecret = () => {
  const raw = (process.env.JWT_SECRET || process.env.SECRET || process.env.APP_JWT_SECRET || '').toString().trim();
  return raw === '' ? null : raw;
};

const generateToken = (id, tokenVersion = 0) => {
  const secret = getJwtSecret();
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Set JWT_SECRET in environment variables.');
  }
  return jwt.sign({ id, tokenVersion }, secret, {
    expiresIn: '30d',
  });
};

module.exports = generateToken;
