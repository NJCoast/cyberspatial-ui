# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('njcoast', '0038_auto_20180628_1655'),
    ]

    operations = [
        migrations.AlterField(
            model_name='njcmunicipality',
            name='group_name',
            field=models.CharField(default=b'', max_length=30),
        ),
        migrations.AlterField(
            model_name='njcmunicipality',
            name='name',
            field=models.CharField(max_length=30),
        ),
    ]
