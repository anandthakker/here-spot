var queue = require('queue-async')
var AWS = require('aws-sdk')

module.exports = getHistory

function getHistory (region, type, cb) {
  var ec2 = new AWS.EC2({region: region})
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
      InstanceTypes: [type],
      EndTime: new Date(),
      StartTime: new Date(Date.now() - 1000 * 60 * 60 * 4)
    }, function (err, data) {
      if (err) { return cb(err) }
      cb(null, summarizeHistory(zone, data.SpotPriceHistory))
    })
  }
}

function summarizeHistory (zone, history) {
  history.sort(function (a, b) {
    return a.Timestamp > b.Timestamp ? -1 : 1
  })
  return {
    zone: zone.ZoneName,
    current: history[0],
    previous: history[history.length - 1]
  }
}

if (require.main === module) {
  getHistory(process.argv[2], process.argv[3], function (err, data) {
    if (err) throw err
    console.log(JSON.stringify(data, null, 2))
  })
}
