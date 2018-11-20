# Create your models here.
from django.db import models
from django.conf import settings
from geonode.layers.models import Layer
from geonode.people.models import Profile

from django.db.models.signals import post_save
from django.dispatch import receiver
from account.conf import settings

from datetime import datetime

#new addendum to GeoNode Profile
class NJCUserMeta(models.Model):
    user = models.OneToOneField(Profile, on_delete=models.CASCADE)
    is_dca_approved = models.BooleanField(default=False)
    is_muni_approved = models.BooleanField(default=False)
    region_level = models.ForeignKey('NJCRegionLevel',blank=True,null=True)
    county = models.ForeignKey('NJCCounty',blank=True,null=True)
    municipality = models.ForeignKey('NJCMunicipality',
                        on_delete=models.CASCADE,blank=True,null=True)
    role = models.ForeignKey('NJCRole',
                        on_delete=models.CASCADE,blank=True,null=True)
    justification = models.TextField(blank=True,null=True)
    position = models.TextField(blank=True,null=True)
    dca_approval_date = models.DateTimeField(blank=True,null=True)
    muni_approval_date = models.DateTimeField(blank=True,null=True)
    notes = models.TextField(blank=True,null=True)
    address_line_1 = models.CharField(max_length=50, blank=True,null=True)
    address_line_2 = models.CharField(max_length=50, blank=True,null=True)
    city = models.CharField(max_length=50, blank=True,null=True)
    zip = models.CharField(max_length=20, blank=True,null=True)
    dca_approver = models.CharField(max_length=50, blank=True,null=True)
    muni_approver = models.CharField(max_length=50, blank=True,null=True)
    
    #additions for multiple municipalities (T&M employees for example)
    additional_muni_request = models.TextField(blank=True,null=True)
    additional_muni_approved = models.TextField(blank=True,null=True)

# need to do this to add the addendum to GeoNode Profile
@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def update_user_profile(sender, instance, created, **kwargs):
    if created:
        NJCUserMeta.objects.create(user=instance)
    instance.njcusermeta.save()

class NJCMap(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )
    name = models.CharField(max_length=50)
    description = models.TextField(blank=True)
    settings = models.TextField(blank=True)
    shared_with = models.TextField(blank=True)
    # layers = models.ManyToManyField(Layer, blank=True)
    is_default = models.BooleanField(default=False)
    thumbnail = models.ImageField(upload_to='thumbnails/', null=True, blank=True)
    modified = models.DateTimeField(default=datetime.now, blank=True)
    def __str__(self):
        return self.name

class NJCMapAnnotation(models.Model):
    leaflet_id = models.CharField(max_length=50)
    type = models.CharField(max_length=50)
    text = models.TextField(blank=True, null=True)
    data = models.TextField()
    map = models.ForeignKey(NJCMap, on_delete=models.CASCADE)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        blank=True,
        null=True
    )

    def __str__(self):
        return "%s - %s - %s" % (self.map, self.type, self.text)

class NJCMapExpert(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        blank=True,
        null=True
    )
    sim_id = models.CharField(max_length=20)
    sim_name = models.CharField(max_length=50, blank=True)
    user_id = models.CharField(max_length=10)
    catagory = models.CharField(max_length=20, blank=True)
    type = models.CharField(max_length=20, blank=True)
    user_name = models.TextField(blank=True)
    description = models.TextField(blank=True)
    data = models.TextField(blank=True)
    modified    = models.DateTimeField()

    def __str__(self):
        return self.sim_id

class NJCMunicipality(models.Model):
    name = models.CharField(max_length=30)
    home_latitude = models.CharField(max_length=20)
    home_longitude = models.CharField(max_length=20)
    zoom_level = models.PositiveIntegerField()
    code = models.PositiveIntegerField()
    county = models.ForeignKey('NJCCounty', blank=True,null=True)
    group_name = models.CharField(max_length=30, default="")

    def __str__(self):
        return self.name

class NJCRole(models.Model):
    name = models.CharField(max_length=20)
    group_name = models.CharField(max_length=20, default="")

    def __str__(self):
        return self.name

class NJCCounty(models.Model):
    name = models.CharField(max_length=20)
    home_latitude = models.CharField(max_length=20, default="")
    home_longitude = models.CharField(max_length=20, default="")
    zoom_level = models.PositiveIntegerField(default=0)
    code = models.PositiveIntegerField(default=0)
    group_name = models.CharField(max_length=20, default="")

    def __str__(self):
        return self.name

class NJCRegionLevel(models.Model):
    name = models.CharField(max_length=20)
    group_name = models.CharField(max_length=20, default="")

    def __str__(self):
        return self.name
