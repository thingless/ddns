//import libs
var http = require('http'),
    fs = require('fs'),
    url = require('url'),
    qs = require('querystring');
//utils
function decodeBase64(str) {
  return new Buffer(str, 'base64').toString()
}
function parseQS(reqUrl){
  return qs.parse(url.parse(reqUrl, true).query)
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
    records = JSON.parse(fs.readFileSync('dnsDB.json', 'utf8'))
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
  if(username!=="ddns" || password!=="serversideblowjob"){
    respond(res, 401, {error:'unauthorized'})
    return;
  }
  //get ip
  var ip = req.headers['x-forwarded-for'] || 
   req.connection.remoteAddress || 
   req.socket.remoteAddress ||
   req.connection.socket.remoteAddress;
  var domain = (parseQS(request.url, true)||{}).domain;
  if(!domain){
    respond(res, 404, {error:'no domain'});
    return;
  }
  if(ip.indexOf(":")!==-1){
    //ipv4
    records.A[domain] = {ip:ip, ttl:1800, domain:domain}
  } else { //then ipv6
    records.AAAA[domain] = {ip:ip, ttl:1800, domain:domain}
  }
  //save bind file
  
  //save dnsDB.json
  fs.writeFile('dnsDB.json', JSON.stringify(records), function(err){
    if(err){
        console.error('Error writeing dnsDB.json: ' + err);
    }
  })
}

//Lets start our server
http.createServer(handleRequest).listen(PORT, function(){
    //Callback triggered when server is successfully listening. Hurray!
    console.log("Server listening on: http://localhost:%s", 8080);
});
