#!/bin/sh
python manage.py --noinput
python manage.py loaddata sample_admin
python manage.py loaddata default_oauth_apps_docker
python manage.py loaddata initial_data
python manage.py loaddata roles
python manage.py loaddata regionlevels
python manage.py loaddata counties
python manage.py loaddata municipalities
python manage.py loaddata admingroups