# -*- coding: utf-8 -*-
#########################################################################
#
# Copyright (C) 2012 OpenPlans
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program. If not, see <http://www.gnu.org/licenses/>.
#
#########################################################################

# Django settings for the GeoNode project.
import os
from geonode.settings import *

#
# General Django development settings
#
SITENAME = 'njcoast'

# Defines the directory that contains the settings file as the LOCAL_ROOT
# It is used for relative settings elsewhere.
LOCAL_ROOT = os.path.abspath(os.path.dirname(__file__))

WSGI_APPLICATION = "njcoast.wsgi.application"
ASGI_APPLICATION = "njcoast.asgi.application"

PROXY_ALLOWED_HOSTS = (os.getenv('PROXY_ALLOWED_HOSTS'),)

MAX_DOCUMENT_SIZE = 512

MODIFY_TOPICCATEGORY = True

INSTALLED_APPS += (
    'njcoast',
    'channels',
)

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql_psycopg2',
        'NAME': os.getenv('GEONODE_DATABASE_NAME'),
        'USER': os.getenv('DATABASE_USER'),
        'PASSWORD': os.getenv('DATABASE_PASSWORD'),
        'HOST': os.getenv('DATABASE_HOST'),
        'PORT': os.getenv('DATABASE_PORT'),
    },
    'datastore': {
        'ENGINE': 'django.contrib.gis.db.backends.postgis',
        'NAME': os.getenv('GEONODE_DATA_DATABASE_NAME'),
        'USER': os.getenv('DATABASE_USER'),
        'PASSWORD': os.getenv('DATABASE_PASSWORD'),
        'HOST': os.getenv('DATABASE_HOST'),
        'PORT': os.getenv('DATABASE_PORT'),
    }
}

# Basic Channels setup
BROKER_URL = "redis://:"+os.getenv('BROKER_PASS')+"@"+os.getenv('BROKER_HOST')+":"+os.getenv('BROKER_PORT')
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "asgi_redis.RedisChannelLayer",
        "ROUTING": "njcoast.routing.channel_routing",
        "CONFIG": {
            "hosts": [BROKER_URL],
        },
    },
}

# Additional directories which hold static files
STATICFILES_DIRS.append(
    os.path.join(LOCAL_ROOT, "static"),
)

# Location of url mappings
ROOT_URLCONF = 'njcoast.urls'

# Location of locale files
LOCALE_PATHS = (
    os.path.join(LOCAL_ROOT, 'locale'),
) + LOCALE_PATHS

TEMPLATES[0]['DIRS'].insert(0, os.path.join(LOCAL_ROOT, "templates"))

# Handle Exported Variables
TEMPLATES[0]['OPTIONS']['context_processors'].append('njcoast.context_processors.export_vars')

#also media storage
TEMPLATES[0]['OPTIONS']['context_processors'].append('django.template.context_processors.media')

# Setup Emails
DEFAULT_FROM_EMAIL = 'NJCoast@dca.nj.gov'
SERVER_EMAIL = 'NJCoast@dca.nj.gov'
THEME_ACCOUNT_CONTACT_EMAIL = 'NJCoast@dca.nj.gov'
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'email-smtp.us-east-1.amazonaws.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.getenv('SMTP_USERNAME')
EMAIL_HOST_PASSWORD = os.getenv('SMTP_PASSWORD')

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '%(asctime)s - %(levelname)s - %(module)s - %(message)s'
        }
    },
    'handlers': {
        'console': {
            'level': 'INFO',
            'class': 'logging.StreamHandler',
            'formatter': 'verbose'
        }
    },
    'loggers': {
        '': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': True,
        },
    },
}

# Layer Preview
LAYER_PREVIEW_LIBRARY = 'leaflet'

# GeoNode Security
OGC_SERVER['default']['USER'] = os.getenv('GEOSERVER_ADMIN_USER', 'admin')
OGC_SERVER['default']['PASSWORD'] = os.getenv('GEOSERVER_ADMIN_PASSWORD', 'geoserver')