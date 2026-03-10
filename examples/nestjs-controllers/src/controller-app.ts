import "reflect-metadata";

import { pathToFileURL } from "node:url";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { BodySchema, ItemSchema, QuerySchema, UsersService } from "./shared.js";

@Controller("api")
class ApiController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Get("users/:id")
  getUser(@Param("id") id: string) {
    return this.usersService.findById(id);
  }

  @Get("query")
  getQuery(@Query() query: Record<string, unknown>) {
    const parsed = QuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return { limit: parsed.data.limit };
  }

  @Post("items")
  createItem(@Body() body: unknown) {
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return ItemSchema.parse({
      id: `item-${parsed.data.name}`,
      name: parsed.data.name,
    });
  }

  @Get("error")
  getError() {
    throw new NotFoundException("missing");
  }
}

@Module({
  controllers: [ApiController],
  providers: [UsersService],
})
class ControllerExampleModule {}

export async function createControllerApp() {
  const app = await NestFactory.create(ControllerExampleModule, { logger: false });
  app.setGlobalPrefix("v1");
  await app.init();
  return app;
}

export async function startControllerApp(port = Number(process.env.PORT ?? 3001)) {
  const app = await createControllerApp();
  await app.listen(port);
  console.log(`NestJS controller example listening on http://localhost:${port}/v1/api`);
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startControllerApp();
}
