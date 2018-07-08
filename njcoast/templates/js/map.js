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

// Setup Feature Info Click Functionality
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
                var err = typeof data === 'string' ? null : data;
                //Fix for blank popup window
                var doc = (new DOMParser()).parseFromString(data, "text/html");
                if (doc.body.innerHTML.trim().length > 0)
                    showResults(err, evt.latlng, data);
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
            info_format: 'text/html'
        };

        params[params.version === '1.3.0' ? 'i' : 'x'] = point.x;
        params[params.version === '1.3.0' ? 'j' : 'y'] = point.y;

        return this._url + L.Util.getParamString(params, this._url, true);
    },

    showGetFeatureInfo: function (err, latlng, content) {
        if (err) { console.log(err); return; } // do nothing if there's an error

        // Otherwise show the content in a popup, or something.
        L.popup({ maxWidth: 800})
        .setLatLng(latlng)
        .setContent(content)
        .openOn(this._map);
    }
});

L.tileLayer.betterWms = function (url, options) {
    return new L.TileLayer.BetterWMS(url, options);
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
    get_layers_from_server();

});

/*
Ajax call to the server. Returns JSON with layers in it.
TODO: Will need to update url to GeoServer eventually
 */
function get_layers_from_server() {
    $.ajax({
        type: "GET",
        url: "/api/my_layers/",
        data: {},
        dataType: "json",
        success: function (result) {
            console.log("GIS LAYERS -- SUCCESS!");
            console.log(result.layers);
            process_layers(result.layers);

            //load map settings after layers loaded #TODO maybe this should be elsewhere?
            if( annotate_map_id != null ){
                load_map();
            }
        },
        error: function (result) {
            console.log("ERROR:", result)
        }
    });
}

/*
Function to pull the layer groups out and call the appropriate function
for layer group or layer to be added to the menu.
 */
function process_layers(layers) {

    layers.forEach(function (item) {
        // Get layer groups
        layer_groups.push(item.group);

    });
    layer_groups = layer_groups.unique();
    console.log(layer_groups);

    layer_groups.forEach(function (group) {
        // Add the layer category group to the menu
       add_layer_group_to_menu(group);

       // For each layer in the layers list, if the group matches the current group
        // add that layer to the unordered list
       layers.forEach(function (layer){
          if(layer.group == group) {
              var ul_object = '#' + camelize(layer.group.toLowerCase());
              add_layer_to_menu(layer, ul_object)
          }
       });
    });

}

/*
The base #layerGroup template is hidden by default. Cloning the template and
it's children allows us to edit the attributes of each #layerGroup individually.

Attributes are formatted in the exact same way as Kristina's mockups to retain functionality.
Could likely be simplified, but camelizing the lowercase strings wasn't too difficult.
 */
function add_layer_group_to_menu(layerGroup) {
    var group_template = $('#layerGroup').clone(true);
    $(group_template).find('span').html(layerGroup);

    //add identifier to highlight group name
    $(group_template).find('span').attr('id', camelize(layerGroup.toLowerCase()) + '_name');

    $(group_template).find('a').attr('href', '#' +
        camelize(layerGroup.toLowerCase())).attr('aria-controls', camelize(layerGroup.toLowerCase()));
    $(group_template).find('ul').attr('id', camelize(layerGroup.toLowerCase()));
    $(group_template).removeClass('hidden');
    $("#gisLayers").append(group_template);
}

/*
Add the individual layers to the menu under the appropriate layer category group.
Params: layer - the layer to add to the menu (complete layer object)
        ul_id - the id of the unordered list in which to append the layer.
 */
function add_layer_to_menu(layer, ul_id) {
    // Create the HTML <li> for each layer and append to the <ul>
    var layer_html = '<li><input id="' + $.trim(layer.id) + '" type="checkbox"> ' + $.trim(layer.name) + '</li>';
    $(ul_id).append(layer_html);
    layer.maplayer = L.tileLayer.wms(layer.layer_link, {layers: layer.layer, transparent: true, format: 'image/png'});
    layer_list.push(layer);

    $('#' + $.trim(layer.id)).click(function () {
        if ($(this).is(':checked')) {
            for(var i=0; i<layer_list.length; i++) {
                if (layer_list[i].id == this.id){
                    console.log("found matching layer: " + this.id);
                    layers_selected.push(this.id);
                    layer_list[i].maplayer.addTo(mymap);
                    if(!initial_load) map_changed();
                }
            }
        } else {
            for(var i=0; i<layer_list.length; i++) {
                if (layer_list[i].id == this.id){
                    console.log("found matching layer: " + this.id);
                    var index = layers_selected.indexOf(this.id);
                    if (index !== -1) layers_selected.splice(index, 1);
                    mymap.removeLayer(layer_list[i].maplayer);
                    if(!initial_load) map_changed();
                }
            }
        }
    });
}

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
      load_heatmap_from_s3(user_id, object.name, object.value, object.id)

      //add to layers if not there
      var index = layers_selected.indexOf(object.id);
      if (index == -1){
          layers_selected.push(object.id);
          if(!initial_load) map_changed();
      }

      if( object.id.includes("surge") ){
        var objid = object.id.replace("surge", "srg_line");
        load_heatmap_from_s3(user_id, object.name, "surge_line.json", objid)
        if (layers_selected.indexOf(objid) == -1){
            layers_selected.push(objid);
            if(!initial_load) map_changed();
        }
      }
  }

    if(!object.checked && object.id in heatmap){
        mymap.removeLayer(heatmap[object.id]);
        delete heatmap[object.id];

        if(object.id.includes("surge")){
            del_surge_legend();
        }else if(object.id.includes("wind")){
            del_wind_legend();
        }

        //remove from layers
        if (layers_selected.indexOf(object.id) !== -1){
            layers_selected.splice(index, 1);
            if(!initial_load) map_changed();
            console.log("Removed "+object.name+","+object.id);
        }

        if( object.id.includes("surge") ){
            var objid = object.id.replace("surge", "srg_line");

            mymap.removeLayer(heatmap[objid]);
            delete heatmap[objid];

            if (layers_selected.indexOf(objid) !== -1){
                layers_selected.splice(index, 1);
                if(!initial_load) map_changed();
                console.log("Removed "+object.name+","+objid);
            }
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
        if(sim_type.includes("surge")){
            heatmap[sim_type] = create_surge_heatmap(addressPoints.surge).addTo(mymap);
            add_surge_legend(mymap);
        }else if(sim_type.includes("wind")){
            heatmap[sim_type] = create_wind_heatmap(addressPoints.wind).addTo(mymap);
            add_wind_legend(mymap);
        }else if( sim_type.includes("srg")){
            heatmap[sim_type] = L.geoJSON(addressPoints, {
                style: function(feature) {
                    switch (feature.properties.height) {
                        case 0: return {color: "blue"};
                        case 3: return {color: "yellow"};
                        case 6: return {color: "orange"};
                        case 9: return {color: "red"};
                        case 12: return {color: "blue"};
                    }
                },
                filter: function(feature, layer) {
                    return feature.properties.height <= 9;
                }
            }).addTo(mymap);
        }else{
            heatmap[sim_type] = L.geoJSON(addressPoints).addTo(mymap);
        }

        //remove heatmap loaded for production
        //$.notify( "Heatmap loaded", "success");
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
              if(data.storm_type.toLowerCase() == "hurricane"){
                  badge = 'h-badge';
              }

              //files available to enable checkboxes
              var surge = "disabled";
              var surge_file = "";
              if(data.surge_file){
                  surge = "";
                  surge_file = data.surge_file;
              }

              var wind = "disabled";
              var wind_file = "";
              if(data.wind_file){
                  wind = "";
                  wind_file = data.wind_file;
              }
              var runup = "disabled";
              var runup_file = "";
              if(data.runup_file){
                  runup = "";
                  runup_file = data.runup_file;
              }

              var modified = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(Date.parse(result.data.modified));

              //generate html
              var html =  `<div id='${sim_id}'>
                      <div class="map-layer-group-heading what-if">
                        <a data-toggle="collapse" href="#storm-${sim_id}" aria-expanded="false" aria-controls="storm-${sim_id}">
                          <i class="fa fa-chevron-right" aria-hidden="true"></i> <div class="${badge}">${sim_heading.charAt(0)}</div>${sim_heading}<span><i class="fa fa-close" aria-hidden="true" onclick="remove_simulation('${sim_id}');"></i></span>
                        </a>
                      </div>
                      <p class="follow-unfollow">by ${result.data.user_name} • ${modified}</p>
                      <ul class="collapse map-layers" id="storm-${sim_id}">
                          <li><input id="${sim_id}_wind" name="${sim_id}" type="checkbox" value="${wind_file}" onchange="load_simulation(${result.user_id}, this);" ${wind}> Wind Field</li>
                          <li><input id="${sim_id}_surge" name="${sim_id}" type="checkbox" value="${surge_file}" onchange="load_simulation(${result.user_id}, this);" ${surge}> Surge</li>
                          <li><input id="${sim_id}_runup" name="${sim_id}" type="checkbox" value="${runup_file}" onchange="load_simulation(${result.user_id}, this);" ${runup}> Total Run Up</li>
                          <li class="shp-scenario"><span>Sea Level Rise:</span> ${data.SLR * 3.28084} ft<br/><span>Coastal Protection:</span> ${data.protection}<br/><span>Tides:</span> ${data.tide_td}<br/><span>Analysis type:</span> ${data.analysis}<br/><span>Description:</span> ${result.data.description}</li>
                      </ul>
                  </div>`;

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
);

//if dragging map wait until end before saving
mymap.on('dragend', function() {
    if(!initial_load) map_changed();
});
