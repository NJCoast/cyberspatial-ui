from django.contrib import admin

# Register your models here.
from .models import NJCMap, NJCMapAnnotation, NJCMapExpert, NJCUserMeta, NJCMunicipality, NJCRole, NJCCounty, NJCRegionLevel
from geonode.people.admin import ProfileAdmin as BaseProfileAdmin
from geonode.people.models import Profile

admin.site.register(NJCMap)
admin.site.register(NJCMapAnnotation)
admin.site.register(NJCMapExpert)
admin.site.register(NJCMunicipality)
admin.site.register(NJCRole)
admin.site.register(NJCCounty)
admin.site.register(NJCRegionLevel)

# Define an inline admin descriptor for Employee model
# which acts a bit like a singleton
class UserNJCUserDataInline(admin.StackedInline):
    model = NJCUserMeta
    can_delete = False
    verbose_name_plural = 'NJC Data'

# Define a new User admin
class ProfileAdmin(BaseProfileAdmin):
    inlines = (UserNJCUserDataInline, )

# Re-register UserAdmin
admin.site.unregister(Profile)
admin.site.register(Profile, ProfileAdmin)
