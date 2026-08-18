const jwt = require('jsonwebtoken');

const generateToken = (id, tokenVersion = 0) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not set. Set JWT_SECRET in environment variables.');
  }
  return jwt.sign({ id, tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

module.exports = generateToken;
