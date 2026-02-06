import { Router } from 'express';
import {forward} from '../services/proxy.service.js';
import {auth} from '../middlewares/auth.middlewares.js';
const USER_SERVICE_URL = 'http://user-api:3001';


const userRouter = new Router();

userRouter.post('/connect', (req, res) => {
    forward(req, res, USER_SERVICE_URL);
});
userRouter.post('/', (req, res) => {
    forward(req, res, USER_SERVICE_URL);
});

userRouter.get('/check/:name', (req, res) => {
    forward(req, res, USER_SERVICE_URL);
});
userRouter.get('/', auth, (req, res) => {
    forward(req, res, USER_SERVICE_URL);
});
userRouter.put('/', auth, (req, res) => {
    forward(req, res, USER_SERVICE_URL);
});
userRouter.get('/:id', auth, (req, res) => {
    forward(req, res, USER_SERVICE_URL);
});
userRouter.delete('/:id', auth, (req, res) => {
    forward(req, res, USER_SERVICE_URL);
});

export default userRouter;