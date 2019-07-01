/*
 * Purpose:            js file for map template, uses leaflet maps for GIS display.
 * Authors:            Beth Caldwell, Caleb Reinking, Chris Sweet
 * Org:                CRC at Notre Dame
 * Date:               04/01/2018
 *
 * Associated files:   map.html    main html for map page,
 *
 * Description:        Provides functionality to load leaflet map, display layers,
 *                     live storm information and simulation data.
 *
 * Functions:
 *  $(document).ready       Adds Open Street View tiles to map and loads layers and their state.
 *  get_layers_from_server  Loads layers via AJAX call to views.py
 *  process_layers          pull the layer groups out and call the appropriate function
 *                          for layer group or layer to be added to the menu.
 *  add_layer_group_to_menu Add layers to LHS menu under collapsable headings.
 *  add_layer_to_menu       Actual layer add, called from process_layers.
 *  load_map                Get current map info. from server (views.py)
 *  apply_settings          Apply map settings such as active layers, central view coordinates,
 *                          zoom level etc. Called from load_map.
 *  load_heatmap_from_s3    Load heatmap from S3 bucket contating simulation results.
 *  dataURLtoBlob           Creates blob from URL, used in creation of thumbnail from
 *                          current map view.
 *  save_map                Save current state of map.
 *  save_shared_with        Save who we are sharing our map with, called after selection of user.
 *  load_simulation_data    Loads data for a selected simulation (run up, wind model etc.)
 *                          Called from load_map.
 *  remove_simulation       Remove simulation from view.
 *  map_changed             Auto save map if changed.
 *  mymap.on('zoomend','dragend'... Functions attached to map to flag map has changed.
 */

//fix for callable js
//If annotate_map_id not defined then disable load/save and sharing.
//Latest code has auto saving so load/save irrelevant
if( annotate_map_id == null ){
    $("#save_map").addClass("disabled");
    $("#load_map").addClass("disabled");
    $("#share_map").addClass("disabled");
}

//variable for heatmap
var heatmap = {};

//dictionary of simulations
var simulations = [];

//dictionary of selected layers
var layers_selected = [];

//flag to stop map re-load during initialization
var initial_load = true;

//dictionarys for layer list and groups
var layer_list = [];
var layer_groups = [];

var storm_layer_dict = {};

//prevent map from being recognized as touchable, stops lorge annotate symbols
L.Browser.touch = false;

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

//select the correct units based on locality
var language = window.navigator.userLanguage || window.navigator.language;
if( language == "en-US" ){
    scale_options.imperial = true;
}else{
    scale_options.metric = true;
}

L.control.scale(scale_options).addTo(mymap);

// Add Basemap Pane
mymap.createPane('layer');
mymap.getPane('layer').style.zIndex = 300;
mymap.getPane('layer').style.pointerEvents = 'none';

// Setup Feature Info Click Functionality
if (!Object.keys) {
    Object.keys = (function() {
        'use strict';
        var hasOwnProperty = Object.prototype.hasOwnProperty,
            hasDontEnumBug = !({ toString: null }).propertyIsEnumerable('toString'),
            dontEnums = [
            'toString',
            'toLocaleString',
            'valueOf',
            'hasOwnProperty',
            'isPrototypeOf',
            'propertyIsEnumerable',
            'constructor'
            ],
            dontEnumsLength = dontEnums.length;

        return function(obj) {
        if (typeof obj !== 'function' && (typeof obj !== 'object' || obj === null)) {
            throw new TypeError('Object.keys called on non-object');
        }

        var result = [], prop, i;

        for (prop in obj) {
            if (hasOwnProperty.call(obj, prop)) {
            result.push(prop);
            }
        }

        if (hasDontEnumBug) {
            for (i = 0; i < dontEnumsLength; i++) {
            if (hasOwnProperty.call(obj, dontEnums[i])) {
                result.push(dontEnums[i]);
            }
            }
        }
        return result;
        };
    }());
}

function titleCase(str) {
    return str.toLowerCase().split(' ').map(function(word) {
        return (word.charAt(0).toUpperCase() + word.slice(1));
    }).join(' ');
}

L.TileLayer.BetterWMS = L.TileLayer.WMS.extend({
      onAdd: function (map) {
        // Triggered when the layer is added to a map.
        //   Register a click listener, then do all the upstream WMS things
        L.TileLayer.WMS.prototype.onAdd.call(this, map);
        map.on('click', this.getFeatureInfo, this);
    },

    onRemove: function (map) {
        // Triggered when the layer is removed from a map.
        //   Unregister a click listener, then do all the upstream WMS things
        L.TileLayer.WMS.prototype.onRemove.call(this, map);
        map.off('click', this.getFeatureInfo, this);
    },

    getFeatureInfo: function (evt) {
        // Make an AJAX request to the server and hope for the best
        var url = this.getFeatureInfoUrl(evt.latlng), showResults = L.Util.bind(this.showGetFeatureInfo, this);
        $.ajax({
            url: url,
            success: function (data, status, xhr) {
                if( data.features[0] != undefined ){
                    var result = "<table class=\"table\">";
                    var keys = Object.keys(data.features[0].properties);
                    for( var i = 0; i < keys.length; i++ ){
                        var value = data.features[0].properties[keys[i]];
                        if( typeof value === 'string' ){
                            value = titleCase(value);
                        }

                        if( value != "" ){
                            result += "<tr><td>" + titleCase(keys[i]) +"</td><td>" + value +"</td></tr>";
                        }
                    }
                    result += "</table>"
                    showResults(null, evt.latlng, result);
                }
            },
            error: function (xhr, status, error) {
                showResults(error);
            }
        });
    },

    getFeatureInfoUrl: function (latlng) {
        // Construct a GetFeatureInfo request URL given a point
        var point = this._map.latLngToContainerPoint(latlng, this._map.getZoom()),
        size = this._map.getSize(),

        params = {
            request: 'GetFeatureInfo',
            service: 'WMS',
            srs: 'EPSG:4326',
            styles: this.wmsParams.styles,
            transparent: this.wmsParams.transparent,
            version: this.wmsParams.version,
            format: this.wmsParams.format,
            bbox: this._map.getBounds().toBBoxString(),
            height: size.y,
            width: size.x,
            layers: this.wmsParams.layers,
            query_layers: this.wmsParams.layers,
            info_format: 'application/json'
        };

        params[params.version === '1.3.0' ? 'i' : 'x'] = point.x;
        params[params.version === '1.3.0' ? 'j' : 'y'] = point.y;

        return this._url + L.Util.getParamString(params, this._url, true);
    },

    showGetFeatureInfo: function (err, latlng, content) {
        if (err) { console.log(err); return; } // do nothing if there's an error

        // Otherwise show the content in a popup, or something.
        L.popup({maxWidth: 800, maxHeight: window.innerHeight * 0.4})
        .setLatLng(latlng)
        .setContent(content)
        .openOn(this._map);
    }
});

L.tileLayer.betterWms = function (url, options) {
    return new L.TileLayer.BetterWMS(url, options);
};

var toTitleCase = function (str) {
	str = str.toLowerCase().split(' ');
	for (var i = 0; i < str.length; i++) {
		str[i] = str[i].charAt(0).toUpperCase() + str[i].slice(1);
	}
	return str.join(' ');
};

//~~~~run once ready~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
$(document).ready(function () {

    L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw', {
        maxZoom: 18,
        attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, ' +
        '<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
        'Imagery © <a href="http://mapbox.com">Mapbox</a>',
        id: 'mapbox.streets'
    }).addTo(mymap);

    //get layers
    //get_layers_from_server();

    var layersVue = new Vue({
        delimiters: ['${', '}'],
        el: '#gisLayers',
        data: {
            group: {}
        },
        created: function () {
            this.fetchData();
        },
        methods: {
          fetchData: function () {
            $.get("/api/my_layers/", (data) => {
                for( var i = 0; i < data.layers.length; i++){
                    Vue.set(this.group, data.layers[i].group, []);
                };
                for( var i = 0; i < data.layers.length; i++){
                    data.layers[i].enabled = false;
                    data.layers[i].opacity = 100;
                    if( data.layers[i].group.toLowerCase().replace(/\s+/g, '') == "imagerybasemapsearthcover" ) {
                        data.layers[i].maplayer = L.tileLayer.wms(data.layers[i].layer_link, {
                            layers: data.layers[i].layer, 
                            transparent: true, 
                            format: 'image/png',
                            tiled: true
                        });
                        layer_list.push(data.layers[i]);
                    }else {
                        data.layers[i].maplayer = L.tileLayer.betterWms(data.layers[i].layer_link, {
                            layers: data.layers[i].layer, 
                            transparent: true, 
                            format: 'image/png',
                            pane: 'layer',
                            tiled: true
                        });
                        layer_list.push(data.layers[i]);
                    }

                    this.group[data.layers[i].group].push(data.layers[i]);
                };
            });
          },
          toggleLayer: function(group, layer){
            for(var i = 0 ; i < this.group[group].length; i++) {
                if( this.group[group][i].id == layer ){
                    console.log("found matching layer: " + layer);
                    if( this.group[group][i].enabled ){
                        layers_selected.push(layer);
                        this.group[group][i].maplayer.addTo(mymap);
                    }else{
                        var index = layers_selected.indexOf(layer);
                        if (index !== -1) layers_selected.splice(index, 1);
                        mymap.removeLayer(this.group[group][i].maplayer);
                    }
                    if(!initial_load) map_changed();
                }
            }
          },
          setOpacity: function(group, layer){
            for(var i = 0 ; i < this.group[group].length; i++) {
                if( this.group[group][i].id == layer ){
                    this.group[group][i].maplayer.setOpacity(this.group[group][i].opacity/100.0);
                    console.log("Setting Layer " + layer + " opacity to " + this.group[group][i].opacity/100.0);
                }
            }
          }
        }
    })

    var app = new Vue({
        delimiters: ['${', '}'],
        el: '#activeStormGroup',
        data: {
            items: []
        },
        created: function () {
            this.fetchData();
        },
        methods: {
          fetchData: function () {
            var path = (userSimulationPath + "/metadata.json").replace("/simulation/", "/");
            $.get(path, (data) => {
                for(var i = 0; i < data.active_storms.length; i++ ){
                    data.active_storms[i]['protection'] = '1';
                    data.active_storms[i]['tides'] = '0.5';
                    data.active_storms[i]['analysis'] = '0.0';
                    data.active_storms[i]['state'] = { 'wind': false, 'surge': false, 'runup': false};
                    data.active_storms[i]['opacity'] = { 'wind': 100.0, 'surge': 100.0, 'runup': 100.0};
                    data.active_storms[i]['following'] = false;
                    if( data.active_storms[i]['out_of_bounds'] == undefined ){
                        data.active_storms[i]['out_of_bounds'] = false;
                    }
                    data.active_storms[i]['name'] = toTitleCase(data.active_storms[i]['name']);
                }

                // Sort Data
                data.active_storms.sort(function(a, b) {
                    if( a.out_of_bounds && !b.out_of_bounds ){
                        return 1;
                    }

                    if( !a.out_of_bounds && b.out_of_bounds ){
                        return -1;
                    }

                    if( Date.parse(a.last_updated) < Date.parse(b.last_updated) ){
                        return 1;
                    }
                    
                    if( Date.parse(a.last_updated) > Date.parse(b.last_updated) ){
                        return -1;
                    }

                    return 0;
                });

                // Insert
                for(var i = 0; i < data.active_storms.length; i++ ){
                    this.items.push(data.active_storms[i]);
                }
            });
          },
          dateString: function(last_updated){
            var result = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(Date.parse(last_updated));
            return result.toString();
          },
          setFollow: function(index, value){
            this.items[index].following = value;
            if( value == true ){
                var path = this.items[index].s3_base_path + "input.geojson";
                $.get(path, (data) => {
                    if (data) {
                        if( path in storm_layer_dict ) {
                            mymap.removeLayer(storm_layer_dict[path]);
                        }
                        storm_layer_dict[path] = L.geoJSON(data, {
                            style: function(feature) {
                                if( feature.properties.radius != undefined ){
                                    return {fillColor:"red"};
                                }
                            },
                            pointToLayer: function (feature, latlng) {
                                var options = {
                                    radius: 8,
                                    fillColor: "blue",
                                    color: "#000",
                                    weight: 1,
                                    opacity: 1,
                                    fillOpacity: 0.8
                                };
                                return L.circleMarker(latlng, options);
                            },
                            onEachFeature: function (featureData, featureLayer) {
                                featureLayer.on('click', function () {
                                  var result = "<table class=\"table\">";
                                  var keys = Object.keys(featureData.properties);
                                  for( var i = 0; i < keys.length; i++ ){
                                    var value = featureData.properties[keys[i]];
                                    if( typeof value === 'string' ){
                                        value = titleCase(value);
                                    }

                                    if( value != "" ){
                                        result += "<tr><td>" + titleCase(keys[i]) +"</td><td>" + value +"</td></tr>";
                                    }
                                  }
                                  result += "</table>"
                                
                                  // Otherwise show the content in a popup, or something.
                                  L.popup({maxWidth: 800, maxHeight: window.innerHeight * 0.4})
                                    .setLatLng(featureLayer._latlng)
                                    .setContent(result)
                                    .openOn(this._map);
                                });
                              }
                        }).addTo(mymap);
                    }
                });
            }else{
                var path = this.items[index].s3_base_path + "input.geojson";
                if( path in storm_layer_dict ) {
                    mymap.removeLayer(storm_layer_dict[path]);
                }
            }
          },
          update: function(index){
              console.log(JSON.stringify(this.items[index], null, 2));
              this.update_wind(index);
              this.update_surge(index);
              this.update_runup(index);
          },
          update_wind: function(index){
            var path = this.path_string(index, "wind_heatmap");
            $.get(path, (data) => {
                if (data) {
                    // Remove old layer
                    if( path in storm_layer_dict ) {
                        mymap.removeLayer(storm_layer_dict[path]);
                    }
                    storm_layer_dict[path] = create_wind_heatmap(data.wind, 'layer').addTo(mymap);

                    // Enable legend
                    add_wind_legend(mymap);
                }
            });
          },
          update_surge: function(index){
            var path = this.path_string(index, "surge_line");
            $.get(path, (data) => {
                if (data) {
                    // Remove old layer
                    if( path in storm_layer_dict ) {
                        mymap.removeLayer(storm_layer_dict[path]);
                    }
                    storm_layer_dict[path] = L.geoJSON(data.surge, {
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

                    // Enable legend
                    add_surge_legend(mymap);
                }
            });
          },
          update_runup: function(index){
            var path = this.path_string(index, "transect_line");
            $.get(path, (data) => {
                if (data) {
                    // Remove old layer
                    if( path in storm_layer_dict ) {
                        mymap.removeLayer(storm_layer_dict[path]);
                    }
                    storm_layer_dict[path] = L.geoJSON(addressPoints, {
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

                    // Enable legend
                    add_runup_legend(mymap);
                }
            });
          },
          path_string: function(index, data_type) {
            var path = this.items[index].s3_base_path + data_type + "__slr_" + parseInt(0 * 10) + "__tide_";
            switch( this.items[index].tides ){
                case '0.0':
                    path += 'zero';
                break;
                case '0.5':
                    path += 'low';
                break;
                case '1.0':
                    path += 'high';
                break;
            }
            path += "__analysis_";
            switch( this.items[index].analysis ){
                case '0.0':
                    path += 'deterministic';
                break;
                case '0.5':
                    path += 'expected';
                break;
                case '0.1':
                    path += 'extreme';
                break;
            }
            return path + ".json";
          },
          update_wind: function(index){
            const path = this.path_string(index, "wind").replace('.json', '.geojson');
            fetch(path).then(res => res.json()).then(data => {
                if( path in storm_layer_dict ) {
                    mymap.removeLayer(storm_layer_dict[path]);
                }
                storm_layer_dict[path] = L.geoJSON(data, {
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
          },
          update_surge: function(index){
            const path = this.path_string(index, "surge").replace('.json', '.geojson');
            fetch(path).then(res => res.json()).then(data => {
                if( path in storm_layer_dict ) {
                    mymap.removeLayer(storm_layer_dict[path]);
                }
                storm_layer_dict[path] = L.geoJSON(data, {
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
          },
          update_runup: function(index){
            const path = this.path_string(index, "transect_line");
            fetch(path).then(res => res.json()).then(data => {
                if( path in storm_layer_dict ) {
                    mymap.removeLayer(storm_layer_dict[path]);
                }
                storm_layer_dict[path] = L.geoJSON(data, {
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
          },
          setOpacity: function(index, type){
            var path = ""
            switch( type ){
                case 'wind':
                    path = this.path_string(index, "wind").replace('.json', '.geojson');
                    break;
                case 'surge':
                    path = this.path_string(index, "surge").replace('.json', '.geojson');
                    break;
                case 'runup':
                    path = this.path_string(index, "transect_line");
                    break;
            }
            if( path in storm_layer_dict ) {
                const percent = this.items[index].opacity[type]/100.0;
                if( path.includes('.geojson') ){
                    storm_layer_dict[path].setStyle({'opacity' : percent, 'fillOpacity': percent });
                }else{
                    storm_layer_dict[path].setOpacity(percent);
                }
            }
          }
        }
    })

    var historic = new Vue({ 
        delimiters: ['${', '}'],
        el: '#historicStormGroup',
        data: {
            items: [],
            state: { 'wind': false, 'surge': false, 'runup': false},
        },
        created: function () {
            this.fetchData();
        },
        methods: {
          fetchData: function () {
            var path = (userSimulationPath + "/historic_metadata.json").replace("/simulation/", "/");
            $.get(path, (data) => {
                for(var i = 0; i < data.active_storms.length; i++ ){
                    data.active_storms[i]['protection'] = '1';
                    data.active_storms[i]['tides'] = '0.5';
                    data.active_storms[i]['analysis'] = '0.0';
                    data.active_storms[i]['state'] = { 'wind': false, 'surge': false, 'runup': false};
                    data.active_storms[i]['opacity'] = { 'wind': 100.0, 'surge': 100.0, 'runup': 100.0};
                    data.active_storms[i]['following'] = false;
                    if( data.active_storms[i]['out_of_bounds'] == undefined ){
                        data.active_storms[i]['out_of_bounds'] = false;
                    }
                    data.active_storms[i]['name'] = toTitleCase(data.active_storms[i]['name']);
                }

                // Sort Data
                data.active_storms.sort(function(a, b) {
                    if( a.out_of_bounds && !b.out_of_bounds ){
                        return 1;
                    }

                    if( !a.out_of_bounds && b.out_of_bounds ){
                        return -1;
                    }

                    if( Date.parse(a.last_updated) < Date.parse(b.last_updated) ){
                        return 1;
                    }
                    
                    if( Date.parse(a.last_updated) > Date.parse(b.last_updated) ){
                        return -1;
                    }

                    return 0;
                });

                // Insert
                for(var i = 0; i < data.active_storms.length; i++ ){
                    this.items.push(data.active_storms[i]);
                }
            });
          },
          dateString: function(last_updated){
            var result = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(Date.parse(last_updated));
            return result.toString();
          },
          setFollow: function(index, value){
            this.items[index].following = value;
            if( value == true ){
                var path = this.items[index].s3_base_path + "cone.json";
                $.get(path, (data) => {
                    if (data) {
                        if( 'cone' in storm_layer_dict ) {
                            mymap.removeLayer(storm_layer_dict['cone']);
                        }
                        storm_layer_dict['cone'] = L.geoJSON(data, {
                            style: function(feature) {
                                if( feature.properties.radius != undefined ){
                                    return {fillColor:"red"};
                                }
                            },
                            pointToLayer: function (feature, latlng) {
                                var options = {
                                    radius: 8,
                                    fillColor: "blue",
                                    color: "#000",
                                    weight: 1,
                                    opacity: 1,
                                    fillOpacity: 0.8
                                };
                                return L.circleMarker(latlng, options);
                            },
                            onEachFeature: function (featureData, featureLayer) {
                                featureLayer.on('click', function () {
                                  var result = "<table class=\"table\">";
                                  var keys = Object.keys(featureData.properties);
                                  for( var i = 0; i < keys.length; i++ ){
                                    var value = featureData.properties[keys[i]];
                                    if( typeof value === 'string' ){
                                        value = titleCase(value);
                                    }

                                    if( value != "" ){
                                        result += "<tr><td>" + titleCase(keys[i]) +"</td><td>" + value +"</td></tr>";
                                    }
                                  }
                                  result += "</table>"
                                
                                  // Otherwise show the content in a popup, or something.
                                  L.popup({maxWidth: 800, maxHeight: window.innerHeight * 0.4})
                                    .setLatLng(featureLayer._latlng)
                                    .setContent(result)
                                    .openOn(this._map);
                                });
                              }
                        }).addTo(mymap);
                    }
                });
            }else{
                if( 'cone' in storm_layer_dict ) {
                    mymap.removeLayer(storm_layer_dict['cone']);
                }
            }
          },
          update: function(index){
              this.update_wind(index);
              this.update_surge(index);
              this.update_runup(index);
          },
          update_wind: function(index){
            if( this.state.wind == true ){
                const path = this.path_string(index, "wind").replace('.json', '.geojson');
                fetch(path).then(res => res.json()).then(data => {
                    if( path in storm_layer_dict ) {
                        mymap.removeLayer(storm_layer_dict['wind']);
                    }
                    storm_layer_dict['wind'] = L.geoJSON(data, {
                        style: function(feature) {
                            return {
                                fillColor: feature.properties['fill'],
                                fillOpacity: feature.properties['fill-opacity'],
                                stroke: false,
                                opacity: feature.properties['opacity']
                            };
                        }
                    }).addTo(mymap);
                    this.setOpacity(index, 'wind');
                    //add_wind_legend(mymap);
                }).catch(error => {
                    console.error('Error:', error);
                });
            }
          },
          update_surge: function(index){
            if( this.state.surge == true ){
                const path = this.path_string(index, "surge").replace('.json', '.geojson');
                fetch(path).then(res => res.json()).then(data => {
                    if( 'surge' in storm_layer_dict ) {
                        mymap.removeLayer(storm_layer_dict['surge']);
                    }
                    storm_layer_dict['surge'] = L.geoJSON(data, {
                        style: function(feature) {
                            return {
                                fillColor: feature.properties['fill'],
                                fillOpacity: feature.properties['fill-opacity'],
                                stroke: false,
                                opacity: feature.properties['opacity']
                            };
                        }
                    }).addTo(mymap);
                    this.setOpacity(index, 'surge');
                    //add_surge_legend(mymap);
                }).catch(error => {
                    console.error('Error:', error);
                });
            }
          },
          update_runup: function(index){
            if( this.state.runup == true ){
                const path = this.path_string(index, "transect_line");
                fetch(path).then(res => res.json()).then(data => {
                    if( 'runup' in storm_layer_dict ) {
                        mymap.removeLayer(storm_layer_dict['runup']);
                    }
                    storm_layer_dict['runup'] = L.geoJSON(data, {
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
                    this.setOpacity(index, 'runup');

                    add_runup_legend(mymap);
                }).catch(error => {
                    console.error('Error:', error);
                });
            }
          },
          path_string: function(index, data_type) {
            var path = this.items[index].s3_base_path + data_type + "__slr_" + parseInt(1 * 10) + "__tide_";
            switch( this.items[index].tides ){
                case '0.0':
                    path += 'zero';
                break;
                case '0.5':
                    path += 'low';
                break;
                case '1.0':
                    path += 'high';
                break;
            }
            path += "__analysis_";
            switch( this.items[index].analysis ){
                case '0.0':
                    path += 'deterministic';
                break;
                case '0.5':
                    path += 'expected';
                break;
                case '0.1':
                    path += 'extreme';
                break;
            }
            return path + ".json";
          },
          toggle_wind: function(index){
            if(this.items[index]['state']['wind'] == true){
                this.state.wind = true;
                this.update_wind(index);
            }else{
                const path = this.path_string(index, "wind").replace('.json', '.geojson');
                if( path in storm_layer_dict ) {
                    mymap.removeLayer(storm_layer_dict[path]);
                    del_wind_legend();
                }
                this.state.wind = false;
            }
          },
          toggle_surge: function(index){
            if(this.items[index]['state']['surge'] == true){
                this.state.surge = true;
                this.update_surge(index);
            }else{
                var path = this.path_string(index, "surge").replace('.json', '.geojson');
                if( path in storm_layer_dict ) {
                    mymap.removeLayer(storm_layer_dict[path]);
                    del_surge_legend();
                }
                this.state.surge = false;
            }
          },
          toggle_runup: function(index){
            if(this.items[index]['state']['runup'] == true){
                this.state.runup = true;
                this.update_runup(index);
            }else{
                var path = this.path_string(index, "transect_line");
                if( path in storm_layer_dict ) {
                    mymap.removeLayer(storm_layer_dict[path]);
                    del_runup_legend();
                }
                this.state.runup = false;
            }
          },
          setOpacity: function(index, type){
            if( type in storm_layer_dict ) {
                const percent = this.items[index].opacity[type]/100.0;
                if( type == 'wind' || type == 'surge' ){
                    storm_layer_dict[type].setStyle({'opacity' : percent, 'fillOpacity': percent });
                }else{
                    storm_layer_dict[type].setOpacity(percent);
                }
            }
          }
        }
    })

    if( annotate_map_id != null ){
        load_map(); 
    }
});

//used for features not yet implemented
$(function () {
$('.beta-feature-not-available').tooltip(
  {
    title: "Feature not available at this time",
    placement: "top",
    width: '300px'
  });
});

//load map data via AJAX call
function load_map(){
  $.ajax({
      type: "GET",
      url: "/map/" + annotate_map_id + "/settings/",
      data: {},
      dataType: "json",
      success: function(result) {
          console.log("LOADING SETTINGS -- SUCCESS!");

          //apply settings
          apply_settings(result);
      },
      error: function(result) {
          console.log("ERROR:", result)
          $.notify("Error loading map settings", "error");
      }
  });
}

//apply stored settings to current map
function apply_settings(data){

  //test if I own the map
  if(data.owner == 'other'){
      //console.log("not mine");
      //diasble save map and share
      //document.getElementById("save_map").classList.add("disabled");
      document.getElementById("share_map").classList.add("disabled");
  }

  //if layers the set them
  if("layers_selected" in data){
      console.log("Layers selected length " + data.layers_selected.length);

      //setup selected layers
      for(var i=0; i<data.layers_selected.length; i++){
          //find by id, click if not checked
          if(document.getElementById(data.layers_selected[i])){
              if(!document.getElementById(data.layers_selected[i]).checked){
                document.getElementById(data.layers_selected[i]).click();//checked = true;

                //highlight group name
                var header_id = $("#"+data.layers_selected[i]).closest("ul").prop("id") + '_name';
                //if not bolded then bold it
                var header_span = document.getElementById(header_id);
                if(!header_span.innerHTML.includes('<b>')){
                    header_span.innerHTML = '<b>' + header_span.innerHTML + '</b>';
                }
              }
          }else{
              //push it anyway
              layers_selected.push(data.layers_selected[i]);
          }
      }
  }

  //#load simulations
  //<li>
  //<p><input id="simulation-1" name="abcdef" type="checkbox" value="on" data-toggle="popover" data-placement="right"> abcdef</p>
  //</li>
  if("simulations" in data){
      //save sims
      simulations = data.simulations;

      //clear current data
      document.getElementById('simulation_container').innerHTML = "";

      //load sims
      for(var i=0; i<data.simulations.length; i++){
          console.log("sim "+data.simulations[i]);

          //load simulation
          load_simulation_data(data.simulations[i]);

      }
  }

  //if map view then apply
  if("latitude" in data && "longitude" in data && "zoom" in data){
      //set map parameters
      mymap.setView([data.latitude, data.longitude], data.zoom);
  }

  //load map descriptions
  if("name" in data && "description" in data){
      document.getElementById("map_name").innerHTML = data.name;
      document.getElementById("map_description").innerHTML = data.description;
  }

   //load users shared with
  if("shared_with" in data){

      //console.log("Shares "+data.shared_with[0]);
      for(var i=0; i<data.shared_with.length;i++){
          //get list of users
          var more_elmts;
          var counter = 1;

          //loop until end of list
          do{
             more_elmts = document.getElementById('sharemodal-'+counter++);

             //if exists and checked then save
             if(more_elmts){
                if(more_elmts.name == data.shared_with[i]){
                    more_elmts.checked = true;
                }
             }
          }while(more_elmts)
      }
  }

  //test if I own the map and set end of initial load if so
  if(data.owner != 'other'){
      //flag end of initial load
      initial_load = false;
  }

}

//load simulation heatmap if clicked
function load_simulation(user_id, object){

  //if clicked, load
  if(object.checked && !(object.id in heatmap)){
    load_heatmap_from_s3(user_id, object.name, object.value, object.id);
      var index = layers_selected.indexOf(object.id);
      if (index == -1){
          layers_selected.push(object.id);
          if(!initial_load) map_changed();
      }
  }

    if(!object.checked){
        if( object.id in heatmap ) {
            mymap.removeLayer(heatmap[object.id]);
            delete heatmap[object.id];
        }

        if(object.id.includes("surge")){
            del_surge_legend();
        }else if(object.id.includes("wind")){
            del_wind_legend();
        }else if(object.id.includes("runup")){
            del_runup_legend();
        }

        //remove from layers
        if (layers_selected.indexOf(object.id) !== -1){
            layers_selected.splice(index, 1);
            if(!initial_load) map_changed();
            console.log("Removed "+object.name+","+object.id);
        }
    }
}

//get heatmap from S3 bucket
function load_heatmap_from_s3(owner, simulation, filename, sim_type){
  $.ajax({
    type: "GET",
    url: userSimulationPath + "/" + owner + "/" + simulation + "/" + filename,
    dataType: "json",
    success: function (data) {
        console.log("EXPERT SIMULATION LOAD -- SUCCESS.");

        //save data
        var addressPoints = data;

        //get correct
        switch( filename ){
            case "surge.geojson":
                heatmap[sim_type] = L.geoJSON(addressPoints, {
                    style: function(feature) {
                        return {
                            fillColor: feature.properties['fill'],
                            fillOpacity: feature.properties['fill-opacity'],
                            stroke: false,
                            opacity: feature.properties['opacity']
                        };
                    },
                    pane: 'layer'
                }).addTo(mymap);
                break;
            case "surge_line.json":
                heatmap[sim_type] = L.geoJSON(addressPoints, {
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
                    },
                    pane: 'layer'
                }).addTo(mymap);
                add_surge_legend(mymap);
                break;
            case "wind.geojson":
                heatmap[sim_type] = L.geoJSON(addressPoints, {
                    style: function(feature) {
                        return {
                            fillColor: feature.properties['fill'],
                            fillOpacity: feature.properties['fill-opacity'],
                            stroke: false,
                            opacity: feature.properties['opacity']
                        };
                    },
                    pane: 'layer'
                }).addTo(mymap);
                break;
            case "wind_heatmap.json":  
                heatmap[sim_type] = create_surge_heatmap(addressPoints.wind,'layer').addTo(mymap);
                add_surge_legend(mymap);
                break;
            default:
                heatmap[sim_type] = L.geoJSON(addressPoints, {
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
                    },
                    pane: 'layer'
                }).addTo(mymap);
                add_runup_legend(mymap);
        }
    },
    error: function (xhr, status, error) {
        console.log("EXPERT SIMULATION LOAD -- ERROR:", status + " " + error + " " + xhr.status + " " + xhr.statusText)
        $.notify("Failed to load heatmap.", "error");
    }
});
}

//create blob from thumbnail, used to get snapshot of map for map explorer
function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
}

//save the current map settings/info
function save_map(notify) {
    //get general map data
    //save map state
    var map_data = {
        'latitude': mymap.getCenter().lat,
        'longitude': mymap.getCenter().lng,
        'zoom': mymap.getZoom(),
        'layers_selected': layers_selected,
        'simulations': simulations
    };

    if (annotate_map_id != null) {
        map_data.map_id = annotate_map_id;
    }

    console.log("Layers " + JSON.stringify(map_data));

    //setup form for AJAX magic
    //create formdata to allow us to send file
    var formData = new FormData();
    formData.append('settings', JSON.stringify(map_data));
    formData.append('action', 'save');

    //in case we cant get the thumbnail lets just save the other information
    //do AJAX call to save the map
    $.ajax({
        type: "POST",
        url: "/map/" + annotate_map_id + "/settings/",
        data: formData,
        dataType: "json",
        //use contentType, processData to allow us to send thumbnail image
        contentType: false,
        processData: false,
        success: function success(result) {
            console.log("SETTING STORE -- SUCCESS!" + result.saved);
            //now auto save so dont flag
            if (notify) {
                $.notify("Settings saved", "success");
            }
        },
        error: function error(result) {
            console.log("ERROR:", result);
            if (notify) {
                $.notify("Error saving map settings", "error");
            }
        }
    });
    //end ajax

    //create formdata to allow us to send file
    var formDataI = new FormData();
    formDataI.append('action', 'save_image');

    //lets do an image save in case leafletImage fails
    //generate image and then save map information
    leafletImage(mymap, function(err, canvas) {
        // now you have canvas
        //console.log("Error "+err);

        //~~~~Get the blob for the image~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        //aspect ratio
        var dimensions = mymap.getSize();
        var aspect = dimensions.x / dimensions.y;

        //set sizes
        var height = 180;
        var width = 240;

        if(aspect > 1.3333){
            height = 240 / aspect;
        }else{
            width = 180 * aspect;
        }

        //
        var resizedCanvas = document.createElement("canvas");
        var resizedContext = resizedCanvas.getContext("2d");

        resizedCanvas.height = 180;
        resizedCanvas.width = 240;

        var context = canvas.getContext("2d");

        resizedContext.drawImage(canvas, (240 - width) / 2, (180 - height) / 2, width, height);

        var blob = dataURLtoBlob(resizedCanvas.toDataURL());
        //~~~~END Get the blob for the image~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

        //add to formdata to allow us to send file
        var rand_filename = 'thumbnail-' + Math.floor(Math.random() * 100000) + '.png';
        formDataI.append('thumbnail', blob, rand_filename);

        //do AJAX call to save the map
        $.ajax({
            type: "POST",
            url: "/map/" + annotate_map_id + "/settings/",
            data: formDataI,
            dataType: "json",
            //use contentType, processData to allow us to send thumbnail image
            contentType: false,
            processData: false,
            success: function success(result) {
                console.log("SETTING STORE -- SUCCESS!" + result.saved);
                //now auto save so dont flag
                if (notify) {
                    $.notify("Settings saved", "success");
                }
            },
            error: function error(result) {
                console.log("ERROR:", result);
                if (notify) {
                    $.notify("Error saving map settings", "error");
                }
            }
        });
        //end ajax

    });
}

//save map sharing users
function save_shared_with(){
  //get list of users
  var more_elmts;
  var counter = 1;

  var data = [];

  //loop until end of list
  do{
      more_elmts = document.getElementById('sharemodal-'+counter++);

      //if exists and checked then save
      if(more_elmts){
          if(more_elmts.checked){
              data.push(more_elmts.name);
          }
      }
  }while(more_elmts)

  console.log("Data "+JSON.stringify(data));

  //send to backend
  $.ajax({
      type: "POST",
      url: "/map/" + annotate_map_id + "/settings/",
      data: {
          'shares': JSON.stringify(data),
          'action': 'share'
      },
      dataType: "json",
      success: function(result) {
          console.log("SETTING SHARES -- SUCCESS!" + result.saved);

          //fade out modal
          $("#shareMap-1").modal("hide");

          //now auto save so dont flag
          $.notify("Shares saved", "success");
      },
      error: function(result) {
          console.log("ERROR:", result)

          //fade out modal
          $("#shareMap-1").modal("hide");

          $.notify("Error saving shares", "error");
      }
  });

}

//load simulation data into storm-vis page
function load_simulation_data(sim_id){

  $.ajax({
      type: "GET",
      url: "/store/",
      data: {
          data: sim_id,
          action: "get_sim_id_data"
      },
      dataType: "json",
      success: function(result) {

          console.log("GETTING SIMULATION -- SUCCESS! ");

          //get heatmap from S3
          if(result.status){
              //get JSON data
              var data = JSON.parse(result.data.data);

              //storm heading, use newer name if exists
              var sim_heading = data.storm_type + " Run #" + result.data.id;
              if(result.data.sim_name){
                  sim_heading = result.data.sim_name;
              }

              var badge = 'n-badge';
              var badge_text = 'N';
              if(data.storm_type.toLowerCase() == "hurricane"){
                  badge = 'h-badge';
                  badge_text = 'H';
              }

              //files available to enable checkboxes
              var surge = "disabled";
              var surge_file = "";
              if( data.surge_file ){
                surge = "";

                var request = new XMLHttpRequest();
                request.open('HEAD', userSimulationPath + "/" + result.user_id + "/" + sim_id + "/surge.geojson", false);  // `false` makes the request synchronous
                request.send(null);

                if (request.status === 200) {
                    surge_file = "surge.geojson"
                }else{
                    surge_file = "surge_line.json"
                }
              }

              var wind = "disabled";
              var wind_file = "";
              if( data.wind_file ){
                wind = "";

                var request = new XMLHttpRequest();
                request.open('HEAD', userSimulationPath + "/" + result.user_id + "/" + sim_id + "/wind.geojson", false);
                request.send(null);

                if (request.status === 200) {
                    wind_file = "wind.geojson"
                }else{
                    wind_file = "wind_heatmap.json"
                }
              }
              
              var runup = "disabled";
              var runup_file = "";
              if(data.runup_file){
                  runup = "";
                  runup_file = data.runup_file;
              }

              var modified = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(Date.parse(result.data.modified));

              var sTide = "";
                switch( data.tide ){
                case 1:
                    sTide = "High";
                    break;
                case 0.5:
                    sTide = "Typical";
                    break;
                case 0:
                    sTide = "None";
                    break;
                }

                
              //generate html
              var html = ``;
              if( data.indicator == 1 ){
                var sProtection = "";
                switch( data.protection ){
                    case 1:
                        sProtection = "Current";
                        break;
                    case 2:
                        sProtection = "Degraded";
                        break;
                    case 3:
                        sProtection = "Compromised";
                        break;
                }
                    
                var sAnalysis = "";
                switch( data.index_prob ){
                    case 0:
                        sAnalysis = "Deterministic";
                        break;
                    case 0.5:
                        sAnalysis = "Probabilistic&nbsp;<span class=\"qualifier\">expected</span>";
                        break;
                    case 0.1: 
                        sAnalysis = "Probabilistic&nbsp;<span class=\"qualifier\">extreme</span>";
                        break;
                }

              html =  `<div id='${sim_id}'>
                      <div class="map-layer-group-heading what-if">
                        <a data-toggle="collapse" href="#storm-${sim_id}" aria-expanded="false" aria-controls="storm-${sim_id}">
                          <i class="fa fa-chevron-right" aria-hidden="true"></i> <div class="${badge}">${badge_text}</div>${sim_heading}<span><i class="fa fa-close" aria-hidden="true" onclick="remove_simulation('${sim_id}');"></i></span>
                        </a>
                      </div>
                      <p class="follow-unfollow">by ${result.data.user_name} • ${modified}</p>
                      <ul class="collapse map-layers" id="storm-${sim_id}">
                          <li><input id="${sim_id}_wind" name="${sim_id}" type="checkbox" value="${wind_file}" onchange="load_simulation(${result.user_id}, this);" ${wind}> Wind Field</li>
                          <li><input id="${sim_id}_surge" name="${sim_id}" type="checkbox" value="${surge_file}" onchange="load_simulation(${result.user_id}, this);" ${surge}> Surge</li>
                          <li><input id="${sim_id}_runup" name="${sim_id}" type="checkbox" value="${runup_file}" onchange="load_simulation(${result.user_id}, this);" ${runup}> Total Run Up</li>
                          <li class="shp-scenario">
                            <span>Sea Level Rise:</span> ${data.SLR * 3.28084} ft<br/>
                            <span>Coastal Protection:</span> ${sProtection}<br/>
                            <span>Tides:</span> ${sTide}<br/>
                            <span>Analysis type:</span> ${sAnalysis}<br/>
                            <span>Description:</span> ${result.data.description}
                          </li>
                      </ul>
                  </div>`;
              }else{
                html =  `<div id='${sim_id}'>
                        <div class="map-layer-group-heading what-if">
                            <a data-toggle="collapse" href="#storm-${sim_id}" aria-expanded="false" aria-controls="storm-${sim_id}">
                                <i class="fa fa-chevron-right" aria-hidden="true"></i> <div class="${badge}">${badge_text}</div>${sim_heading}<span><i class="fa fa-close" aria-hidden="true" onclick="remove_simulation('${sim_id}');"></i></span>
                            </a>
                        </div>
                        <p class="follow-unfollow">by ${result.data.user_name} • ${modified}</p>
                        <ul class="collapse map-layers" id="storm-${sim_id}">
                            <li><input id="${sim_id}_wind" name="${sim_id}" type="checkbox" value="${wind_file}" onchange="load_simulation(${result.user_id}, this);" ${wind}> Wind Field</li>
                            <li><input id="${sim_id}_surge" name="${sim_id}" type="checkbox" value="${surge_file}" onchange="load_simulation(${result.user_id}, this);" ${surge}> Surge</li>
                            <li class="shp-scenario">
                                <span>Sea Level Rise:</span> ${data.SLR * 3.28084} ft<br/>
                                <span>Tides:</span> ${sTide}<br/>
                                <span>Description:</span> ${result.data.description}
                            </li>
                        </ul>
                    </div>`;
              }

              //add to page
              //create div
              var new_div = document.createElement('div');
              new_div.id = sim_id+'_div';
              new_div.innerHTML = html;

              //and add it to current container
              document.getElementById('simulation_container').appendChild(new_div);

              //enable buttons? surge
              var index = layers_selected.indexOf(sim_id+"_surge");
              if (index !== -1){
                  console.log("found "+sim_id);
                  //document.getElementById(sim_id+"_surge").checked = true;
                  document.getElementById(sim_id+"_surge").click();
              }else{
                  console.log("not found "+sim_id+","+layers_selected.length);
              }

              //enable buttons? wind
              index = layers_selected.indexOf(sim_id+"_wind");
              if (index !== -1){
                  console.log("found "+sim_id);
                  document.getElementById(sim_id+"_wind").click();
              }else{
                  console.log("not found "+sim_id+","+layers_selected.length);
              }

              //#TODO runup?
          }
      },
      error: function(result) {
          console.log("ERROR:", result)
          $.notify("Error loading simulation", "error");
      }
  });


}

//remove simulation from storm vis
function remove_simulation(name){
  //get element containing sim data
  var element = document.getElementById(name);

  //remove it
  element.outerHTML = "";

  //remove from list
  var index = simulations.indexOf(name);
  if (index > -1) {
      simulations.splice(index, 1);
  }

  //now remove from database
  //Do ajax
  $.ajax({
      type: "POST",
      url: "/map/" + annotate_map_id + "/settings/",
      data: {
          'sim_id': name,
          'action': 'remove_simulation'
      },
      dataType: "json",
      success: function(result) {
          console.log("REMOVING FROM MAP -- SUCCESS!" + result.saved);

          if(!initial_load) map_changed();

          //now auto save so dont flag
          $.notify("Simulation removed from map " + name, "success");
      },
      error: function(result) {
          console.log("ERROR:", result)
          $.notify("Error removing simulation from map", "error");
      }
  });
}

//function to track map changes and save
function map_changed(){
    save_map(false);
}

//update map changed with zoom
mymap.on('zoomend', function (event) {
    if(!initial_load) map_changed();
});

//if dragging map wait until end before saving
mymap.on('dragend', function() {
    if(!initial_load) map_changed();
});
