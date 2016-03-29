var request = require('request')
var csv = require('csv-parser')
var split = require('split')
var through = require('through2')
var locations = require('./meta').locations
var JSONStream = require('JSONStream')

var API = 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/index.csv'

console.error('Getting latest on-demand prices.')

var nl = new Buffer('\n')
var skip = 5
request(API)
.on('error', function (err) {
  console.error(err, err.stack)
  console.error('\n\nWarning: could not download on-demand prices; using list from last time this package was published.')
})
.pipe(split())
.pipe(through(function (chunk, enc, next) {
  if (skip > 0) {
    skip--
    next()
  } else {
    this.push(chunk)
    this.push(nl)
    next()
  }
}))
.pipe(csv())
.pipe(through.obj(function (data, _, next) {
  if (data.TermType === 'OnDemand' &&
      data['Location Type'] === 'AWS Region' &&
      +data.PricePerUnit > 0 &&
      data.Unit === 'Hrs' &&
      /^RunInstances/.test(data.operation)) {
    this.push({
      instanceType: data['Instance Type'],
      os: data['Operating System'],
      price: data.PricePerUnit,
      currency: data.Currency,
      region: locations[data.Location]
    })
  }
  next()
}))
.pipe(JSONStream.stringify())
.pipe(process.stdout)

