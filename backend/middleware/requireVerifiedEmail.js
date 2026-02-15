export default function requireVerifiedEmail(req, res, next) {
  try {
    const user = req.user || null;
    if (!user) return res.status(401).json({ message: 'Not authenticated' });
    if (!user.emailVerified) return res.status(403).json({ message: 'Email address must be verified to perform this action' });
    return next();
  } catch (e) {
    return res.status(500).json({ message: 'Server error' });
  }
}
