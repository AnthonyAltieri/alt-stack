import { Injectable } from "@nestjs/common";
import { z } from "zod";

export const QuerySchema = z.object({
  limit: z.coerce.number().min(1),
});

export const BodySchema = z.object({
  name: z.string().min(1),
});

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type User = z.infer<typeof UserSchema>;

@Injectable()
export class UsersService {
  findById(id: string): User {
    return { id, name: `User ${id}` };
  }
}
