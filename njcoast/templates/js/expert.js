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
  *     updateInput                 Links slider/text box values
  *     update_storm_track          Update arrow widget for storm landfall/direction
  *     update_widget               Update arrow widget for user input
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

//function to start simulation, POSTs input data to the server
function start_expert_simulation() {

    //load Latitude/Longitude
    var latitude = parseFloat(document.getElementById("latitude").value);
    var longitude = parseFloat(document.getElementById("longitude").value);

    //test
    if (isNaN(latitude) || isNaN(longitude)) {
        alert("Please enter correct value for Latitude/Longitude.");
        return;
    }

    //load Angle
    var angle = parseFloat(document.getElementById("angle").value);

    //load time to landfall
    var input_ttl = parseFloat(document.getElementById("input_ttl").value);

    //load pressure
    var input_cp = parseFloat(document.getElementById("input_cp").value);

    //load speed
    var input_vf = parseFloat(document.getElementById("input_vf").value) * 1.852001;

    //load radius
    var input_rm = parseFloat(document.getElementById("input_rm").value) * 1.609344;

    //load SLR
    var input_slr = parseFloat(document.getElementById("input_slr").value) * 0.3048;

    console.log("start sim with lat " + latitude.toString() + "long " + longitude.toString());

    //disable button
    document.getElementById("calculate").classList.add("disabled");
    document.getElementById("spinner").style.display = "block";

    //create unique id to tag socket comms
    sim_id = Math.random().toString(36).substr(2, 9);

    //get tide
    var tide = document.querySelector('input[name="tide"]:checked');

    //get protection
    var protection = parseFloat(document.querySelector('input[name="protection"]:checked').value);

    //get analysis
    var analysis = document.querySelector('input[name="analysis"]:checked');

    //get storm type
    var storm_type = "Nor'easter";
    //if (document.getElementById('stormbadge').innerHTML.indexOf("Hurricane") >= 0) {
        storm_type = "Hurricane";
    //}

    //get point along path
    var lat_past_point = latitude - Math.cos(angle * Math.PI / 180) * 0.015;
    var long_past_point = longitude - Math.sin(angle * Math.PI / 180) * 0.015;

    console.log("tide " + tide + ", protection " + protection + ", analysis " + analysis + ", storm " + storm_type);

    data = {
        "index_SLT": [1, 1],
        "index_W": 1,
        "index_prob": parseFloat(analysis.value),
        "indicator": 1,
        "param": [latitude, longitude, angle, input_cp, input_vf, input_rm],
        "timeMC": input_ttl,
        "lat_track": [lat_past_point, latitude],
        "long_track": [long_past_point, longitude],
        "SLR": parseFloat(input_slr),
        "tide": parseFloat(tide.value),
        "tide_td": tide.parentNode.innerText,
        "protection": protection,
        "analysis": analysis.parentNode.innerText,
        "storm_type": storm_type,
        "surge_file": "heatmap.json",
        "wind_file": "wind_heatmap.json",
        "runup_file":"transect_line.json",
        "workspace_file": ""
    };

    console.log(JSON.stringify(data));

    $.ajax({
        type: "POST",
        url: "/queue/single?name=" + owner.toString() + "&id=" + sim_id,
        data: JSON.stringify(data),
        contentType: 'application/json',
        success: function (result) {
            console.log("EXPERT SIMULATION -- SUCCESS!", result);
            $.notify("Calculation running", "success");

            //start checking
            setTimeout(get_expert_data_to_server, 5000);
            seconds_running = 0;

            //disable save button? #TODO And Add to map?
            document.getElementById("save_button").classList.add("disabled");
            document.getElementById("dropdownMenuAddToMap").classList.add("disabled");

            //flag that not saved
            sim_saved = false;

        },
        error: function (result) {
            console.log("EXPERT SIMULATION -- ERROR:", result)
            $.notify("Error running calculation!", "error");

            //re-enable if error
            document.getElementById("calculate").classList.remove("disabled");
            document.getElementById("spinner").style.display = "none";
        }
    });
}

//function to check status of simulation, GETs status (AJAX)
function get_expert_data_to_server() {
    $.ajax({
        type: "GET",
        url: "/queue/status?name=" + owner.toString() + "&id=" + sim_id,
        //data: data,
        dataType: "json",
        //contentType: 'application/json',
        success: function (result) {
            console.log("EXPERT SIMULATION -- SUCCESS.", result);
            //$.notify( result.annotations + " annotations saved", "success");
            //data = JSON.parse(result);
            if (result.complete == false) {
                //update time
                seconds_running += 1;
                console.log("Complete FALSE, time " + seconds_running * 5 + " seconds.");

                //timeout? Set to 3 minutes
                if (seconds_running > 180) {
                    $.notify("Calculation timed out.", "error");

                    //re-enable button and remove spinner
                    document.getElementById("calculate").classList.remove("disabled");
                    document.getElementById("spinner").style.display = "none";
                } else {
                    //re-run if still waiting
                    setTimeout(get_expert_data_to_server, 5000);
                }

            } else if (result.complete == true) {
                console.log("Complete TRUE, time " + seconds_running + " seconds.");

                //re-enable if complete
                document.getElementById("calculate").classList.remove("disabled");
                document.getElementById("spinner").style.display = "none";
                $.notify("Calculation complete!", "success");

                //load data via Ajax
                //surge
                if (document.getElementById("surge_checkbox").checked) {
                    //load_expert_data_to_server(data.surge_file, "surge");
                    load_expert_data_to_server( "surge_line.json", "srg_line");
                }

                //wind
                if (document.getElementById("wind_checkbox").checked) {
                    load_expert_data_to_server(data.wind_file, "wind");
                }

                if (document.getElementById("runup_checkbox").checked) {
                    load_expert_data_to_server(data.runup_file, "runup");
                }
            }
        },
        error: function (result) {
            console.log("EXPERT SIMULATION -- ERROR:", result)
            $.notify("Error running calculation.", "error");

            //re-enable if error
            document.getElementById("calculate").classList.remove("disabled");
            document.getElementById("spinner").style.display = "none";
        }
    });
}

//load/unload heatmap
function load_heatmap(object) {
    //normal code, has simulation run?
    if (data != null) {
        //if clicked, load
        if (object.checked && !(object.name in heatmap)) {
            //load it
            if (object.name == "surge") {
                //load_expert_data_to_server(data.surge_file, object.name);
                load_expert_data_to_server( "surge_line.json", "srg_line");
            } else if (object.name == "wind") {
                load_expert_data_to_server(data.wind_file, object.name);
            } else {
                load_expert_data_to_server(data.runup_file, object.name);
            }
        } else if (!object.checked) {
            if( object.name in heatmap ) {
                mymap.removeLayer(heatmap[object.name]);
                delete heatmap[object.name];
            }

            if (object.name == "surge") {
                mymap.removeLayer(heatmap["srg_line"]);
                delete heatmap["srg_line"];

                del_surge_legend();
            } else if (object.name == "wind") {
                del_wind_legend();
            } else if (object.name == "runup") {
                del_runup_legend();
            }
        }
    }
}

//AJAX function to get heatmap from S3 bucket
function load_expert_data_to_server(file_name, json_tag) {
    $.ajax({
        type: "GET",
        url: userSimulationPath + "/" + owner.toString() + "/" + sim_id + "/" + file_name,
        //data: data,
        dataType: "json",
        //contentType: 'application/json',
        success: function (data) {
            console.log("EXPERT SIMULATION LOAD -- SUCCESS.", data);

            //save data
            addressPoints = data;

            if (json_tag == "surge") {
                //heatmap[json_tag] = create_surge_heatmap(addressPoints.surge, 'overlayPane').addTo(mymap);
                add_surge_legend(mymap);
            } else if (json_tag == "wind") {
                heatmap[json_tag] = create_wind_heatmap(addressPoints.wind, 'overlayPane').addTo(mymap);
                add_wind_legend(mymap);
            } else if( json_tag.includes("srg")){
                heatmap[json_tag] = L.geoJSON(addressPoints, {
                    style: function(feature) {
                        switch (feature.properties.height) {
                            case 0: return {color: "black"};
                            case 3: return {color: "yellow"};
                            case 6: return {color: "orange"};
                            case 9: return {color: "red"};
                        }
                    },
                    filter: function(feature, layer) {
                        return feature.properties.height <= 9;
                    }
                }).addTo(mymap);
                add_surge_legend(mymap);
            } else {
                heatmap[json_tag] = L.geoJSON(addressPoints, {
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
            }

            $.notify("Heatmap loaded", "success");

            //enable save button? #TODO And Add to map?
            document.getElementById("save_button").classList.remove("disabled");
            document.getElementById("dropdownMenuAddToMap").classList.remove("disabled");
        },
        error: function (data) {
            console.log("EXPERT SIMULATION LOAD -- ERROR:", data)
            $.notify("Failed to load heatmap.", "error");
        }
    });
}

//auxiliary functions to link html input devices

//slider text box updates
function updateInput(e) {
    var sibling = e.previousElementSibling || e.nextElementSibling;
    sibling.value = e.value;
    e.value = sibling.value;
}

//update storm track arrow
function update_storm_track(object){
    //fix sibling
    updateInput(object);

    //angle?
    if(object.id == 'angle' || object.id == 'angleslider'){
        console.log("angle "+object.value);

        //update tracker widget
        update_widget();
    }
}

//update widget if inputs change
function update_widget(){
    //load Latitude/Longitude and angle
    var latitude = parseFloat(document.getElementById("latitude").value);
    var longitude = parseFloat(document.getElementById("longitude").value);
    var angle = parseFloat(document.getElementById("angle").value) / 180 * Math.PI;

    //calc offset
    var sat_offset_y = Math.cos(angle) * arrow_length * 0.78; //
    var sat_offset_x = Math.sin(angle) * arrow_length;

    // move polyline between markers
    var latlngs = [
        [latitude + sat_offset_y * 0.13, longitude + sat_offset_x * 0.13],
        [latitude + sat_offset_y, longitude + sat_offset_x]
    ];

    //actually set
    polyline.setLatLngs(latlngs);

    //fix sat marker
    sat_marker.angle = angle;

    //constrain to circle
    sat_marker.setLatLng(new L.LatLng(latitude + sat_offset_y, longitude + sat_offset_x), { draggable: 'true' });

    //rotate icon
    sat_marker.setRotationAngle(angle * 180 / Math.PI);

    //fix marker
    marker.setLatLng(new L.LatLng(latitude, longitude), { draggable: 'true' });

}

//create storm track icons
function create_storm_track(onOff) {

    if (onOff) {
        //get zoom
        arrow_length = 0.015 * Math.pow(2, 13 - mymap.getZoom());

        //load Latitude/Longitude and angle
        var latitude = parseFloat(document.getElementById("latitude").value);
        var longitude = parseFloat(document.getElementById("longitude").value);
        var angle = parseFloat(document.getElementById("angle").value) / 180 * Math.PI;

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
                sat_marker.angle = document.getElementById("angleslider").value * Math.PI / 180;
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
            document.getElementById("latitude").value = position.lat.toFixed(7).toString();
            document.getElementById("longitude").value = position.lng.toFixed(7).toString();
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
            document.getElementById("angle").value = Math.round(angle * 180 / Math.PI);
            document.getElementById("angleslider").value = Math.round(angle * 180 / Math.PI);

        });
        mymap.addLayer(sat_marker);
    } else {
        //if unchecked then remove and re-enable
        document.getElementById("latitude").disabled = false;
        document.getElementById("longitude").disabled = false;
        document.getElementById("angle").disabled = false;
        document.getElementById("angleslider").disabled = false;

        //remove storm tract
        mymap.removeLayer(sat_marker);
        mymap.removeLayer(marker);
        mymap.removeLayer(polyline);
        sat_marker = null;
    }
}

//update marker if valid
mymap.on('zoomend', function (event) {
    //console.log("Zoomstart "+mymap.getZoom()+","+angle);
    //console.log(event.target._animateToCenter.lat);

    //test if marker valid
    if (sat_marker == null) {
        return;
    }

    //fix for first use of angle
    if(!sat_marker.angle){
        sat_marker.angle = document.getElementById("angleslider").value * Math.PI / 180;
    }

    //get zoom
    arrow_length = 0.015 * Math.pow(2, 13 - mymap.getZoom());

    //get pos
    var position = marker.getLatLng();
    var sat_pos = sat_marker.getLatLng();

    //load angle, calc position
    var angle = sat_marker.angle;
    var sat_offset_y = Math.cos(angle) * arrow_length * 0.78;
    var sat_offset_x = Math.sin(angle) * arrow_length;

    //constrain to circle
    sat_marker.setLatLng(new L.LatLng(position.lat + sat_offset_y, position.lng + sat_offset_x), { draggable: 'true' });

    //rotate icon
    sat_marker.setRotationAngle(angle * 180 / Math.PI);

    //and line
    polyline.setLatLngs([[position.lat + sat_offset_y * 0.13, position.lng + sat_offset_x * 0.13],[position.lat + sat_offset_y, position.lng+sat_offset_x]]);
    //}
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

    //var sim_desc = prompt("Please enter a simulation description", "Simulation " + sim_id);

    //preset values and open modal
    document.getElementById("sim_description").value = "Simulation " + sim_id;

    $('#saveSim-1').modal('show');

    /*if (sim_desc == null || sim_desc == "") {
        console.log("User cancelled the prompt.");
        return;
    }

    //do actual save if we get here
    save_simulation_ajax(sim_desc, "");*/
}

//save expert simulation data to back end via ajax
function save_simulation_ajax() {

    //get inputs from Modal
    var sim_desc = document.getElementById("sim_description").value;
    var sim_name = document.getElementById("sim_name").value;

    //test
    /*//create unique id to tag socket comms
    sim_id = Math.random().toString(36).substr(2, 9);

    //preset data
    data = {
      "index_SLT": [1,1],
      "index_W": 0,
      "index_prob": 1,
      "indicator": 1,
      "param": [40.4417743, -74.1298643, 3, 75, 22, 5],
      "timeMC": 23,
      "lat_track": 41.000493,
      "long_track": -72.610756,
      "SLR": 1.0,
      "tide": 0,
      "surge_file": "heatmap.json",
      "workspace_file": ""
  };*/

    //store data
    $.ajax({
        type: "POST",
        url: "/store/",
        data: {
            'data': JSON.stringify(data),
            'user_id': owner.toString(),
            'sim_id': sim_id,
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

}

function latLngChange(object) {
    console.log("LatLong " + object.id + "," + object.value);
    var latlngvalue = parseFloat(object.value);

    //test non numeric
    if (isNaN(latlngvalue)) {
        if (object.id == "latitude") {
            object.value = "40.6848037";
        } else {
            object.value = "-73.9654541";
        }
    }

    //test bounds
    if (object.id == "latitude") {
        if (latlngvalue > 45) {
            object.value = "45.0000000";
        } else if (latlngvalue < 34) {
            object.value = "34.0000000";
        }
    } else {
        if (latlngvalue > -63) {
            object.value = "-63.0000000";
        } else if (latlngvalue < -77) {
            object.value = "-77.0000000";
        }
    }

    //update widget
    update_widget();
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

var app = new Vue({
    delimiters: ['${', '}'],
    el: '#stormParameters',
    data: {
        longitude: home_longitude,
        latitude: home_latitude,
        angle: 0.0,
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
        }
    },
    created: function () {
        
    },
    methods: {
        setSimulationType: function(type){
            this.model.type = type;
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
        startSimulation: function(){
            var data = {
                "index_SLT": [1,1],
                "index_W": 1,
                "indicator": 1,
                "SLR": this.model.slr * 0.3048,
                "tide": this.model.tide,
                "sim_type": this.model.style,
                "surge_file": "heatmap.json",
                "wind_file": "wind_heatmap.json",
                "runup_file":"transect_line.json",
                "workspace_file": ""
            }

            if( this.model.style === 2 ){
                data.ne_strength = this.model.catagory;
            }else{
                const lat_past_point = this.latitude - Math.cos(this.angle * Math.PI / 180) * 0.015;
                const long_past_point = this.longitude - Math.sin(this.angle * Math.PI / 180) * 0.015;

                data.param = [
                    this.latitude, this.longitude, 90.0, this.model.pressure, this.model.speed * 1.852001, this.model.radius * 1.609344
                ]
                data.timeMC = this.model.landfall;
                data.lat_track = [lat_past_point, this.latitude];
                data.long_track = [long_past_point, this.longitude];
                data.protection = this.model.protection;
                data.index_prob = this.model.analysis;
            }

            console.log(JSON.stringify(data));
        }
    }
}) 