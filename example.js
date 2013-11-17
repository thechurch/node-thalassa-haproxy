var proxy    = require('./')
var mpath    = require('path')

var thalassa = require('thalassa')
var Haproxy  = require('haproxy')

var registry = new thalassa.Client(
  { port     : 5001
  , apiport  : 5003
  , host     : '192.168.50.50'
  }
)
var haproxy  = new Haproxy(
  '/var/run/haproxy.socket'
, { config   : mpath.resolve('haproxy.cfg')
  , prefix   : 'sudo'
  }
)

var service  = proxy.createService(
  registry
, haproxy
, { template : mpath.resolve('haproxy.cfg.ejs')
  }
)

service.on('error', function (err) {
  console.error('[error]', err)
  process.emit('SIGINT')
})

service.on('haproxy:reload', function () {
  console.error('[reload]')
})

process.on('SIGINT', function () {
  haproxy.stop(function () {
    process.exit()
  })
})

registry.subscribe('web')
