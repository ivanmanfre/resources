#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const core = require('../core.js');
const [csvPath, criteriaPath, outputPath] = process.argv.slice(2);
if (!csvPath || !criteriaPath || !outputPath) {
  console.error('Usage: node kit/run-review.cjs connections.csv buyer-criteria.json output-folder');
  process.exitCode = 1;
} else {
  try {
    const rules = JSON.parse(fs.readFileSync(criteriaPath, 'utf8'));
    const run = core.analyze(core.parseCsv(fs.readFileSync(csvPath, 'utf8')), rules);
    const output = path.resolve(outputPath);
    const files = {
      'decisions.csv': core.toCsv(run.results),
      'review-prompt.txt': core.buildReviewPrompt(run.results.filter(row => row.status === 'investigate'), rules),
      'summary.json': JSON.stringify({total:run.total,counts:run.counts},null,2)+'\n'
    };
    for (const name of Object.keys(files)) if (fs.existsSync(path.join(output,name))) throw new Error('Output already exists: '+name+'. Choose a fresh output folder.');
    fs.mkdirSync(output,{recursive:true});
    for (const [name,content] of Object.entries(files)) fs.writeFileSync(path.join(output,name),content,{flag:'wx'});
    console.log(JSON.stringify({total:run.total,counts:run.counts,output},null,2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
