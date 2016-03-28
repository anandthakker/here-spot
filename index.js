#!/usr/bin/env node

var inquirer = require('inquirer')
var AWS = require('aws-sdk')
var camel = require('uppercamelcase')
var argv = require('minimist')(process.argv.slice(2))
var spotRequest = require('./request')
var handlePendingRequest = require('./wait')
var regions = require('./aws/meta.json').regions

inquirer.registerPrompt('autocomplete', require('./autocomplete'))

var params = {}
var ec2
// setup ec2 client, then configure the spot request
inquirer.prompt([{
  type: 'autocomplete',
  name: 'region',
  message: 'Region',
  choices: regions,
  when: !argv.region
}], function (answer) {
  var region = answer.region || argv.region
  ec2 = new AWS.EC2({region: region})
  if (argv.debug) {
    console.error('debug: true, setting AWS logging to stderr')
    ec2.config.update({logger: process.stderr})
  }
  delete argv.region
  delete argv.debug

  // CamelCase command line params
  for (var k in argv) {
    if (k !== '_') {
      params[camel(k)] = argv[k]
    }
  }
  spotRequest(ec2, params, function (err, data) {
    if (err) { throw err }
    handlePendingRequest(ec2, data)
  })
})

