#!/usr/bin/env node

var inquirer = require('inquirer')
inquirer.registerPrompt('autocomplete', require('./autocomplete'))

var instanceTypes = require('./aws-meta.json').instanceTypes
var regions = require('./aws-meta.json').regions

var questions = [
  {
    type: 'autocomplete',
    name: 'InstanceType',
    message: 'Instance Type',
    choices: instanceTypes
  },
  {
    type: 'autocomplete',
    name: 'region',
    message: 'Region',
    choices: regions
  },
  {
    type: 'autocomplete',
    name: 'Placement',
    message: 'Availability Zone',
    choices: function (answers) {
      var region = answers.region
      delete answers.region
      var done = this.async()
      done([region + 'a', region + 'b'])
    }
  },
  {
    name: 'SpotPrice',
    message: 'Max price ($/hour)'
  },
  {
    type: 'input',
    name: 'KeyName',
    message: 'Key pair name'
  }
]

inquirer.prompt(questions, makeRequest)

function configureInstance (answers) {
  var spec = Object.assign({
    BlockDeviceMappings: [],
    EbsOptimized: false,
    // IamInstanceProfile: {
    //   Arn: 'STRING_VALUE',
    //   Name: 'STRING_VALUE'
    // },
    // ImageId: 'STRING_VALUE',
    // KernelId: 'STRING_VALUE',
    // KeyName: 'STRING_VALUE',
    Monitoring: {
      Enabled: false /* required */
    },
    Placement: {
      AvailabilityZone: 'us-west-2a'
      // GroupName: 'STRING_VALUE'
    },
    RamdiskId: 'STRING_VALUE',
    SecurityGroupIds: [
      'STRING_VALUE'
      /* more items */
    ],
    SecurityGroups: [
      'STRING_VALUE'
      /* more items */
    ],
    SubnetId: 'STRING_VALUE',
    UserData: 'STRING_VALUE'
  }, answers)
  return spec
}

function makeRequest (answers) {
  console.log(answers)
  var price = answers.SpotPrice
  delete answers.SpotPrice

  var params = {
    SpotPrice: price,
    // AvailabilityZoneGroup: 'STRING_VALUE',
    // BlockDurationMinutes: 0,
    ClientToken: Math.random().toString(16),
    DryRun: false,
    InstanceCount: 1,
    // LaunchGroup: 'STRING_VALUE',
    LaunchSpecification: configureInstance(answers),
    Type: 'one-time',
    ValidFrom: new Date(),
    ValidUntil: new Date(Date.now() + 86400000)
  }

  return params

  // ec2.requestSpotInstances(params, function(err, data) {
  //   if (err) console.log(err, err.stack); // an error occurred
  //   else     console.log(data);           // successful response
  // })
}
