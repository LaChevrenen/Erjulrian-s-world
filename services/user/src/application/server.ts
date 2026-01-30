import express from 'express';
import path from 'path';
import * as fs from "node:fs";
import * as YAML from 'yaml';
import swaggerUi from 'swagger-ui-express';

import {UserRepositoryAdapter} from "../infrastructure/adapters/userRepositoryAdapter";
import { UserService } from "../domain/services/UserService";
import { UserController } from "../presentation/controllers/userController";
import { errorHandler } from "./errorHandling";

const app = express();
app.use(express.json());


const file  = fs.readFileSync(require.resolve('../api/user.yml'), 'utf8')
const swaggerDocument = YAML.parse(file)

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const userRepo = new UserRepositoryAdapter();
const userService = new UserService(userRepo);
const userController = new UserController(userService);
userController.registerRoutes(app);

app.use(errorHandler);

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/docs`);
});
