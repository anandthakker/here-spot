var inquirer = require('inquirer')
var chalk = require('chalk')
var getSpotHistory = require('./aws/get-spot-history')
var instanceTypes = require('./aws/meta.json').instanceTypes

var ondemandPrices = require('./aws/ondemand-prices.json')

module.exports = makeSpotRequest

function makeSpotRequest (ec2, params, cb) {
  var questions = [
    {
      type: 'autocomplete',
      allowOther: true,
      name: 'ImageId',
      message: 'Image Id',
      choices: function (answers) {
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
      type: 'autocomplete',
      name: 'InstanceType',
      message: 'Instance Type',
      choices: instanceTypes,
      when: !params.InstanceType
    },
    {
      type: 'list',
      name: 'Placement',
      message: 'Availability Zone (current price) [avg prices]',
      choices: function (answers) {
        var type = [answers.InstanceType || params.InstanceType]
        var done = this.async()
        getSpotHistory(ec2, '8h', type, function (err, history) {
          if (err) { throw err }
          history
          .sort((a, b) => a.current.SpotPrice - b.current.SpotPrice)
          var choices = history.map((z) => {
            var desc = getSpotHistory.format(z)
            return {
              name: desc,
              short: z.zone + ' (' + z.current.SpotPrice + ')',
              value: z
            }
          })

          // TODO: hack -- only grabbing linux price
          var ondems = ondemandPrices.filter((d) => (d.instanceType === type[0] &&
                                                     d.region === ec2.config.region &&
                                                     d.os === 'Linux'))

          var basePrice = Math.max.apply(null, ondems.map((d) => +d.price))
          if (basePrice > 0) {
            var ondemandChoices = [
              new inquirer.Separator(),
              { name: 'On Demand (' + basePrice + ')', value: 'ONDEMAND' }
            ]
            if (basePrice < +history[0].averages[0].mean) {
              choices = ondemandChoices.reverse().concat(choices)
            } else {
              choices = choices.concat(ondemandChoices)
            }
          }

          done(choices)
        })
      }
    },
    {
      name: 'SpotPrice',
      message: 'Max price ($/hour)',
      default: function (answers) {
        if (answers.Placement === 'ONDEMAND') { return null }
        var price = +answers.Placement.current.SpotPrice
        price = Math.ceil(price * 1100) / 1000 // default to 10% above current, rounded
        answers.Placement = { AvailabilityZone: answers.Placement.zone }
        return price
      },
      filter: String,
      when: function (answers) { return answers.Placement !== 'ONDEMAND' }
    },
    {
      type: 'autocomplete',
      name: 'KeyName',
      message: 'Key name',
      choices: function (answers) {
        var done = this.async()
        ec2.describeKeyPairs({}, function (err, data) {
          if (err) { throw err }
          done(data.KeyPairs.map((kp) => ({
            name: kp.KeyName + chalk.dim(' (' + kp.KeyFingerprint + ')'),
            short: kp.KeyName,
            value: kp.KeyName
          })))
        })
      },
      when: !params.KeyName
    },
    {
      type: 'autocomplete',
      name: 'SecurityGroupIds',
      message: 'Security group',
      choices: function (answers) {
        var done = this.async()
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

  inquirer.prompt(questions, function (answers) {
    Object.assign(answers, params)

    var price = answers.SpotPrice
    delete answers.SpotPrice
    var dryrun = !!answers.DryRun
    delete answers.DryRun

    if (answers.Placement !== 'ONDEMAND') {
      var requestParams = {
        SpotPrice: price,
        DryRun: dryrun,
        ClientToken: Math.random().toString(16),
        InstanceCount: 1,
        LaunchSpecification: makeLaunchSpecification(answers),
        Type: 'one-time',
        ValidFrom: null,
        ValidUntil: null
      }

      ec2.requestSpotInstances(requestParams, cb)
    } else {
      delete answers.Placement
      var spec = makeLaunchSpecification(answers)
      spec.MinCount = 1
      spec.MaxCount = 1
      ec2.runInstances(spec, cb)
    }
  })
}

function makeLaunchSpecification (answers) {
  var spec = Object.assign({
    // BlockDeviceMappings: [],
    EbsOptimized: false,
    Monitoring: {
      Enabled: false /* required */
    },
    Placement: {
      AvailabilityZone: 'us-west-2a'
    }
  }, answers)
  return spec
}

