
#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

if [ -z "$1" ] ; then
  echo "usage: ./setup.sh YOUR_FQDN";
  exit 1
fi

if [ "$(id -u)" != "0" ]; then
  echo "This script must be run as root" 1>&2
  exit 1
fi
set -u -e

apt-get install nsd nodejs
#copy nsd config
cp conf/nsd.conf /etc/nsd
sed -i "s/example.com/$1/g" /etc/nsd/nsd.conf
#create instal zone file
cp conf/example.com.zonetemplate /etc/nsd/"$1".zone
sed -i "s/example.com/$1/g" /etc/nsd/"$1".zone
sed -i "s/__SERIAL_NUMBER__/$(date +%s)/g" /etc/nsd/"$1".zone
sed -i "s/__DYNAMIC_DNS_RECORDS__//g" /etc/nsd/"$1".zone
sed -i "s/192.0.2.1/$(curl -4 -s 'https://icanhazip.com/')/g" /etc/nsd/"$1".zone
#copy tempalte for future updates
cp conf/example.com.zonetemplate ./"$1".zonetemplate
sed -i "s/example.com/$1/g" ./"$1".zonetemplate
service nsd restart
chown nsd /etc/nsd/"$1".zone
chown nsd -R .
echo "Setup Script Ran. Checking..."
host $1 127.0.0.1
