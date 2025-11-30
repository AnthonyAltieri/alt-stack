import { writeFileSync } from "fs";
import { generateAsyncAPISpec } from "@alt-stack/workers-warpstream";
import { jobRouter } from "./index.js";

const spec = generateAsyncAPISpec(jobRouter, {
  title: "Real Life Workers",
  version: "1.0.0",
});

writeFileSync("asyncapi.json", JSON.stringify(spec, null, 2));
console.log("Generated asyncapi.json");

