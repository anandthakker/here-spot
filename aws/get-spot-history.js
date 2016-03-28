var util = require('util')
var queue = require('queue-async')
var parseDuration = require('parse-duration')
var prettyMs = require('pretty-ms')
var chalk = require('chalk')

module.exports = getSpotHistory

function getSpotHistory (ec2, duration, types, cb) {
  if (!util.isNumber(duration)) { duration = parseDuration(duration) }

  ec2.describeAvailabilityZones({}, function (err, zones) {
    if (err) { return cb(err) }

    zones = zones.AvailabilityZones

    var q = queue()
    zones.forEach(function (zone) { q.defer(zoneHistory.bind(null, zone)) })
    q.awaitAll(cb)
  })

  function zoneHistory (zone, cb) {
    ec2.describeSpotPriceHistory({
      AvailabilityZone: zone.ZoneName,
      InstanceTypes: types,
      EndTime: new Date(),
      StartTime: new Date(Date.now() - duration)
    }, function (err, data) {
      if (err) { return cb(err) }
      cb(null, summarizeHistory(zone, data.SpotPriceHistory))
    })
  }
}

var intervals = [
  parseDuration('1w'),
  parseDuration('1d'),
  parseDuration('8h'),
  parseDuration('1h'),
  parseDuration('30m')
]

function summarizeHistory (zone, history) {
  // sort *descending*
  history.sort(function (a, b) { return a.Timestamp > b.Timestamp ? -1 : 1 })

  // add delta t in ms
  var current = history[0]
  history.forEach(function (h) {
    h.dt = new Date(current.Timestamp).getTime() - new Date(h.Timestamp).getTime()
  })

  // assumes history is sorted by time, descending
  var averages = intervals
  .map(function (interval, i) {
    var h = history.filter((h) => (h.dt <= interval))
    if (h.length === history.length && i > 0) { return null }
    if (h.length === 0) { return null }
    var mean = h.reduce((memo, d) => memo + parseFloat(d.SpotPrice) / h.length, 0)
    var dt = h[h.length - 1].dt
    return {
      dt: dt,
      mean: mean
    }
  })
  .filter(Boolean)

  averages.forEach(function (avg, i) {
    if (i > 0) { avg.delta = avg.mean - averages[i - 1].mean }
  })

  return {
    zone: zone.ZoneName,
    current: current,
    averages: averages.reverse()
  }
}

module.exports.format = formatHistory
function formatHistory (z) {
  var priceChanges = z.averages
  .map(function (d) {
    var p = d.mean.toFixed(3)
    if (d.delta < 0) {
      p = chalk.green(p)
    } else if (d.delta > 0) {
      p = chalk.red(p)
    }
    return p + ' ' + chalk.dim(prettyMs(d.dt, {compact: true}))
  })
  .join('    ')
  var price = (+z.current.SpotPrice).toFixed(3)
  if (+z.current.SpotPrice > z.averages[0].mean) {
    price = chalk.red(price)
  }
  return z.zone + ' ' +
    chalk.dim('(') + price + chalk.dim(')') + ' ' +
    chalk.dim('[') + priceChanges + chalk.dim(']')
}

if (require.main === module) {
  var AWS = require('aws-sdk')
  getSpotHistory(new AWS.EC2({region: process.argv[2]}), process.argv[3], process.argv.slice(4), function (err, data) {
    if (err) { throw err }
    console.log(data.map(formatHistory).join('\n'))
  })
}
