import {Router} from 'express';
import {forward} from '../services/proxy.service.js';
import {auth} from '../middlewares/auth.middlewares.js';
const LOG_SERVICE_URL = 'http://log-api:3009';


const logRouter = Router();

// List all logs
logRouter.get('/', auth, (req, res) => {
    forward(req, res, LOG_SERVICE_URL);
});
// Create a log entry 
logRouter.post('/', auth, (req, res) => {
    forward(req, res, LOG_SERVICE_URL);
});
// Get Log by id
logRouter.get('/:logId', auth, (req, res) => {
    forward(req, res, LOG_SERVICE_URL);
});

export default logRouter;