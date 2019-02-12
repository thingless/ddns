# ddns
A stupid simple Dynamic DNS server using NSD (a Authoritative Only DNS Server) and NodeJs.

# Config
This script reads `config.json` from the CWD. All paths are relative to the CWD.
The following keys are supported (at time of writing):

| Config Var         | Description                          | Default                  |
|--------------------|--------------------------------------|--------------------------|
|`api_anonymous_allowed`| Is basic auth required            | false (required)         |
|`api_username`      | Username for basic auth              | ddns                     |
|`api_password`      | Password for basic auth              | password                 |
|`port`              | Port to listen on                    | 8080                     |
|`zone_output_path`  | Path to your zone file (in NSD)      | /etc/nsd/example.com.zone|
|`zone_template_path`| Input path of zone template          | example.com.zonetemplate |
|`database_path`     | Path JSON record database            | dnsDB.json               |
|`dns_pid_file`      | Path to PID file for your DNS server | /run/nsd/nsd.pid         |
|`param_blacklist`| These GET parameters will be ignored    | ["type","ip"]                 |

# Zone Template
The template file is just a Bind-style zone file with two magic strings:
* `__DYNAMIC_DNS_RECORDS__`: Insert this where you want the generated zone
  records to go. Typically at the end of the file.
* `__SERIAL_NUMBER__`: This is where ddns will update your serial number. It
  will be set to the current time in milliseconds.

# Database
ddns writes its temporary state as JSON to `database_path`. This is used to
regenerate the zone file whenever anything changes.

# How to run?
To install on Ubuntu 18.04 using the setup script
`sudo bash ./setup.sh`

Start node `sudo -u nsd node server.js`. You should probably run under supervisor. See `conf/ddns.supervisor.conf` for an  example config.

# Usage
GET `/` to see the online help:
```
This is a ddns provider. To add a subdomain, append URL parameters.

Example: /?domain=www2&ttl=600

Available parameters (some may have been disabled by the administrator):
    domain:    the subdomain to add a record for
    ip:        the ip address to add (uses your current IP if missing)
    password:  lock the subdomain with a password, which will be required to
               change the entries in the future
    ttl:       ttl of the record in seconds
    type:      record type, can be A, AAAA, MX, CNAME, etc

Source: https://github.com/thingless/ddns
```
