import {createUserDTO, User} from "../models/User";
import {UserServicePort} from "../../application/ports/inbound/UserServicePort";
import {UserRepositoryPort} from "../../application/ports/outbound/UserRepositoryPort";
import jwt, {Jwt} from "jsonwebtoken";
export class UserService implements UserServicePort {

    constructor(private repo: UserRepositoryPort) {}

    // Configuration JWT
    JWT_SECRET = process.env.JWT_SECRET || 'votre-secret-tres-securise';
    JWT_EXPIRATION = '24h';

    async connect(name: string): Promise<string | null> {
        const user = await this.repo.findByName(name);
        if (!user) return null;
        const token = jwt.sign({
            id: user.id,
            name: user.name,
            isAdmin: user.isAdmin
        }, this.JWT_SECRET);
        return Promise.resolve(token);
    }

    async create(data: createUserDTO): Promise<User | null> {
        return this.repo.create(data);
    }

    async delete(id: string): Promise<User | null> {
        return this.repo.delete(id);
    }

    async findById(id: string): Promise<User | null> {
        return this.repo.findById(id);
    }

    async findByName(name: string): Promise<User | null> {
        return this.repo.findByName(name);
    }

    async update(user: User): Promise<User | null> {
        return this.repo.update(user);
    }

    async findAll(): Promise<User[]> {
        return this.repo.findAll();
    }


}