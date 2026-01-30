import express from 'express';
import {forward} from '../services/proxy.service.js'
import {auth} from "../middlewares/auth.middlewares.js";

const router = express.Router();

router.get('/user/connect', (req, res) => {
    forward(req, res, 'http://localhost:3001');
});

router.get('/user', auth, (req, res) => {
    forward(req, res, 'http://localhost:3001');
});

export default router;