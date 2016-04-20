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

//read the config
var config = {
    'api_username': 'ddns',
    'api_password': 'password',
    'port': 8080,
    'zone_output_path': '/tmp/example.com.zone',
    'zone_template_path': 'conf/example.com.zonetemplate',
    'database_path': 'dnsDB.json',
    'dns_pid_file': '/run/nsd/nsd.pid',
}
try {
    loadedConfig = JSON.parse(fs.readFileSync('config.json', 'utf8'))
    extend(config, loadedConfig)
    console.log('Read config file')
} catch (error) {}

//utils
function decodeBase64(str) {
  return new Buffer(str, 'base64').toString()
}
function respond(res, code, json){
  res.writeHead(code, {"Content-Type": "application/json"});
  res.write(JSON.stringify(json));
  res.end();
}
var credentialsRegExp = /^ *(?:[Bb][Aa][Ss][Ii][Cc]) +([A-Za-z0-9\-\._~\+\/]+=*) *$/

function zone_record(record) {
  if (record.ttl) {
    return record.domain + " IN " + record.type + " " + record.ttl + " " + record.ip;
  } else {
    return record.domain + " IN " + record.type + " " + record.ip;
  }
}
function zone_file(template, records) {
  template_records = []
  var domain, record;
  for (domain in records.A) {
    record = records.A[domain];
    template_records.push(zone_record(record));
  }
  for (domain in records.AAAA) {
    record = records.AAAA[domain];
    template_records.push(zone_record(record));
  }
  dynamic_dns_records = template_records.join('\n') + "\n";
  var zone = template.replace("__DYNAMIC_DNS_RECORDS__", dynamic_dns_records).replace("__SERIAL_NUMBER__", (new Date()).getTime());
  return zone;
}

//read the dnsDB
var records;
try {
    records = JSON.parse(fs.readFileSync(config.database_path, 'utf8'))
    console.log('Read database from previous session')
} catch (error) {
    records = {
        A:{},
        AAAA:{}
    }
}

function handleRequest(req, res){
  //check basic auth
  var header=req.headers['authorization']||'',        // get the header
      token=header.split(/\s+/).pop()||'',            // and the encoded auth token
      auth=new Buffer(token, 'base64').toString(),    // convert from base64
      parts=auth.split(/:/),                          // split on colon
      username=parts[0],
      password=parts[1];
  if(username !== config.api_username || password !== config.api_password){
    respond(res, 401, {error:'unauthorized'})
    return;
  }
  //get ip
  var ip = req.headers['x-forwarded-for'] ||
   req.connection.remoteAddress ||
   req.socket.remoteAddress ||
   req.connection.socket.remoteAddress;
  //get domain from query
  var domain = (url.parse(req.url,true).query||{}).domain;
  if(!domain){
    respond(res, 404, {error:'no domain'});
    return;
  }
  //update record object
  var ipv6 = ip.indexOf("::ffff:")!==0 && ip.indexOf(":")!==-1;
  if (ipv6) {
    records.AAAA[domain] = {ip:ip, domain:domain, type: "AAAA"};
  } else {
    // IPv4 addresses come across as "::ffff:127.0.0.1"
    ip = ip.replace(/^::ffff:/, '');
    records.A[domain] = {ip:ip, domain:domain, type: "A"};
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
        }
      });
    }
  });

  //save dnsDB.json
  fs.writeFile(config.database_path, JSON.stringify(records), function(err){
    if(err){
        console.error('Error writeing dnsDB.json: ' + err);
    }
  })

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

  respond(res, 200, records.AAAA[domain] || records.A[domain]);
}

//Lets start our server
http.createServer(handleRequest).listen(config.port, function(){
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Server listening on: http://localhost:%s", config.port);
});
