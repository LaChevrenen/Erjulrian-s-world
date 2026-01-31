import express from 'express';
import {forward} from '../services/proxy.service.js'
import {auth} from "../middlewares/auth.middlewares.js";
const USER_SERVICE_URL = 'http://localhost:3001';
const router = express.Router();

router.post('/user/connect', (req, res) => {
    forward(req, res, USER_SERVICE_URL);
});

router.get('/user', auth, (req, res) => {
    forward(req, res, USER_SERVICE_URL);
});
router.post('/user', (req, res) => {
    forward(req, res, USER_SERVICE_URL);
});
router.put('/user', auth, (req, res) => {
    forward(req, res, USER_SERVICE_URL);
});


export default router;