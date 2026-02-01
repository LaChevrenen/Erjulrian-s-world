import Router from 'express';
import {forward} from '../services/proxy.service.js';
import {auth} from '../middlewares/auth.middlewares.js';
const USER_SERVICE_URL = 'http://localhost:3001';


const userRouter = Router();

// --- No auth routes --
// Connect
userRouter.post('/connect', (req, res) => {
    forward(req, res, USER_SERVICE_URL);
});
// CreateUser
userRouter.post('/', (req, res) => {
    forward(req, res, USER_SERVICE_URL);
});

// -- Auth routes --
// Check if user name exists
userRouter.get('/check/:name', (req, res) => {
    forward(req, res, USER_SERVICE_URL);
});
// Get all users : CheckAdmin to do 
userRouter.get('/', auth, (req, res) => {
    forward(req, res, USER_SERVICE_URL);
});
// Modify the user 
userRouter.put('/', auth, (req, res) => {
    forward(req, res, USER_SERVICE_URL);
});
// Get User by id
userRouter.get('/:id', auth, (req, res) => {
    forward(req, res, USER_SERVICE_URL);
});
// Delete User by id
userRouter.delete('/:id', auth, (req, res) => {
    forward(req, res, USER_SERVICE_URL);
});

export default userRouter;