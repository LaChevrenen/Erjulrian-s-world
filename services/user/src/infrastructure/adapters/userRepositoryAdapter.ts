import {User, createUserDTO} from "../../domain/models/User";
import {UserRepositoryPort} from "../../application/ports/outbound/UserRepositoryPort";

import { v4 as uuidv4 } from 'uuid';

export class UserRepositoryAdapter implements UserRepositoryPort {
    constructor(private readonly store: User[] = [
        {
            "id": "006685cc-b092-4dca-8037-30ee06dc0be6",
            "name": "notAdmin",
            "isAdmin": false
        },
        {
            "id": "ee3ee54c-2222-2222-1234-eeeeaaaabbbb",
            "name": "admin",
            "isAdmin": true
        }
    ]) {}

    async findAll(): Promise<User[]> {
        return this.store.slice();
    }

    async findById(id: string): Promise<User | null> {
        const found = this.store.find((u) => u.id === id);
        return found ?? null;
    }

    findByName(name: string): Promise<User | null> {
        const user = this.store.find((u) => u.name === name);
        return Promise.resolve(user ?? null);
    }

    async create(user: createUserDTO): Promise<User> {
        const uuid = uuidv4();
        const newUser: User = new User(uuid, user.name, user.isAdmin);
        this.store.push(newUser);
        return newUser;
    }

    async delete(id: string): Promise<User | null> {
        const index = this.store.findIndex((u) => u.id === id);
        if (index > -1) {
            const deleted = (this.store.splice(index, 1)[0]);
            return Promise.resolve(deleted);
        }
        return Promise.resolve(null);
    }




    update(user: User): Promise<User | null> {
        const updatedUser = this.store.find(u => u.id === user.id);
        if(updatedUser) {
            updatedUser.name = user.name;
            updatedUser.isAdmin = user.isAdmin;
        }
        return Promise.resolve(updatedUser ?? null);
    }

}