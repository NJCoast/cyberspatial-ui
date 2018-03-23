"""
ASGI entrypoint. Configures Django and then runs the application
defined in the ASGI_APPLICATION setting.
"""

import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "njcoast.settings")
django.setup()

from channels.routing import get_default_application
application = get_default_application()