# Fake

I created this script so I can generate big files with random data and import it to the database I'm currently using or testing. This script is meant to be minimal and to the point.

In case it's not obvious, it's using [faker-js](https://github.com/faker-js/faker) library as the data generation engine.

> **Warning!** this script is rushed and minimally tested, so it might and will break sometimes.  
> If it does please submit your use case in the issues tab. (or create a PR to fix it)

## Installation

TBC

## Usage

Using the script is straightforward enough. Please explore the `examples` folder for the template and rendered output. Basically you provide a template for a single record for this script to render into a file of your choosing. To determine what fakerjs should render, you should use the mustache format and specify fakerjs module with the function e.g.:

- `{{airline.aircraftType}}`
- `{{internet.email}}`
- `{{person.fullName}}`

The available modules are listed in <https://fakerjs.dev/api/> modules section

The available localizations are listed here <https://fakerjs.dev/guide/localization.html>

```bash
Usage: fake [options] <template> <output>

Generate fake data!

Arguments:
  template                     the template for a single record in file format
  output                       generated output file

Options:
  -V,--version                 output the version number
  -t,--total-records <number>  total number of records to generate (default: 1000)
  -l,--lang <string>           language to use for faker (default: "en")
  -x,--extension <string>      output file extension, default will process template without any additional
                               logic (choices: "default", "csv", "json")
  -h, --help                   display help for command
```

## DIY Customization

I'll try my best to keep the script as small as possible while easy to read and extend. You can clone this repo, modify the script based on your needs and just install it in your local.
