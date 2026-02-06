import {Router} from 'express';
import {forward} from '../services/proxy.service.js';
import {auth} from '../middlewares/auth.middlewares.js';
const LOG_SERVICE_URL = 'http://log-api:3009';


const logRouter = Router();

logRouter.get('/', auth, (req, res) => {
    forward(req, res, LOG_SERVICE_URL);
});
logRouter.post('/', auth, (req, res) => {
    forward(req, res, LOG_SERVICE_URL);
});
logRouter.get('/:logId', auth, (req, res) => {
    forward(req, res, LOG_SERVICE_URL);
});

export default logRouter;