import {createUserDTO, User} from "../../../domain/models/User"

export interface UserRepositoryPort {
    create(user: createUserDTO): Promise<User>;
    delete(id: string): Promise<User | null>;
    update(user: User): Promise<User | null>;
    findById(id: string): Promise<User | null>;
    findByName(name: string): Promise<User | null>;
    findAll(): Promise<User[]>;
}