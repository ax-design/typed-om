# Changelog

All notable changes to this package are documented in this file.

## 0.2.1

- Fix the numeric change detector for schemas whose numeric properties may hold a keyword (`<length> | auto`): a keyword no longer poisons the transform-origin hash, so precise observation keeps firing on numeric changes.

## 0.2.0

- `length`, `length-percentage` and `number` syntaxes accept optional `keywords` for union values such as `<length> | auto`; matching computed values are read as strings.

## 0.1.0

- The first release.
