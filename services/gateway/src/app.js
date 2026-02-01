import express from 'express';
import userRouter from './routes/user.routes.js'
import inventoryRouter from './routes/inventory.routes.js';
import heroRouter from './routes/hero.routes.js';

const app = express();

app.use(express.json());

app.use('/user', userRouter);
app.use('/inventory', inventoryRouter);
app.use('/hero{es}', heroRouter);



export default app;