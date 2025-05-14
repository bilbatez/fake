import { Command, Option, program } from "commander";
import { description, version, dependencies } from "./package.json";
import fs from "fs";
import path from "path";
import Mustache from "mustache";
import { allFakers } from "@faker-js/faker";
import type { Faker } from "@faker-js/faker";

abstract class Default {
  public static LANG: string = "en";
  public static TOTAL_RECORDS: number = 1000;
}

enum Extension {
  DEFAULT = "default",
  CSV = "csv",
  JSON = "json",
}

const Message = {
  VERSION: `@bilbatez/faker-cli ${version}
${description}
using fakerjs ${dependencies["@faker-js/faker"]}`,
  STARTING: `Starting fake data generation...`,
  COMPLETE: `Generation completed!`,
};

const HelpMessage = {
  VERSION: "output the current version",
  TEMPLATE: "the template for a single record in file format",
  OUTPUT: "generated output file",
  TOTAL_RECORDS: "total number of records to generate",
  LANGUAGE: "language to use for faker",
  EXTENSION:
    "output file extension, default will process template without any additional logic",
};

const ErrorMessage = {
  INVALID_TAG: (tag: string) => `Invalid tag: ${tag}`,
  INVALID_LOCALE: (lang: string) => `Invalid locale: ${lang}`,
  INVALID_MODULE: (faker: string, module: string) =>
    `Invalid ${module} module for ${faker} instance`,
  INVALID_FUNCTION: (faker: string, func: string) =>
    `Invalid ${func} function for ${faker} instance`,
  INVALID_CSV_TEMPLATE: () => "Invalid CSV template",
  MISSING: (missing: string) => `Missing ${missing}`,
};

function err(message?: string): never {
  throw new Error(message ?? "Unexpected Error, contact maintainer!");
}

function main() {
  const program: Command = init();

  const templateSrc: string = program.args[0] ?? err();
  const outputSrc: string = program.args[1] ?? err();

  const opts = program.opts();
  const totalRecords = opts.totalRecords ?? Default.TOTAL_RECORDS;
  const lang = opts.lang ?? Default.LANG;
  const ext = opts.extension ?? Extension.DEFAULT;

  return execute(templateSrc, outputSrc, totalRecords, lang, ext);
}

function init(): Command {
  program
    .name("faker-cli")
    .version(Message.VERSION, "-v,--version")
    .description(description)
    .argument("<template>", HelpMessage.TEMPLATE)
    .argument("<output>", HelpMessage.OUTPUT)
    .addOption(
      new Option(
        "-t,--total-records <number>",
        HelpMessage.TOTAL_RECORDS,
      ).default(Default.TOTAL_RECORDS),
    )
    .addOption(
      new Option("-l,--lang <string>", HelpMessage.LANGUAGE).default(
        Default.LANG,
      ),
    )
    .addOption(
      new Option("-x,--extension <string>", HelpMessage.EXTENSION).choices(
        Object.values(Extension),
      ),
    );

  program.showHelpAfterError();
  program.parse();
  return program;
}

function isValidLocale(lang: string): keyof typeof allFakers {
  return lang in allFakers
    ? (lang as keyof typeof allFakers)
    : err(ErrorMessage.INVALID_LOCALE(lang));
}

function getValueByKey(obj: object, key: string): unknown {
  return Object.entries(obj)
    .find(([objectKey]) => objectKey === key)
    ?.at(1);
}

function isValidTemplate(lang: string, faker: Faker, template: string) {
  const tags = extractMustacheTags(template);
  return tags
    .map((tag): [string, [string, () => any]] => {
      const [mod, func] = tag.split(".");
      if (mod == null) err(ErrorMessage.MISSING("faker module"));
      const moduleRef = getValueByKey(faker, mod);
      if (typeof moduleRef !== "object" || moduleRef === null)
        err(ErrorMessage.INVALID_MODULE(lang, mod));

      if (func == null) err(ErrorMessage.MISSING("faker function"));
      const entry = getValueByKey(moduleRef, func);
      if (typeof entry !== "function")
        err(ErrorMessage.INVALID_FUNCTION(lang, func));

      return [mod, [func, entry as () => any]];
    })
    .reduce((acc: Record<string, any>, [module, [func, entry]]) => {
      acc[module] ??= {};
      acc[module][func] = entry();
      return acc;
    }, {});
}

function extractMustacheTags(template: string) {
  const REGEX = /{{\s*([#/^!]?)\s*([\w.]+)\s*}}/g;
  const tags = new Set();
  for (const [, , tag] of template.matchAll(REGEX)) {
    tags.add(tag);
  }
  return [...tags].filter((tag): tag is string => tag != null && tag !== "");
}

function getFileFormat(
  template: string,
  extension: string,
): [string, string, string, string] {
  switch (extension) {
    case Extension.CSV:
      const templateParts = template.split("\n");
      if (templateParts.length != 2) {
        err(ErrorMessage.INVALID_CSV_TEMPLATE());
      }
      const [header, recordTemplate] = templateParts;
      return [header ?? "", "", "\n", recordTemplate ?? ""];
    case Extension.JSON:
      return ["[", "]", ",\n", template];
    default:
      return ["", "", "\n", template];
  }
}

function execute(
  templateSrc: string,
  outputDest: string,
  totalRecords: number,
  lang: string,
  extension: string,
): boolean {
  console.info(Message.STARTING);
  const faker = allFakers[isValidLocale(lang)];
  const cwd = process.cwd();
  const template = fs.readFileSync(path.join(cwd, templateSrc), "utf-8");
  const [header, footer, separator, recordTemplate] = getFileFormat(
    template,
    extension,
  );
  const writeStream = fs.createWriteStream(path.join(cwd, outputDest));
  writeStream.write(header);
  for (let i = 0; i < totalRecords; i++) {
    const rendered = Mustache.render(
      recordTemplate,
      isValidTemplate(lang, faker, recordTemplate),
    );
    writeStream.write(rendered + (totalRecords - 1 == i ? "" : separator));
  }
  writeStream.write(footer);
  writeStream.end(() => {
    console.info(Message.COMPLETE);
  });
  return true;
}

main();
