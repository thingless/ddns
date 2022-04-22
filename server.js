#!/usr/bin/env node
//import libs
var http = require('http'),
    fs = require('fs'),
    url = require('url'),
    process = require('process')

function extend(obj, props) {
    for(var prop in props) {
        if(props.hasOwnProperty(prop)) {
            obj[prop] = props[prop];
        }
    }
}

function isEmptyObject(obj) {
  return Object.getOwnPropertyNames(obj).length == 0;
}

//read the config
var config = {
    // these credentials must be sent in HTTP basic auth to access the API at all
    // unless this first parameter is true
    'api_anonymous_allowed': false,
    'api_username': 'ddns',
    'api_password': 'password',

    // if registration is not open, admin password is required for registering new domain
    // while the domain update password can be used just for updating
    'open_registration': true,

    // if this is set, admin password can be passed to allow updating or deleting domains
    // even without their domain specific password
    'admin_password': null,

    // if set, records more than this many seconds old will be omitted from the zone file
    // though they are kept in the DB in case they need to be recovered.
    'max_age': null,

    // listen port for the web server
    'port': 8080,

    // serve this file in response to GET with no params
    'index_file': 'index.txt',

    // set these to match your NSD settings
    'dns_pid_file': '/run/nsd/nsd.pid',
    'zone_output_path': '/tmp/example.com.zone',

    // paths to the template file & JSON flat-file DNS database
    'zone_template_path': 'conf/example.com.zonetemplate',
    'database_path': 'dnsDB.json',

    // hostnames that may not be registered
    'domain_blacklist': ['www', '@', 'smtp', 'imap', 'ns', 'pop', 'pop3', 'ftp', 'm', 'mail', 'blog', 'wiki', 'ns1', 'ns2', 'ns3'],

    // values that may not be provided by the api client and must be inferred by the ddns server
    'param_blacklist': ['type', 'ip'],

    // if true, allow dots in domain names
    'allow_subdomains': false,

    //'param_whitelist': ['domain', 'ttl', 'password'], // Does nothing, for documentation
}
try {
  var loadedConfig = JSON.parse(fs.readFileSync('config.json', 'utf8'))
  extend(config, loadedConfig)
  console.log('Read config file')
} catch (error) {
  console.error('Failed to read config file:' + error)
}

// validation for provided values
loadedConfig.param_validation = {
  'domain': loadedConfig.allow_subdomains ? /^[-a-zA-Z0-9\.]{0,200}$/ : /^[-a-zA-Z0-9]{0,200}$/,
  'ttl': /^[1-9][0-9]{1,15}$/,
  'password': /^.{1,100}$/,
  'type': /^(A|AAAA|CNAME)$/i
},

//utils
function decodeBase64(str) {
  return new Buffer(str, 'base64').toString()
}
function respond(res, code, json){
  res.writeHead(code, {"Content-Type": "application/json"});
  res.write(JSON.stringify(json));
  res.write("\n");
  res.end();
}
function respondFile(res, path) {
  fs.readFile(path, 'utf8', function(err, content) {
    if (err) {
      res.writeHead(500, {"Content-Type": "text/plain"});
    } else {
      res.writeHead(200, {"Content-Type": "text/plain"});
      res.write(content);
      res.end();
    }
  });
}
var credentialsRegExp = /^ *(?:[Bb][Aa][Ss][Ii][Cc]) +([A-Za-z0-9\-\._~\+\/]+=*) *$/

function zone_record(record) {
  if (record.ttl) {
    return record.domain + " IN " + record.ttl + " " + record.type + " " + record.ip;
  } else {
    return record.domain + " IN " + record.type + " " + record.ip;
  }
}
function zone_file(template, records) {
  template_records = []
  var typ, domain, record;
  for (typ in records){
    for (domain in records[typ]){
      record = records[typ][domain];
      if (!record.expired) {
        template_records.push(zone_record(record));
      }
    }
  }
  var dynamic_dns_records = template_records.join('\n') + "\n";
  var zone = template.replace("__DYNAMIC_DNS_RECORDS__", dynamic_dns_records).replace("__SERIAL_NUMBER__", Math.floor((new Date()).getTime()/1000));
  return zone;
}

//read the dnsDB
var records;
try {
    records = JSON.parse(fs.readFileSync(config.database_path, 'utf8'))
    console.log('Read database from previous session')
} catch (error) {
  console.error('Failed to read database from previous session: ' + error)
  records = {}
}

function handleRequest(req, res){
  //check basic auth
  if (!config.api_anonymous_allowed) {
    var header=req.headers['authorization']||'',        // get the header
        token=header.split(/\s+/).pop()||'',            // and the encoded auth token
        auth=new Buffer(token, 'base64').toString(),    // convert from base64
        parts=auth.split(/:/),                          // split on colon
        username=parts[0],
        password=parts[1];
    if(username !== config.api_username || password !== config.api_password){
        respond(res, 401, {error:'unauthorized'});
        return;
    }
  }
  var queryParams = url.parse(req.url,true).query || {};
  if (isEmptyObject(queryParams)) {
    respondFile(res, config.index_file);
    return;
  }
  for (var param of config.param_blacklist) {
    delete queryParams[param];
  }
  for (var param in config.param_validation) {
    var regex = config.param_validation[param];
    if (queryParams[param] && ! queryParams[param].match(regex)) {
      delete queryParams[param];
    }
  }
  //get ip
  var ip = queryParams.ip ||
   req.headers['x-forwarded-for'] ||
   req.connection.remoteAddress ||
   req.socket.remoteAddress ||
   req.connection.socket.remoteAddress;
  //get domain from query
  var domain = queryParams.domain;
  if(!domain){
    respond(res, 404, {error:'no domain'});
    return;
  }
  if(config.domain_blacklist.indexOf(domain) != -1) {
    respond(res, 401, {error:'unauthorized'});
    return;
  }
  //update parse ttl and ipv6
  var ttl = parseInt(queryParams.ttl);
  var ipv6 = ip.indexOf("::ffff:")!==0 && ip.indexOf(":")!==-1;
  if (!ipv6) ip = ip.replace(/^::ffff:/, '');
  //update record object
  var type = queryParams.type || (ipv6 ? "AAAA" : "A");
  var password = queryParams.password;
  var adminPassword = queryParams.adminpassword;
  var record = {ip: ip, domain:domain, type: type};
  if (ttl) record.ttl = ttl;
  if (password) record.password = password;
  record.last_update_time = (new Date()).toISOString();

  var existingRecord = records[record.type] && records[record.type][domain];

  // If we're registering a new domain & reg password is enabled, ensure it's correct
  if (!config.open_registration && !existingRecord && config.admin_password !== adminPassword) {
    respond(res, 401, {error:'registration password incorrect'});
    return;
  }

  // If we're adding a domain & we have a registration password, require a password for update as well
  if (!config.open_registration && !existingRecord && !record.password) {
    respond(res, 400, {error:'must supply update password'});
    return;
  }

  // If we're updating a domain & it has a password, ensure it's correct
  // Unless the admin password is configured & passed as adminPassword
  var existingPassword = existingRecord && existingRecord.password;
  var domainPwBad = existingPassword && existingPassword !== record.password;
  var adminPwBad = !config.admin_password || config.admin_password !== adminPassword;
  if (domainPwBad && adminPwBad) {
    respond(res, 401, {error:'unauthorized'})
    return;
  }

  records[record.type] = records[record.type] || {}
  records[record.type][domain] = record;

  //delete if that's our method
  if (req.method === 'DELETE' && domain) {
    delete records[record.type][domain];
    record = {deleted: true};
  }

  //purge aged-out records
  if (config.max_age) {
    var now = new Date();
    for (var type in records) {
      for (var domain in records[type]) {
        var rec = records[type][domain];
        var recDate = new Date(rec.last_update_time);
        if ((now - recDate) / 1000 > config.max_age) {
          rec.expired = true;
        }
      }
    }
  }

  //save bind file
  fs.readFile(config.zone_template_path, 'utf8', function(err, template) {
    if (err) {
      console.error("Error reading zonetemplate file: " + err);
    } else {
      var zone = zone_file(template, records);
      fs.writeFile(config.zone_output_path, zone, function(err) {
        if (err) {
            console.error("Error writing zone file: " + err);
        } else {
          sendSIGHUP();
        }
      });
    }
  });

  //save dnsDB.json
  fs.writeFile(config.database_path, JSON.stringify(records,null,4), function(err){
    if(err){
        console.error('Error writing dnsDB.json: ' + err);
    }
  })

  respond(res, 200, record);
}

function sendSIGHUP(){
  //send SIGHUP to nds
  if(config['dns_pid_file']){
     fs.readFile(config['dns_pid_file'], 'utf8', function(err, pid){
       if(err){
         console.error('Error reading dns pid file: ' + err);
         return;
       }
       try {
         process.kill(parseInt(pid), 'SIGHUP');
       } catch (error) {
         console.error('Error sending SIGHUP to dns process: ' + error)
       }
     })
  }
}

//Lets start our server
http.createServer(handleRequest).listen(config.port, function(){
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Server listening on: http://localhost:%s", config.port);
});
