#!/usr/bin/env bun
import { Command, Option, program } from 'commander'
import { description, version, dependencies } from './package.json'
import fs from 'fs'
import path from 'path'
import Mustache from 'mustache'
import { allFakers } from '@faker-js/faker'
import type { Faker } from '@faker-js/faker'

abstract class Default {
  public static LANG: string = 'en'
  public static TOTAL_RECORDS: number = 1000
}

enum Extension {
  DEFAULT = 'default',
  CSV = 'csv',
  JSON = 'json',
}

const Message = {
  VERSION: `@bilbatez/fake ${version}
${description}
using fakerjs ${dependencies['@faker-js/faker']}`,
  STARTING: `Starting fake data generation...`,
  COMPLETE: (totalRecords: number) =>
    `Generation completed! Total records: ${totalRecords}`,
}

const HelpMessage = {
  VERSION: 'output the current version',
  TEMPLATE: 'the template for a single record in file format',
  OUTPUT: 'generated output file',
  TOTAL_RECORDS: 'total number of records to generate',
  LANGUAGE: 'language to use for faker',
  EXTENSION:
    'output file extension, default will process template without any additional logic',
}

const ErrorMessage = {
  INVALID_TAG: (tag: string) => `Invalid tag: ${tag}`,
  INVALID_LOCALE: (lang: string) => `Invalid locale: ${lang}`,
  INVALID_MODULE: (faker: string, module: string) =>
    `Invalid ${module} module for ${faker} instance`,
  INVALID_FUNCTION: (faker: string, func: string) =>
    `Invalid ${func} function for ${faker} instance`,
  INVALID_CSV_TEMPLATE: () => 'Invalid CSV template',
  MISSING: (missing: string) => `Missing ${missing}`,
}

/**
 * Throws an error with the given message.
 * If no message is provided, it will default to "Unexpected Error, contact maintainer!".
 * @param {string} [message] - The error message to be thrown.
 * @throws {Error} - An error with the given message.
 */
function err(message?: string): never {
  throw new Error(message ?? 'Unexpected Error, contact maintainer!')
}

/**
 * Main entry point of fake cli
 * @returns {boolean} - True if the execution is successful
 */
function main(): boolean {
  const program: Command = init()

  const templateSrc: string = program.args[0] ?? err()
  const outputSrc: string = program.args[1] ?? err()

  const opts = program.opts()
  const totalRecords = opts.totalRecords ?? Default.TOTAL_RECORDS
  const lang = opts.lang ?? Default.LANG
  const ext = opts.extension ?? Extension.DEFAULT

  return execute(templateSrc, outputSrc, totalRecords, lang, ext)
}

/**
 * Initializes the command line interface for the faker-cli
 * @returns {Command} - The initialized command line interface
 */
function init(): Command {
  program
    .name('fake')
    .version(Message.VERSION, '-V,--version')
    .description(description)
    .argument('<template>', HelpMessage.TEMPLATE)
    .argument('<output>', HelpMessage.OUTPUT)
    .addOption(
      new Option(
        '-t,--total-records <number>',
        HelpMessage.TOTAL_RECORDS
      ).default(Default.TOTAL_RECORDS)
    )
    .addOption(
      new Option('-l,--lang <string>', HelpMessage.LANGUAGE).default(
        Default.LANG
      )
    )
    .addOption(
      new Option('-x,--extension <string>', HelpMessage.EXTENSION).choices(
        Object.values(Extension)
      )
    )

  program.showHelpAfterError()
  program.parse()
  return program
}

/**
 * Checks if a given language is valid for the current allFakers instance.
 *
 * @param lang - The language to check.
 * @returns The language if it is valid, otherwise an error.
 */
function isValidLocale(lang: string): keyof typeof allFakers {
  return lang in allFakers
    ? (lang as keyof typeof allFakers)
    : err(ErrorMessage.INVALID_LOCALE(lang))
}

/**
 * Retrieves the value of a given key from an object.
 * @param obj - The object to search for the key
 * @param key - The key to search for in the object
 * @returns The value associated with the key if found, otherwise undefined
 */
function getValueByKey(obj: object, key: string): unknown {
  return Object.entries(obj)
    .find(([objectKey]) => objectKey === key)
    ?.at(1)
}

/**
 * Validates a given template by extracting all mustache tags and validating them against a faker instance.
 * @param {string} lang - The language to use for faker
 * @param {Faker} faker - The faker instance to validate against
 * @param {string} template - The template to validate
 * @returns {Record<string, any>} - A record containing the validated tags and their corresponding faker functions
 */
function isValidTemplate(
  lang: string,
  faker: Faker,
  template: string
): Record<string, any> {
  const tags = extractMustacheTags(template)
  return tags
    .map((tag): [string, [string, () => any]] => {
      const [mod, func] = tag.split('.')
      if (mod == null) err(ErrorMessage.MISSING('faker module'))
      const moduleRef = getValueByKey(faker, mod)
      if (typeof moduleRef !== 'object' || moduleRef === null)
        err(ErrorMessage.INVALID_MODULE(lang, mod))

      if (func == null) err(ErrorMessage.MISSING('faker function'))
      const entry = getValueByKey(moduleRef, func)
      if (typeof entry !== 'function')
        err(ErrorMessage.INVALID_FUNCTION(lang, func))

      return [mod, [func, entry as () => any]]
    })
    .reduce((acc: Record<string, any>, [module, [func, entry]]) => {
      acc[module] ??= {}
      acc[module][func] = entry()
      return acc
    }, {})
}

/**
 * Extracts all mustache tags from the given template.
 * @param {string} template - The template to extract tags from
 * @returns {string[]} - An array of strings representing the tags found in the template
 */
function extractMustacheTags(template: string): string[] {
  const REGEX = /{{\s*([#/^!]?)\s*([\w.]+)\s*}}/g
  const tags = new Set()
  for (const [, , tag] of template.matchAll(REGEX)) {
    tags.add(tag)
  }
  return [...tags].filter((tag): tag is string => tag != null && tag !== '')
}

/**
 * Returns an array of strings which represent the start and end tags,
 * record separator and record template for the given file extension.
 * The returned array is in the format of [startTag, endTag, recordSeparator, recordTemplate].
 * @param {string} template - The template to be formatted
 * @param {string} extension - The file extension to be formatted for
 * @returns {Array<string>} - An array of strings representing the start and end tags, record separator and record template
 */
function getFileFormat(
  template: string,
  extension: string
): [string, string, string, string] {
  switch (extension) {
    case Extension.CSV:
      const templateParts = template.split('\n')
      if (templateParts.length != 2) {
        err(ErrorMessage.INVALID_CSV_TEMPLATE())
      }
      const [header, recordTemplate] = templateParts
      return [header ?? '', '', '\n', recordTemplate ?? '']
    case Extension.JSON:
      return ['[', ']', ',\n', template]
    default:
      return ['', '', '\n', template]
  }
}

/**
 * Executes the fake cli by reading the template from the given source,
 * writing the generated output to the given destination, and generating
 * the given number of records.
 * @param {string} templateSrc - The path to the template file
 * @param {string} outputDest - The path to the output file
 * @param {number} totalRecords - The total number of records to generate
 * @param {string} lang - The language to use for faker
 * @param {string} extension - The file extension to write the output in
 * @returns {boolean} - True if the execution is successful
 */
function execute(
  templateSrc: string,
  outputDest: string,
  totalRecords: number,
  lang: string,
  extension: string
): boolean {
  console.info(Message.STARTING)
  const faker = allFakers[isValidLocale(lang)]
  const cwd = process.cwd()
  const template = fs.readFileSync(path.join(cwd, templateSrc), 'utf-8')
  const [header, footer, separator, recordTemplate] = getFileFormat(
    template,
    extension
  )
  const writeStream = fs.createWriteStream(path.join(cwd, outputDest))
  header ?? writeStream.write(header + '\n')
  for (let i = 0; i < totalRecords; i++) {
    const rendered = Mustache.render(
      recordTemplate,
      isValidTemplate(lang, faker, recordTemplate)
    )
    writeStream.write(rendered + (totalRecords - 1 == i ? '' : separator))
  }
  writeStream.write(footer)
  writeStream.end(() => {
    console.info(Message.COMPLETE(totalRecords))
  })
  return true
}

main()
