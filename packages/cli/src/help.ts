import { optionNameFromKey } from "./descriptors.js";
import { isCliCommand, type AnyCliCommand } from "./procedure.js";
import { CliRouter, isCliRouter } from "./router.js";

export interface CliIdentity {
  name: string;
  version: string;
  description?: string;
}

function renderRows(
  heading: string,
  rows: readonly (readonly [label: string, description: string])[],
): string[] {
  if (rows.length === 0) return [];
  const width = Math.max(...rows.map(([label]) => label.length));
  return [
    `${heading}:`,
    ...rows.map(
      ([label, description]) =>
        `  ${label.padEnd(width)}  ${description}`.trimEnd(),
    ),
  ];
}

function commandUsage<TContext extends object>(
  identity: CliIdentity,
  commandPath: readonly string[],
  command: AnyCliCommand<TContext>,
): string {
  const argumentsUsage = Object.entries(command.args).map(
    ([key, descriptor]) => {
      const name = descriptor.metavar ?? key;
      if (descriptor.kind === "variadic-argument") return `[${name}...]`;
      return descriptor.optional ? `[${name}]` : `<${name}>`;
    },
  );
  return [identity.name, ...commandPath, ...argumentsUsage, "[options]"].join(
    " ",
  );
}

export function renderRouterHelp<TContext extends object>(
  identity: CliIdentity,
  commandPath: readonly string[],
  router: CliRouter<TContext, string, string>,
): string {
  const title = [identity.name, ...commandPath].join(" ");
  const description =
    commandPath.length === 0 ? identity.description : router.metadata.description;
  const commandRows = Object.entries(router.getChildren()).map(
    ([name, node]) => [
      name,
      isCliRouter(node)
        ? (node.metadata.description ?? "")
        : isCliCommand(node)
          ? (node.description ?? "")
          : "",
    ] as const,
  );
  const optionRows = [
    ["-h, --help", "Show help"],
    ...(commandPath.length === 0
      ? [["--version", "Show version"] as const]
      : []),
  ] as const;

  return [
    `Usage: ${title} <command>`,
    ...(description ? ["", description] : []),
    "",
    ...renderRows("Commands", commandRows),
    "",
    ...renderRows("Options", optionRows),
  ]
    .join("\n")
    .trimEnd();
}

export function renderCommandHelp<TContext extends object>(
  identity: CliIdentity,
  commandPath: readonly string[],
  command: AnyCliCommand<TContext>,
): string {
  const argumentRows = Object.entries(command.args).map(
    ([key, descriptor]) => [
      descriptor.metavar ?? key,
      descriptor.description ?? "",
    ] as const,
  );
  const optionRows = Object.entries(command.options).map(
    ([key, descriptor]) => {
      const longName = optionNameFromKey(key);
      const value =
        descriptor.kind === "option"
          ? ` <${descriptor.metavar ?? longName}>`
          : "";
      const short = descriptor.short ? `-${descriptor.short}, ` : "";
      return [
        `${short}--${longName}${value}`,
        descriptor.description ?? "",
      ] as const;
    },
  );
  optionRows.push(["-h, --help", "Show help"]);

  return [
    `Usage: ${commandUsage(identity, commandPath, command)}`,
    ...(command.description ? ["", command.description] : []),
    ...(argumentRows.length > 0
      ? ["", ...renderRows("Arguments", argumentRows)]
      : []),
    "",
    ...renderRows("Options", optionRows),
  ]
    .join("\n")
    .trimEnd();
}
