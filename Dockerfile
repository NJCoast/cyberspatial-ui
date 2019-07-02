FROM node:lts-alpine AS builder

RUN mkdir -p /app/njcoast/templates/js /app/njcoast/static/js/template_js 
WORKDIR /app

COPY package.json /app/package.json
RUN npm install

COPY njcoast/templates/js /app/njcoast/templates/js
RUN npm run babel

FROM python:2.7-jessie AS Main

ENV PYTHONUNBUFFERED 1
RUN export DEBIAN_FRONTEND=noninteractive

# This section is borrowed from the official Django image but adds GDAL and others
RUN apt-get update && apt-get install -y \
		gcc \
		gettext \
		postgresql-client libpq-dev \
		sqlite3 \
        python-gdal python-psycopg2 \
        python-imaging python-lxml \
        python-dev libgdal-dev \
        python-ldap \
        libmemcached-dev libsasl2-dev zlib1g-dev \
        python-pylibmc \
        curl\
	    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip install --upgrade pip

# python-gdal does not seem to work, let's install manually the version that is
# compatible with the provided libgdal-dev
RUN pip install GDAL==1.10 --global-option=build_ext --global-option="-I/usr/include/gdal"

RUN mkdir /app
WORKDIR /app

COPY ./celary.sh /celary.sh
COPY ./entrypoint.sh /entrypoint.sh
COPY ./init_worker.sh /init_worker.sh
RUN sed -i 's/\r//' /celary.sh \
    && sed -i 's/\r//' /entrypoint.sh \
    && sed -i 's/\r//' /init_worker.sh \
    && chmod +x /init_worker.sh \
    && chmod +x /entrypoint.sh \
    && chmod +x /celary.sh

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt --src /usr/local/src

COPY initialize.sh /app/initialize.sh
COPY manage.py /app/manage.py

RUN mkdir /app/njcoast
COPY njcoast/*.py /app/njcoast/
COPY njcoast/fixtures /app/njcoast/fixtures
COPY njcoast/migrations /app/njcoast/migrations
COPY njcoast/static /app/njcoast/static
COPY njcoast/templatetags /app/njcoast/templatetags

RUN mkdir /app/njcoast/templates 
COPY njcoast/templates/*.html /app/njcoast/templates/

RUN mkdir /app/njcoast/static/js/template_js 
COPY --from=builder /app/njcoast/static/js/template_js /app/njcoast/static/js/template_js 

ENTRYPOINT ["/entrypoint.sh"]
