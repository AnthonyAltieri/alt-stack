import "reflect-metadata";

import { pathToFileURL } from "node:url";
import {
  Body,
  Controller,
  Get,
  Inject,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
  ValidationPipe,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { CreateItemDto, QueryDto } from "./dtos.js";
import { ItemSchema, UsersService } from "./shared.js";

@Controller("api")
class ApiController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Get("users/:id")
  getUser(@Param("id") id: string) {
    return this.usersService.findById(id);
  }

  @Get("query")
  getQuery(
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        expectedType: QueryDto,
      }),
    )
    query: QueryDto,
  ) {
    return { limit: query.limit };
  }

  @Post("items")
  createItem(
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        expectedType: CreateItemDto,
      }),
    )
    body: CreateItemDto,
  ) {
    return ItemSchema.parse({
      id: `item-${body.name}`,
      name: body.name,
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
