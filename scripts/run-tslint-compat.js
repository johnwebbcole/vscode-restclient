'use strict';

const Module = require('module');
const tsLegacy = require('typescript-legacy');

const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
  if (request === 'typescript' && parent && /node_modules[\\/](tslint|tsutils)[\\/]/.test(parent.filename)) {
    return tsLegacy;
  }

  return originalLoad.call(this, request, parent, isMain);
};

require('tslint/lib/tslintCli');
