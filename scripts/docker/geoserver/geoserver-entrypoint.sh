#!/usr/bin/env sh
set -e

cd /usr/local/tomcat/tmp

# Update
echo sed -i "s|http://localhost:8000|$DJANGO_URL|g" /geoserver_data/data/security/role/geonode\ REST\ role\ service/config.xml
sed -i "s|http://localhost:8000|$DJANGO_URL|g" /geoserver_data/data/security/role/geonode\ REST\ role\ service/config.xml

echo sed -i "s|http://localhost:8000/|$DJANGO_URL|g" /geoserver_data/data/security/filter/geonode-oauth2/config.xml
sed -i "s|http://localhost:8000/|$DJANGO_URL|g" /geoserver_data/data/security/filter/geonode-oauth2/config.xml
echo sed -i "s|http://localhost:8080/geoserver|$GEOSERVER_PUBLIC_LOCATION|g" /geoserver_data/data/security/filter/geonode-oauth2/config.xml
sed -i "s|http://localhost:8080/geoserver|$GEOSERVER_PUBLIC_LOCATION|g" /geoserver_data/data/security/filter/geonode-oauth2/config.xml

echo sed -i "s|http://localhost:8080/geoserver|$GEOSERVER_PUBLIC_LOCATION|g" /geoserver_data/data/global.xml
sed -i "s|http://localhost:8080/geoserver|$GEOSERVER_PUBLIC_LOCATION|g" /geoserver_data/data/global.xml



# start tomcat
exec "$@"