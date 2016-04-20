#!/usr/bin/env node
//import libs
var http = require('http'),
    fs = require('fs'),
    url = require('url');

//read the config
var config
try {
    config = JSON.parse(fs.readFileSync('config.json', 'utf8'))
    console.log('Read database from previous session')
} catch (error) {
    config = {
        'api_username': 'ddns',
        'api_password': 'serversideblowjob',
        'port': 8080,
        'zone_output_path': '/etc/nsd/example.com.zone',
        'zone_template_path': 'conf/example.com.zonetemplate',
        'database_path': 'dnsDB.json'
    }
}

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
  var domain = (url.parse(req.url,true).query||{}).domain;
  if(!domain){
    respond(res, 404, {error:'no domain'});
    return;
  }
  if(ip.indexOf(":")===-1){//ipv4
    records.A[domain] = {ip:ip, ttl:1800, domain:domain}
  } else { //then ipv6
    records.AAAA[domain] = {ip:ip, ttl:1800, domain:domain}
  }
  //save bind file

  //save dnsDB.json
  fs.writeFile(config.database_path, JSON.stringify(records), function(err){
    if(err){
        console.error('Error writeing dnsDB.json: ' + err);
    }
  })
  respond(res, 200, records.AAAA[domain]);
}

//Lets start our server
http.createServer(handleRequest).listen(config.port, function(){
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Server listening on: http://localhost:%s", config.port);
});
