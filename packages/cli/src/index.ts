export {
  createCli,
  type CliApplication,
  type CliCommandErrorOutcome,
  type CliContextFactoryOptions,
  type CliExecutedOutcome,
  type CliHelpOutcome,
  type CliOutcome,
  type CliUsageErrorOutcome,
  type CliVersionOutcome,
  type CreateCliOptions,
} from "./application.js";
export type {
  ArgumentDescriptor,
  ArgumentMetadata,
  FlagDescriptor,
  FlagMetadata,
  InferDescriptor,
  InferDescriptorMap,
  OptionDescriptor,
  OptionMetadata,
  VariadicArgumentDescriptor,
  VariadicArgumentMetadata,
} from "./descriptors.js";
export {
  CliDefinitionError,
  CliUsageError,
  type CliDefinitionErrorCode,
  type CliUsageErrorCode,
} from "./errors.js";
export { initCli, type InitCliResult } from "./init.js";
export type { MiddlewareFunction } from "./middleware.js";
export type { CommandHandler, CommandInput } from "./procedure.js";
export type { RouterCommandPaths, RouterMetadata } from "./router.js";
export { runCli, type CliWriter, type RunCliOptions } from "./run.js";

export { err, isErr, isOk, ok, TaggedError } from "@alt-stack/result";
export type { Err, Ok, Result, ResultError } from "@alt-stack/result";
