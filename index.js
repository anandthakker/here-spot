#!/usr/bin/env node

var inquirer = require('inquirer')
var AWS = require('aws-sdk')
var chalk = require('chalk')
var camel = require('uppercamelcase')
var argv = require('minimist')(process.argv.slice(2))
var getSpotHistory = require('./aws/get-spot-history')
var instanceTypes = require('./aws/meta.json').instanceTypes
var regions = require('./aws/meta.json').regions

inquirer.registerPrompt('autocomplete', require('./autocomplete'))

var ec2
function getEC2Client (region) {
  if (!ec2) {
    ec2 = new AWS.EC2({region: region})
  } else if (ec2 && region && ec2.config.region !== region) {
    ec2.config.update({region: region})
  }
  return ec2
}

var params = {}
for (var k in argv) {
  if (k !== '_') {
    params[camel(k)] = argv[k]
  }
}

var questions = [
  {
    type: 'autocomplete',
    name: 'Region',
    message: 'Region',
    choices: regions,
    when: !params.Region
  },
  {
    type: 'autocomplete',
    name: 'InstanceType',
    message: 'Instance Type',
    choices: instanceTypes,
    when: !params.InstanceType
  },
  {
    type: 'autocomplete',
    allowOther: true,
    name: 'ImageId',
    message: 'Image Id',
    choices: function (answers) {
      var ec2 = getEC2Client(answers.Region || params.Region)
      delete answers.Region
      delete params.Region
      var done = this.async()
      ec2.describeImages({ Owners: ['self'] }, function (err, data) {
        if (err) { throw err }
        done(data.Images.map((im) => ({
          name: im.ImageId + (im.Name ? (' ( ' + im.Name + ' )') : ''),
          short: im.ImageId,
          value: im.ImageId
        })))
      })
    },
    when: !params.ImageId
  },
  {
    type: 'list',
    name: 'Placement',
    message: 'Availability Zone (current price) [avg prices]',
    choices: function (answers) {
      var ec2 = getEC2Client()
      var type = [answers.InstanceType || params.InstanceType]
      var done = this.async()
      getSpotHistory(ec2, '8h', type, function (err, history) {
        if (err) { throw err }
        var choices = history
        .sort((a, b) => a.current.SpotPrice - b.current.SpotPrice)
        .map((z) => {
          var desc = getSpotHistory.format(z)
          return {
            name: desc,
            short: desc,
            value: z
          }
        })
        done(choices)
      })
    }
  },
  {
    name: 'SpotPrice',
    message: 'Max price ($/hour)',
    default: function (answers) {
      var price = +answers.Placement.current.SpotPrice
      price = Math.ceil(price * 1100) / 1000 // default to 10% above current, rounded
      answers.Placement = { AvailabilityZone: answers.Placement.zone }
      return price
    },
    filter: String
  },
  {
    type: 'autocomplete',
    name: 'KeyName',
    message: 'Key name',
    choices: function (answers) {
      var done = this.async()
      var ec2 = getEC2Client()
      ec2.describeKeyPairs({}, function (err, data) {
        if (err) { throw err }
        done(data.KeyPairs.map((kp) => ({
          name: kp.KeyName + chalk.dim(' (' + kp.KeyFingerprint + ')'),
          short: kp.KeyName,
          value: kp.KeyName
        })))
      })
    }
  },
  {
    type: 'autocomplete',
    name: 'SecurityGroupIds',
    message: 'Security group',
    choices: function (answers) {
      var done = this.async()
      var ec2 = getEC2Client()
      ec2.describeSecurityGroups({}, function (err, data) {
        if (err) { throw err }
        done(data.SecurityGroups.map((sg) => ({
          name: sg.GroupName,
          short: sg.GroupName,
          value: sg.GroupId
        })))
      })
    },
    filter: function (value) { return [value] }
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
    }
    // RamdiskId: 'STRING_VALUE',
    // SubnetId: 'STRING_VALUE',
    // UserData: 'STRING_VALUE'
  }, answers)
  return spec
}

function makeRequest (answers) {
  var price = answers.SpotPrice
  delete answers.SpotPrice
  var dryrun = answers.DryRun
  delete answers.DryRun

  Object.assign(answers, params)

  var requestParams = {
    SpotPrice: price,
    DryRun: dryrun,
    // AvailabilityZoneGroup: 'STRING_VALUE',
    // BlockDurationMinutes: 0,
    ClientToken: Math.random().toString(16),
    InstanceCount: 1,
    // LaunchGroup: 'STRING_VALUE',
    LaunchSpecification: configureInstance(answers),
    Type: 'one-time',
    ValidFrom: new Date(),
    ValidUntil: new Date(Date.now() + 86400000)
  }

  ec2.requestSpotInstances(requestParams, function (err, data) {
    if (err) { throw err }
    console.log(JSON.stringify(data, null, 2))
  })
}
