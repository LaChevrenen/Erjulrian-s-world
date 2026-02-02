import jwt from 'jsonwebtoken';

const JWT_SECRET = 'notre-super-secret-securise';


export function auth (req, res, next) {
    // Get the token
    const authHeader = req.headers.authorization;
    if(!authHeader) {
        return res.status(401).json({message:'Access denied. No token provided'});
    }

    const parts = authHeader.split(' ');

    // Check if valid JWT format
    if(parts.length != 2 || parts[0] != "Bearer") {
        return res.status(401).json({message:`Access denied. Token is not valid̀ (token:\n${authHeader.token})`});
    }

    const token = parts[1]

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired Token' });
    }
};