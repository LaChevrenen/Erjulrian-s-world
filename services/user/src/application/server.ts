import express from 'express';
import path from 'path';
import cors from 'cors';
import * as fs from "node:fs";
import * as YAML from 'yaml';
import swaggerUi from 'swagger-ui-express';

import {UserRepositoryAdapter} from "../infrastructure/adapters/userRepositoryAdapter";
import { UserService } from "../domain/services/UserService";
import { UserController } from "../presentation/controllers/userController";
import { errorHandler } from "./errorHandling";

const app = express();

app.use(cors());
app.use(express.json());


const file  = fs.readFileSync(require.resolve('../../user.yml'), 'utf8')
const swaggerDocument = YAML.parse(file)

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const userRepo = new UserRepositoryAdapter();
const userService = new UserService(userRepo);
const userController = new UserController(userService);
userController.registerRoutes(app);

app.use(errorHandler);

const port = parseInt(process.env.PORT || '3001', 10);

app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${port}`);
  console.log(`Swagger docs at http://0.0.0.0:${port}/docs`);
});
