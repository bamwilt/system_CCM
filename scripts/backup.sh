#!/bin/bash
pg_dump -Fc -U sgpm_app -h /var/run/postgresql sgpm_prod > /opt/sgpm/backups/sgpm_$(date +%F).dump
