# njcoast.us

The NJCoast project project builds on DJango and Geonode to provide a web portal for tracking and simulating weather events in the New Jersey area.

Please see the [Wiki](https://github.com/NJCoast/cyberspatial-ui/wiki) for additional notes about the files in this project.

### Overview
The NJcoast project adds additional functionality to the Geonode project to allow users to simulate what-if scenarios while looking at real-time storm RSS feeds and simulations. The maps can be shared and annotated in "near-real-time".

The project is housed in AWS's Kubernetes offering for scalability coupled with the ability to run simulations via a scheduler. Users can create, annotate and share maps and simulation layers. Other layers are provided via T&M, for localized data, with statewide data being uploaded by the CRC to the Geonode instance. Users have the option of uploading and sharing additional layers.

Documentation on the project is available [at this page](https://njcoast.us/resources-documentation/) and tutorials [here](https://njcoast.us/resources-tutorials/). Both are available to users who are logged in via the *Resources* menu option.

### Structure

#### *Dashboard*
After logging in the user will be presented with the dashboard at:

*dashboard.html*

From the dashboard the user can upadte their profile and password.

The user can request membership of additional municipalities.

The user can view the groups they belong to and the users in those groups.

The user can see a list of their maps (clickable) and create a new map.

The user can run a new simulation.

The user can navigate to the three explorer pages:

- *explore_simulations.html*,	Browse, share or view simulation results.
- *explore_maps.html*,	Browse, share or view maps user has created.
- *explore_layers.html*,	Browse, share or view layers available to the user.

#### *Map*
The user can view or create new maps which are displayed at:

*https://njcoast.us/map/??/* where ?? is given by the map ID and

*map.html* is the map html file.

Multiple users can view the maps simultaneously once they have been shared. Multiple users can annotate the map with their annotations colored blue and other users annotations colored red.

#### *Expert*
Users can run simulations using the expert page at:

*map_expert.html*

Parameters are entered in the RHS panel and the corresponding simulation is run on the Kubernetes back end. Once complete heatmaps and contours are presented to the user on the map and can be saved or shared.

#### *DCA/Municipality Dashboard*
The DCA/Municipality Dashboard is provided to allow the creation of new Municipality or DCA approvers and to allow the approval of users who have completed the registration process. This process is multi-tiered with users registering for a Municipality role being first approved by the municipality approvers before being pushed to the DCA approvers for the final go ahead. County and statewide roles are approved by the DCA administrators.

The DCA/Municipality Dashboard is provided by:

*dca_dashboard.html*

Requests from current users for multiple municipalities are also handled by the DCA admins via this interface.

### Notes

1. Since the target audience uses IE9+, James has implemented a system that processes the source js files in njcoast/templates/js and uses *./node_modules/.bin/babel njcoast/templates/js -d njcoast/static/js/template_js --watch* to transcode to earlier versions of javascript, that can then be found at njcoast/static/js/.
2. Cross-Site Request Forgery (CSRF) is enabled but we do not explicitly pass the tokens in POSTs. Geonode automatically injects these for us.
