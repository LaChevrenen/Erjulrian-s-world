import express from 'express';
import cors from 'cors';
import userRouter from './routes/user.routes.js'
import inventoryRouter from './routes/inventory.routes.js';
import heroRouter from './routes/hero.routes.js';
import logRouter from './routes/log.routes.js';
import dungeonRouter from './routes/dungeon.routes.js';


const app = express();

app.use(cors({
  origin: 'http://localhost:8080',
  credentials: true
}));
app.use(express.json());

app.use('/user', userRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/heroes', heroRouter);
app.use('/api/logs', logRouter);
app.use('/api/dungeons', dungeonRouter);



export default app;