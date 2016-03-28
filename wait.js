var chalk = require('chalk')
var inquirer = require('inquirer')
var stripAnsi = require('strip-ansi')

module.exports = handlePendingRequest

function handlePendingRequest (ec2, data) {
  var id = data.SpotInstanceRequests[0].SpotInstanceRequestId
  console.log('\nSpot Request ID: ' + id + '\n' +
              data.SpotInstanceRequests[0].Status.Message || '')
  inquirer.prompt({
    type: 'list',
    name: 'action',
    message: 'Now what?',
    choices: [
      { name: 'Wait and log in', value: 'wait' },
      { name: 'Cancel request', value: 'cancel' },
      { name: 'Show spot request JSON', value: 'show' }
    ]
  }, function (answer) {
    if (answer.action === 'cancel') {
      cancel(ec2, id)
    } else if (answer.action === 'show') {
      console.log(JSON.stringify(data))
    } else {
      wait(ec2, id, data)
    }
  })
}

var message = ''
var count = 0
function wait (ec2, id, data) {
  next()
  function next () {
    var status = getStatus(data)
    process.stdout.write('\r' + blank(message))
    if (status === 'fulfilled') {
      fulfilled(ec2, data)
    } else if (!/pending/.test(getStatus(data))) {
      console.log('\n' + chalk.red(getMessage(data)))
      if (status === 'price-too-low') {
        handlePendingRequest(ec2, data)
      }
    } else {
      message = getStatus(data) + Array.apply(0, Array(count)).map((x) => '.').join('')
      process.stdout.write('\r ' + message)
      setTimeout(next, 10000)
    }
    ec2.describeSpotInstanceRequests({SpotInstanceRequestIds: [id]}, function (err, nextData) {
      if (err) { return console.error(err) }
      count++
      data = nextData
    })
  }

  function getStatus (data) { return data.SpotInstanceRequests[0].Status.Code }
  function getMessage (data) { return data.SpotInstanceRequests[0].Status.Message }
}

function fulfilled (ec2, data) {
  console.log('\n' + chalk.green('Spot request fulfilled!'))
  var instanceId = data.SpotInstanceRequests[0].InstanceId
  ec2.describeInstances({InstanceIds: [instanceId]}, function (err, data) {
    if (err) { throw err }
    var inst = data.Reservations[0].Instances[0]
    var key = inst.KeyName
    var ip = inst.PublicIpAddress
    console.log('Log in with:')
    console.log('\tssh ' + ip + ' -i ' + key + '.pem [-l LOGIN]')
  })
}

function blank (msg) { return stripAnsi(msg).split('').map((x) => ' ').join('') }

function cancel (ec2, id) {
  ec2.cancelSpotInstanceRequests({SpotInstanceRequestIds: [id]}, function (err, data) {
    if (err) {
      console.log(chalk.red('Error cancelling spot request ') + chalk.white(id))
    } else {
      console.log('Cancelled request ' + id)
    }
  })
}
