# ddns
A stupid simple Dynamic DNS server using NSD and node.

# Config
This script reads `config.json` from the CWD. All paths are relative to the CWD.
The following keys are supported (at time of writing):

| Config Var         | Description                          | Default                  |
|--------------------|--------------------------------------|--------------------------|
|`api_username`      | Username for basic auth              | ddns                     |
|`api_password`      | Password for basic auth              | password                 |
|`port`              | Port to listen on                    | 8080                     |
|`zone_output_path`  | Path to your zone file (in NSD)      | /etc/nsd/example.com.zone|
|`zone_template_path`| Input path of zone template          | example.com.zonetemplate |
|`database_path`     | Path JSON record database            | dnsDB.json               |
|`dns_pid_file`      | Path to PID file for your DNS server | /run/nsd/nsd.pid         |

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
On Ubuntu 14.04:

* Basic setup:
```bash
sudo apt-get install nsd nodejs
sudo cp conf/nsd.conf /etc/nsd
```
* Copy `conf/example.com.zone` to `/etc/nsd/YOUR_FQDN.zone` and edit
  `/etc/nsd/nsd.conf` to point to that file. Also edit the zone file to remove the
  replacable variables.
* Copy `conf/example.com.zonetemplate` to `./YOUR_FQDN.zonetemplate` and edit
  `config.json` to match. Also edit the new zonetemplate file to match your
  domain.
* Start NSD. `sudo service nsd start`
* Edit the config file to change port, username, password, etc
* Ensure that node can write the zone file: `chown nobody.nobody /etc/nsd/YOUR_FQDN.zone`
* Ensure that node can read/write everything in this directory: `chown nobody.nobody -R .`
* Start node (probably under supervisor - see `conf/ddns.supervisor.conf` for
  example. Directly: `sudo -u nobody node server.js`
