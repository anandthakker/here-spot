var ora = require('ora')
var chalk = require('chalk')
var inquirer = require('inquirer')

module.exports = handlePendingRequest

function handlePendingRequest (ec2, data) {
  var type = getType(data)
  var id = getId(data)
  var message = getMessage(data)
  console.log('\n' + 'Request ID: ' + id + '\n' + message)
  inquirer.prompt({
    type: 'list',
    name: 'action',
    message: 'Now what?',
    choices: [
      { name: 'Wait and log in', value: 'wait' },
      type === 'spot' ? { name: 'Cancel request', value: 'cancel' } : null,
      { name: 'Show response JSON', value: 'show' }
    ].filter(Boolean)
  }, function (answer) {
    if (answer.action === 'cancel') {
      cancel(ec2, id)
    } else if (answer.action === 'show') {
      console.log(JSON.stringify(data))
    } else if (type === 'spot') {
      handleSpot(ec2, data)
    } else {
      handleInstance(ec2, id)
    }
  })
}

var spinner = ora('')
function handleSpot (ec2, data) {
  var status = getStatus(data)
  if (status === 'fulfilled') {
    console.log(chalk.green('Spot request fulfilled.'))
    setTimeout(function () { handleInstance(ec2, getInstanceId(data)) }, 1000)
  } else if (status === 'price-too-low') {
    handlePendingRequest(ec2, data)
  } else if (!/pending/.test(status)) {
    console.log('\n' + chalk.red(getMessage(data)))
  } else {
    spinner.start()
    spinner.text = getStatus(data)
    ec2.waitFor('spotInstanceRequestFulfilled', {
      SpotInstanceRequestIds: [getId(data)]
    }, function (err, data) {
      spinner.stop()
      if (err) { throw err }
      handleSpot(ec2, data)
    })
  }

  function getInstanceId (data) {
    return data.SpotInstanceRequests[0].InstanceId
  }
}

function handleInstance (ec2, id) {
  spinner.start()
  spinner.text = 'Waiting for instance ' + id
  ec2.waitFor('instanceRunning', { InstanceIds: [id] }, instanceRunning)
}

function instanceRunning (err, data) {
  spinner.stop()
  if (err) { throw err }
  var inst = data.Reservations[0].Instances[0]
  var key = inst.KeyName
  var ip = inst.PublicIpAddress
  console.log(chalk.green('Instance ' + inst.InstanceId + ' up and running.'))
  console.log('Log in with:')
  console.log('\tssh ' + ip + ' -i ' + key + '.pem [-l LOGIN]')
}

function cancel (ec2, id) {
  ec2.cancelSpotInstanceRequests({SpotInstanceRequestIds: [id]}, function (err, data) {
    if (err) {
      console.log(chalk.red('Error cancelling spot request ') + chalk.white(id))
    } else {
      console.log('Cancelled request ' + id)
    }
  })
}

function getType (data) {
  return data.SpotInstanceRequests ? 'spot' : 'ondemand'
}
function getId (data) {
  return getType(data) === 'spot'
    ? data.SpotInstanceRequests[0].SpotInstanceRequestId
    : data.Instances[0].InstanceId
}
function getStatus (data) {
  return getType(data) === 'spot'
    ? data.SpotInstanceRequests[0].Status.Code
    : data.Instances[0].State.Name
}

function getMessage (data) {
  return getType(data) === 'spot'
    ? data.SpotInstanceRequests[0].Status.Message
    : getStatus(data)
}

