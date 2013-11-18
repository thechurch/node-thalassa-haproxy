var Emitter = require('events').EventEmitter
var ejs     = require('ejs')
var mfs     = require('fs')

/**
 * ThalassaHaproxySyncService
 *
 * Syncs thalassa with haproxy by auto-managing backends.
 *
 * @contructor
 * @extends events.EventEmitter
 * @param   thalassa.Client thalassa
 * @param   Haproxy         haproxy
 * @param   Object          config
 */
function ThalassaHaproxySyncService (thalassa, haproxy, config) {
  var th           = this

  this.thalassa    = thalassa
  this.haproxy     = haproxy

  this.maxconn     = config.maxconn || 65536
  this.template    = ejs.compile(
    mfs.readFileSync(config.template).toString()
  )
  this.destination = haproxy.cfg

  // Internal variables
  this._reloading  = false
  this._recheck    = false

  this.thalassa.on('online', function (service) {
    th.emit('thalassa:online', service)
    th.emit('thalassa:change', service)
  })
  this.thalassa.on('offline', function (service) {
    th.emit('thalassa:offline', service)
    th.emit('thalassa:change', service)
  })

  th.on('thalassa:change', this.onThalassaChange)
  this.onThalassaChange()
}

// exports
exports.ThalassaHaproxySyncService = ThalassaHaproxySyncService
exports.createService = function createService (thalassa, haproxy, config) {
  return (new ThalassaHaproxySyncService(thalassa, haproxy, config))
}

// @extends events.EventEmitter
var p                               = ThalassaHaproxySyncService.prototype
ThalassaHaproxySyncService.__proto__ = Emitter
p.__proto__                         = Emitter.prototype

/**
 * onThalassaChange
 *
 * The thalassa registry has changes. Re-generate and re-load the configuration
 * for haproxy.
 */
p.onThalassaChange = function onThalassaChange () {
  var th = this

  if (this._reloading) {
    this._recheck = true
  }
  this._reloading = true

  this.thalassa.getRegistrations(gotRegistrations)

  function gotRegistrations (err, services) {
    if (err) return th.emit('error', err)

    var hosts   = Object.create(null)
    var roles   = Object.create(null)
    var service = null

    for (var i = 0, il = services.length; i < il; i++) {
      service           = services[i]
      hosts[service.id] = true
      roles[service.name] || (roles[service.name] = [])
      roles[service.name].push(service)
    }

    var cfg = th.template(
      { maxconn : Math.floor(th.maxconn / Object.keys(hosts).length)
      , roles   : roles
      }
    )

    mfs.writeFile(th.destination, cfg, doneConfig)
  }

  function doneConfig (err) {
    if (err) return th.emit('error', err)
    th.reloadHaproxy(reloaded)
  }

  function reloaded (err) {
    if (err) return th.emit('error', err)
    th.emit('haproxy:reload')
    th._reloading = false

    if (th._recheck) {
      th._recheck = false
      th.onThalassaChange()
    }
  }
}

/**
 * reloadHaproxy
 *
 * Ensure haproxy is started, otherwise reload
 */
p.reloadHaproxy = function reloadHaproxy (done) {
  var th = this

  th.haproxy.running(runningCheck)

  function runningCheck (err, running) {
    if (err) return done(err)
    else if (!running) return th.haproxy.start(started)

    started(null, true)
  }

  function started (err, reload) {
    if (err) return done(err)
    else if (reload) return th.haproxy.reload(reloaded)
    done()
  }

  function reloaded (err) {
    if (err) return done(err)
    done()
  }
}
