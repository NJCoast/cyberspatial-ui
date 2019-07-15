 /*
  * Purpose:            js file for map template, uses leaflet maps for GIS display.
  * @author             James Sweet, Caleb Reinking, Chris Sweet
  * Org:                CRC at Notre Dame
  * Date:               04/01/2018
  *
  * Associated files:   map_expert.html    map expert/simulation html page,
  *
  * @description        Runs simulations on James' backend with expert choice of input parameters.
  *
  * Functions:
  *     start_expert_simulation     Start an expert simulation based on selected parameters.
  *     get_expert_data_to_server   Get status of simulation from back end server.
  *     load_heatmap                Load or unload a heatmap from the view.
  *     load_expert_data_to_server  Get heatmap from S3 bucket.
  *     create_storm_track          Create storm track icons
  *     save_simulation             Save the simulation once complete.
  *     save_simulation_ajax        AJAX for above function.
  *     latLngChange                Check bounds of lat long input
  *     add_expert_to_map           Add simulation to the map.
  *     updateCatagory              Update the storm catagory data in all tabs.
  */

//dictionarys for layers and groups
var layer_list = [];
var layer_groups = [];

// Setup Zoom Controls
L.Control.zoomHome = L.Control.extend({
    options: {
        position: 'topleft',
        zoomInText: '<i class="fa fa-plus" style="line-height:1.65;"></i>',
        zoomInTitle: 'Zoom in',
        zoomOutText: '<i class="fa fa-minus" style="line-height:1.65;"></i>',
        zoomOutTitle: 'Zoom out',
        zoomHomeText: '<i class="fa fa-home" style="line-height:1.65;"></i>',
        zoomHomeTitle: 'Zoom home'
    },

    onAdd: function (map) {
        var controlName = 'gin-control-zoom', container = L.DomUtil.create('div', controlName + ' leaflet-bar'), options = this.options;

        this._zoomInButton = this._createButton(options.zoomInText, options.zoomInTitle, controlName + '-in', container, this._zoomIn);
        this._zoomHomeButton = this._createButton(options.zoomHomeText, options.zoomHomeTitle, controlName + '-home', container, this._zoomHome);
        this._zoomOutButton = this._createButton(options.zoomOutText, options.zoomOutTitle, controlName + '-out', container, this._zoomOut);

        this._updateDisabled();
        map.on('zoomend zoomlevelschange', this._updateDisabled, this);

        return container;
    },

    onRemove: function (map) {
        map.off('zoomend zoomlevelschange', this._updateDisabled, this);
    },

    _zoomIn: function (e) {
        this._map.zoomIn(e.shiftKey ? 3 : 1);
    },

    _zoomOut: function (e) {
        this._map.zoomOut(e.shiftKey ? 3 : 1);
    },

    _zoomHome: function (e) {
        this._map.setView([home_latitude, home_longitude], home_zoom);
    },

    _createButton: function (html, title, className, container, fn) {
        var link = L.DomUtil.create('a', className, container);
        link.innerHTML = html;
        link.href = '#';
        link.title = title;

        L.DomEvent.on(link, 'mousedown dblclick', L.DomEvent.stopPropagation)
            .on(link, 'click', L.DomEvent.stop)
            .on(link, 'click', fn, this)
            .on(link, 'click', this._refocusOnMap, this);

        return link;
    },

    _updateDisabled: function () {
        var map = this._map, className = 'leaflet-disabled';

        L.DomUtil.removeClass(this._zoomInButton, className);
        L.DomUtil.removeClass(this._zoomOutButton, className);

        if (map._zoom === map.getMinZoom()) {
            L.DomUtil.addClass(this._zoomOutButton, className);
        }
        if (map._zoom === map.getMaxZoom()) {
            L.DomUtil.addClass(this._zoomInButton, className);
        }
    }
});

// add the new control to the map
var zoomHome = new L.Control.zoomHome();
zoomHome.addTo(mymap);

// Setup Scale View
var scale_options = { metric: false, imperial: false, maxWidth: 200 };

//setup units by locality
var language = window.navigator.userLanguage || window.navigator.language;
if (language == "en-US") {
    scale_options.imperial = true;
} else {
    scale_options.metric = true;
}

L.control.scale(scale_options).addTo(mymap);

//unique id for this simulation, and storage for data
var sim_id = 'aimo2wqdb';
var data = null;

//counter for sim seconds
var seconds_running = 0;

//heatmap data
var addressPoints = null;

//heatmap layer
var heatmap = {};

//persistant store for cst
var sat_marker = null;
var marker, polyline, arrow_length;

//saved flag
var sim_saved = false;

var app = new Vue({
    delimiters: ['${', '}'],
    el: '#stormParameters',
    data: {
        longitude: home_longitude,
        latitude: home_latitude,
        angle: 0.0,
        id: "",
        simulation: {
            running: false,
            complete: false,
            workers: -1,
            position: -1,
            initialEstimate: -1,
            currentTime: 0,
        },
        state: { 'wind': false, 'surge': false, 'runup': false},
        opacity: { 'wind': 100.0, 'surge': 100.0, 'runup': 100.0},
        layer: {'wind': undefined, 'surge': undefined, 'runup': undefined},
        model: {
            type: "basic",
            style: 1,
            catagory: 1,
            speed: 30.0,
            pressure: 70,
            radius: 62.5,
            slr: 0.0,
            protection: 1,
            tide: 0.5,
            analysis: 0.0,
            landfall: 48
        },
        mapName: ""
    },
    created: function () {
        this.id = Math.random().toString(36).substr(2, 9);
    },
    methods: {
        setSimulationType: function(type){
            this.model.type = type;
        },
        getSimulationString: function(){
            return this.model.style == 1 ? "Hurricane" : "Nor'easter";
        },
        setStormValues: function(){
            this.model.speed = 50.0;
            switch( this.model.catagory ) {
                case 1:
                    this.model.pressure = 25.0;
                    this.model.radius = 33.0;
                    break;
                case 2:
                    this.model.pressure = 40.0;
                    this.model.radius = 37.0;
                    break;
                case 3:
                    this.model.pressure = 55.0;
                    this.model.radius = 50.0;
                    break;
                case 4:
                    this.model.pressure = 70.0;
                    this.model.radius = 50.0;
                    break;
                case 5:
                    this.model.pressure = 85.0;
                    this.model.radius = 40.0;
                    break;
            }
        },
        latLngChange: function() {
            //test non numeric
            if (isNaN(this.latitude)) {
                this.latitude = 40.6848037;
            }

            if( isNaN(this.longitude) ){
                this.longitude = -73.9654541;
            }

            //test bounds
            if (this.latitude > 45) {
                this.latitude = 45.0000000;
            } else if (this.latitude < 34) {
                this.latitude = 34.0000000;
            }

            if (this.longitude > -63) {
                this.longitude = -63.0000000;
            } else if (this.longitude < -77) {
                this.longitude = -77.0000000;
            }

            //update widget
            var angle = this.angle / 180 * Math.PI;

            var sat_offset_y = Math.cos(angle) * arrow_length * 0.78;
            var sat_offset_x = Math.sin(angle) * arrow_length;

            var latlngs = [
                [this.latitude + sat_offset_y * 0.13, this.longitude + sat_offset_x * 0.13],
                [this.latitude + sat_offset_y, this.longitude + sat_offset_x]
            ];
            polyline.setLatLngs(latlngs);

            sat_marker.angle = angle;
            sat_marker.setLatLng(new L.LatLng(this.latitude + sat_offset_y, this.longitude + sat_offset_x), { draggable: 'true' });
            sat_marker.setRotationAngle(angle * 180 / Math.PI);

            marker.setLatLng(new L.LatLng(this.latitude, this.longitude), { draggable: 'true' });
        },
        startSimulation: function(){
            const lat_past_point = this.latitude - Math.cos(this.angle * Math.PI / 180) * 0.015;
            const long_past_point = this.longitude - Math.sin(this.angle * Math.PI / 180) * 0.015;

            var data = {
                "index_SLT": [1,1],
                "index_W": 1,
                "indicator": this.model.style,
                "SLR": this.model.slr * 0.3048,
                "tide": this.model.tide,
                "surge_file": "heatmap.json",
                "wind_file": "wind_heatmap.json",
                "runup_file":"transect_line.json",
                "workspace_file": "",

                // Nor'easter Only
                "ne_strength": this.model.catagory,

                // Hurricane Only
                "timeMC": this.model.landfall,
                "lat_track":  [lat_past_point, parseFloat(this.latitude)],
                "long_track": [long_past_point, parseFloat(this.longitude)],
                "protection": this.model.protection,
                "index_prob": this.model.analysis,
                "param": [
                    parseFloat(this.latitude), parseFloat(this.longitude), this.angle, this.model.pressure, this.model.speed * 1.852001, this.model.radius * 1.609344
                ]
            }

            if( this.model.style == 1 ){
                data["storm_type"] = "Hurricane";
            }else{
                data["storm_type"] = "Nor'easter";
            }

            console.log(JSON.stringify(data));

            fetch("/queue/single?name=" + owner.toString() + "&id=" + this.id, {
                method: 'POST', // or 'PUT'
                body: JSON.stringify(data), // data can be `string` or {object}!
                headers:{
                  'Content-Type': 'application/json'
                }
            }).then(response => {
                console.log('Success:', response);

                this.simulation.running = true;
                setTimeout(() => this.waitForCompletion(), 5000);
                seconds_running = 0;

                document.getElementById("save_button").classList.add("disabled");
                document.getElementById("dropdownMenuAddToMap").classList.add("disabled");
                sim_saved = false;
            }).catch(error => {
                this.simulation.running = false;
                console.error('Error:', error);
            });
        },
        waitForCompletion: function(){
            fetch("/queue/status?name=" + owner.toString() + "&id=" + this.id, {
                method: 'GET',
                headers:{
                  'Content-Type': 'application/json'
                }
            }).then(res => res.json()).then(response => {
                console.log("EXPERT SIMULATION -- SUCCESS.", response);
                this.simulation.workers = response.workers;
                this.simulation.position = response.position;

                if( this.simulation.initialEstimate == -1 ){
                    this.simulation.initialEstimate = this.estimateRemaining();
                }

                if (response.complete == false) {
                    this.simulation.currentTime += 5;
                    setTimeout(() => this.waitForCompletion(), 5000);
                } else if (response.complete == true) {
                    $.notify("Calculation complete!", "success");

                    this.simulation.running = false;
                    this.simulation.complete = true;
                    this.update();
                }
            }).catch(error => {
                this.simulation.running = false;
                console.error('Error:', error);
            });
        },
        estimateRemaining: function(){
            return (300.0 + ((300.0 * (this.simulation.position.toFixed(2)-1.0)) / this.simulation.workers.toFixed(2))) - this.simulation.currentTime;
        },
        percentRemaining: function(){
            return ((this.simulation.initialEstimate.toFixed(2) - this.estimateRemaining().toFixed(2)) / this.simulation.initialEstimate.toFixed(2)) * 100.0;
        },
        saveSimulation: function(mapName){
            if( !this.simulation.complete ) {
                alert("Plase run a sumulation before saving!");
                return;
            }

            this.mapName = mapName;
            document.getElementById("sim_description").value = "Simulation " + this.id;

            if( !sim_saved ){
                $('#saveSim-1').modal('show');
            }else{
                var map_data = {
                    'sim_id': this.id,
                };
                console.log("Map clicked " + JSON.stringify(map_data) + "," + this.mapName);

                //Do ajax
                $.ajax({
                    type: "POST",
                    url: "/map/" + this.mapName + "/settings/",
                    data: {
                        'sim_id': this.id,
                        'action': 'add_simulation',
                        'add_layer': this.id + "_surge"
                    },
                    dataType: "json",
                    success: function (result) {
                        console.log("SAVING TO MAP -- SUCCESS!" + result.saved);
                        $.notify("Simulation saved to map " + this.mapName, "success");
                        window.location.href = "/map/" + this.mapName + "/";
                    }.bind(this),
                    error: function (result) {
                        console.log("ERROR:", result)
                        $.notify("Error saving simulation to map", "error");
                    }
                });
            }
        },
        saveSimulationAJAX: function(){
            //get inputs from Modal
            var sim_desc = document.getElementById("sim_description").value;
            var sim_name = document.getElementById("sim_name").value;

            const lat_past_point = this.latitude - Math.cos(this.angle * Math.PI / 180) * 0.015;
            const long_past_point = this.longitude - Math.sin(this.angle * Math.PI / 180) * 0.015;

            var data = {
                "index_SLT": [1,1],
                "index_W": 1,
                "indicator": this.model.style,
                "SLR": this.model.slr * 0.3048,
                "tide": this.model.tide,
                "surge_file": "heatmap.json",
                "wind_file": "wind_heatmap.json",
                "runup_file":"transect_line.json",
                "workspace_file": "",

                // Nor'easter Only
                "ne_strength": this.model.catagory,

                // Hurricane Only
                "timeMC": this.model.landfall,
                "lat_track":  [lat_past_point, this.latitude],
                "long_track": [long_past_point, this.longitude],
                "protection": this.model.protection,
                "index_prob": this.model.analysis,
                "param": [
                    this.latitude, this.longitude, this.angle, this.model.pressure, this.model.speed * 1.852001, this.model.radius * 1.609344
                ]
            };

            if( this.model.style == 1 ){
                data["storm_type"] = "Hurricane";
            }else{
                data["storm_type"] = "Nor'easter";
            }

            //store data
            $.ajax({
                type: "POST",
                url: "/store/",
                data: {
                    'data': JSON.stringify(data),
                    'user_id': owner.toString(),
                    'sim_id': this.id,
                    'description': sim_desc,
                    'sim_name': sim_name
                },
                //dataType: "json",
                success: function (result) {
                    console.log("SIMULATION STORE -- SUCCESS!");

                    $('#saveSim-1').modal('hide');
                    $.notify("Simulation data saved", "success");

                    //flag saved
                    sim_saved = true
                },
                error: function (result) {
                    console.log("SIMULATION STORE ERROR:", result)

                    $('#saveSim-1').modal('hide');
                    $.notify("Simulation data was not saved", "error");
                }
            });

            if( this.mapName ) {
                var map_data = {
                    'sim_id': this.id,
                };
                console.log("Map clicked " + JSON.stringify(map_data) + "," + this.mapName);

                //Do ajax
                $.ajax({
                    type: "POST",
                    url: "/map/" + this.mapName + "/settings/",
                    data: {
                        'sim_id': this.id,
                        'action': 'add_simulation',
                        'add_layer': this.id + "_surge"
                    },
                    dataType: "json",
                    success: function (result) {
                        console.log("SAVING TO MAP -- SUCCESS!" + result.saved);
                        $.notify("Simulation saved to map " + this.mapName, "success");
                        window.location.href = "/map/" + this.mapName + "/";
                    }.bind(this),
                    error: function (result) {
                        console.log("ERROR:", result)
                        $.notify("Error saving simulation to map", "error");
                    }
                });
            }
        },
        update: function(){
            this.update_wind();
            this.update_surge();
            this.update_runup();
        },
        update_wind: function(){
            if( this.state.wind && this.simulation.complete ){
                const path = userSimulationPath + "/" + owner.toString() + "/" + this.id + "/wind.geojson"
                fetch(path).then(res => res.json()).then(data => {
                    if( this.layer.wind !== undefined ){
                        mymap.removeLayer(this.layer.wind);
                    }
                    this.layer.wind = L.geoJSON(data, {
                        style: function(feature) {
                            return {
                                fillColor: feature.properties['fill'],
                                fillOpacity: feature.properties['fill-opacity'],
                                stroke: false,
                                opacity: feature.properties['opacity']
                            };
                        }
                    }).addTo(mymap);
                    //add_wind_legend(mymap);
                }).catch(error => {
                    console.error('Error:', error);
                });
            }
          },
          update_surge: function(){
            if( this.state.surge && this.simulation.complete ){
                const path = userSimulationPath + "/" + owner.toString() + "/" + this.id + "/surge.geojson"
                fetch(path).then(res => res.json()).then(data => {
                    if( this.layer.surge !== undefined ){
                        mymap.removeLayer(this.layer.surge);
                    }
                    this.layer.surge = L.geoJSON(data, {
                        style: function(feature) {
                            return {
                                fillColor: feature.properties['fill'],
                                fillOpacity: feature.properties['fill-opacity'],
                                stroke: false,
                                opacity: feature.properties['opacity']
                            };
                        }
                    }).addTo(mymap);
                    //add_surge_legend(mymap);
                }).catch(error => {
                    console.error('Error:', error);
                });
            }
          },
          update_runup: function(){
            if( this.state.runup && this.simulation.complete ){
                const path = userSimulationPath + "/" + owner.toString() + "/" + this.id + "/transect_line.json"
                fetch(path).then(res => res.json()).then(data => {
                    if( this.layer.runup !== undefined ){
                        mymap.removeLayer(this.layer.runup);
                    }
                    this.layer.runup = L.geoJSON(data, {
                        style: function(feature) {
                            console.log(feature.properties.type)
                            if( feature.properties.type.includes("Boundary") ) {
                                return {color: "blue"};
                            }else{
                                return {color: "green"};
                            }
                        },
                        filter: function(feature, layer){
                            return feature.properties.type != "Transect";
                        }
                    }).addTo(mymap);

                    add_runup_legend(mymap);
                }).catch(error => {
                    console.error('Error:', error);
                });
            }
          },
        toggle_wind: function(){
            if(this.state.wind == true){
                this.update_wind();
            }else{
                mymap.removeLayer(this.layer.wind);
                this.layer.wind = undefined;
                del_wind_legend();
            }
          },
          toggle_surge: function(){
            if(this.state.surge == true){
                this.update_surge();
            }else{
                mymap.removeLayer(this.layer.surge);
                this.layer.surge = undefined;
                del_surge_legend();
            }
          },
          toggle_runup: function(){
            if(this.state.runup == true){
                this.update_runup();
            }else{
                mymap.removeLayer(this.layer.runup);
                this.layer.runup = undefined;
                del_runup_legend();
            }
          },
          setOpacity: function(type){
            this.layer[type].setStyle({opacity: this.opacity[type]/100.0, fillOpacity: this.opacity[type]/100.0});
          }
    }
})


//create storm track icons
function storm_track_visable(onOff){
    if (onOff){
        mymap.addLayer(sat_marker);
        mymap.addLayer(marker);
        mymap.addLayer(polyline);
    }else{
        mymap.removeLayer(sat_marker);
        mymap.removeLayer(marker);
        mymap.removeLayer(polyline);
    }
}
function create_storm_track(onOff) {

    if (onOff) {
        //get zoom
        arrow_length = 0.015 * Math.pow(2, 13 - mymap.getZoom());

        //load Latitude/Longitude and angle
        var latitude = app.latitude;
        var longitude = app.longitude;
        var angle = app.angle / 180 * Math.PI;

        //test current inputs
        if (isNaN(latitude) || isNaN(longitude) || isNaN(angle)) {
            alert("Please enter correct value for Latitude/Longitude.");
            return;
        }

        /*//disable button etc. if inputs OK
        //document.getElementById("cst").classList.add("disabled");
        document.getElementById("latitude").disabled = true;
        document.getElementById("longitude").disabled = true;
        document.getElementById("angle").disabled = true;
        document.getElementById("angleslider").disabled = true;*/

        // Add in a crosshair for the map
        var crosshairIcon = L.icon({
            iconUrl: '/static/images/icon_storm-dir-start.png',
            iconSize:     [24, 24], // size of the icon
            iconAnchor:   [12, 12], // point of the icon which will correspond to marker's location
        });

        // Add in a crosshair for the map
        var arrowIcon = L.icon({
            iconUrl: '/static/images/icon_storm-dir-arrow.png',
            iconSize:     [20, 20], // size of the icon
            iconAnchor:   [10, 10], // point of the icon which will correspond to marker's location
        });

        //create markers
        //set offsets to current angle
        //note 1 degree is different for Lat/Long so need to correct
        //Latitude is fixed at around 69 miles/degree
        //Longitude is cosine(Latitude) * miles/degree at equator
        //so here cosine(40') * 69.172
        //ratio is around 0.78
        //Explaination: https://gis.stackexchange.com/questions/142326/calculating-longitude-length-in-miles
        var sat_offset_y = Math.cos(angle) * arrow_length * 0.78; //
        var sat_offset_x = Math.sin(angle) * arrow_length;

        // create a polyline between markers
        var latlngs = [
            [latitude + sat_offset_y * 0.13, longitude + sat_offset_x * 0.13],
            [latitude + sat_offset_y, longitude + sat_offset_x]
        ];
        polyline = L.polyline(latlngs, {color: '#eb6b00', weight: 3, opacity: 1.0 }).addTo(mymap);

        //create landfall marker
        marker = new L.marker([latitude, longitude], { draggable: 'true', icon: crosshairIcon });
        marker.on('drag', function (event) {
            //get pos
            var marker = event.target;
            var position = marker.getLatLng();

            //bounds
            var lat_lng_changed = false;

            //check bounds lat
            if (position.lat > 45) {
                position.lat = 45;
                lat_lng_changed = true;
            } else if (position.lat < 34) {
                position.lat = 34;
                lat_lng_changed = true;
            }

            //check bounds long
            if (position.lng > -63) {
                position.lng = -63;
                lat_lng_changed = true;
            } else if (position.lng < -77) {
                position.lng = -77;
                lat_lng_changed = true;
            }

            //reset
            if (lat_lng_changed) marker.setLatLng(position);

            //fix for first use of angle
            if(!sat_marker.angle){
                sat_marker.angle = app.angle * Math.PI / 180;
            }

            //get zoom
            var arrow_length = 0.015 * Math.pow(2, 13 - mymap.getZoom());

            //load angle, calc position
            var angle = sat_marker.angle;
            sat_offset_y = Math.cos(angle) * arrow_length * 0.78;
            sat_offset_x = Math.sin(angle) * arrow_length;

            //fix sat/line pos
            sat_marker.setLatLng(new L.LatLng(position.lat + sat_offset_y, position.lng+sat_offset_x),{draggable:'true'});
            polyline.setLatLngs([[position.lat + sat_offset_y * 0.13, position.lng + sat_offset_x * 0.13],[position.lat + sat_offset_y, position.lng + sat_offset_x]]);

            //update text boxes
            app.latitude = position.lat.toFixed(7);
            app.longitude = position.lng.toFixed(7).toString();
        });
        mymap.addLayer(marker);

        //create direction marker
        sat_marker = new L.marker([latitude + sat_offset_y, longitude + sat_offset_x], { draggable: 'true', rotationAngle: angle * 180 / Math.PI, icon: arrowIcon });
        sat_marker.on('drag', function (event) {
            //get zoom
            var arrow_length = 0.015 * Math.pow(2, 13 - mymap.getZoom());

            //get pos
            var position = marker.getLatLng();
            var sat_pos = sat_marker.getLatLng();

            //find angle
            var angle = Math.atan2(sat_pos.lng - position.lng, sat_pos.lat - position.lat);
            if (angle < -1.047197551196598) angle = -1.047197551196598;
            if (angle > 0.698131700797732) angle = 0.698131700797732;
            sat_offset_y = Math.cos(angle) * arrow_length * 0.78;
            sat_offset_x = Math.sin(angle) * arrow_length;

            //save angleslider
            sat_marker.angle = angle;

            //constrain to circle
            sat_marker.setLatLng(new L.LatLng(position.lat + sat_offset_y, position.lng + sat_offset_x), { draggable: 'true' });

            //rotate icon
            sat_marker.setRotationAngle(angle * 180 / Math.PI);

            //and line
            polyline.setLatLngs([[position.lat + sat_offset_y * 0.13, position.lng + sat_offset_x * 0.13],[position.lat + sat_offset_y, position.lng+sat_offset_x]]);

            //update angle box
            app.angle = Math.round(angle * 180 / Math.PI);

        });
        mymap.addLayer(sat_marker);
    } else {
        //remove storm tract
        mymap.removeLayer(sat_marker);
        mymap.removeLayer(marker);
        mymap.removeLayer(polyline);
        sat_marker = null;
    }
}

//update marker if valid
mymap.on('zoomend', function (event) {
    //test if marker valid
    if (sat_marker == null) {
        return;
    }

    //fix for first use of angle
    if(!sat_marker.angle){
        sat_marker.angle = app.angle * Math.PI / 180;
    }

    arrow_length = 0.015 * Math.pow(2, 13 - mymap.getZoom());

    var angle = sat_marker.angle;
    var sat_offset_y = Math.cos(angle) * arrow_length * 0.78;
    var sat_offset_x = Math.sin(angle) * arrow_length;

    var position = marker.getLatLng();
    sat_marker.setLatLng(new L.LatLng(position.lat + sat_offset_y, position.lng + sat_offset_x), { draggable: 'true' });
    sat_marker.setRotationAngle(angle * 180 / Math.PI);

    polyline.setLatLngs([[position.lat + sat_offset_y * 0.13, position.lng + sat_offset_x * 0.13],[position.lat + sat_offset_y, position.lng+sat_offset_x]]);
});

//save expert simulation data
function save_simulation() {
    //normal code, has simulation run?
    if (data == null) {//} || heatmap.length == 0){
        alert("Plase run a sumulation before saving!");
        return;
    }

    //check if sim saved
    if (sim_saved) {
        alert("This simulation has been saved!");
        return;
    }
    //preset values and open modal
    document.getElementById("sim_description").value = "Simulation " + sim_id;

    $('#saveSim-1').modal('show');
}

//add the current simulation to a map
function add_expert_to_map(object) {
    //need to save first!
    if (!sim_saved) {
        save_simulation();
    }

    //save map and sim data
    var map_data = {
        'sim_id': sim_id,
    };

    console.log("Map clicked " + JSON.stringify(map_data) + "," + object.innerHTML);

    //Do ajax
    $.ajax({
        type: "POST",
        url: "/map/" + object.name + "/settings/",
        data: {
            'sim_id': sim_id,
            'action': 'add_simulation',
            'add_layer': sim_id + "_surge"
        },
        dataType: "json",
        success: function (result) {
            console.log("SAVING TO MAP -- SUCCESS!" + result.saved);
            //now auto save so dont flag
            $.notify("Simulation saved to map " + object.innerHTML, "success");

            //jump to page
            window.location.href = "/map/" + object.name + "/";
        },
        error: function (result) {
            console.log("ERROR:", result)
            $.notify("Error saving simulation to map", "error");
        }
    });
}